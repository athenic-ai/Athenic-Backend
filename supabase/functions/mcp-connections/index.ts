// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
// @ts-ignore
import { Sandbox } from 'npm:@e2b/code-interpreter';
// @ts-ignore
import { corsHeaders } from '../_shared/configs/cors.ts';
// @ts-ignore
import { ClientType } from 'npm:@supabase/supabase-js/src/types.ts';

// Type fixes for deno environment
interface CustomObject {
  id: string;
  metadata: Record<string, any>;
  [key: string]: any;
}

// API Configuration
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const E2B_API_KEY = Deno.env.get('E2B_API_KEY') || '';
const DEFAULT_MCP_SERVER_PORT = 3000;
const DEFAULT_MCP_SERVER_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Helper function to decrypt sensitive fields
function decryptSensitiveFields(fields: Record<string, string>): Record<string, string> {
  // In the Edge Function, we simply pass through the values since we don't have access
  // to the encryption/decryption utilities
  return fields;
}

// Helper function to generate default environment variables for the MCP server
function generateDefaultEnvs(mcpServerObject: CustomObject, sandbox: any): Record<string, string> {
  const port = mcpServerObject.metadata.port || DEFAULT_MCP_SERVER_PORT;
  return {
    // Make the server listen on all interfaces (0.0.0.0) inside the sandbox
    MCP_HOST: '0.0.0.0',
    MCP_PORT: port.toString(),
    // Add the sandbox ID for tracing/debugging
    E2B_SANDBOX_ID: sandbox.sandboxId,
  };
}

// Helper function to create a new Supabase client with admin privileges
function createSupabaseAdmin(): ClientType {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Helper function to encrypt sensitive fields
function encryptSensitiveFields(fields: Record<string, string>): Record<string, string> {
  // In the Edge Function, we simply pass through the values
  return fields;
}

// Helper function to create a new Supabase client with error handling
function createSupabaseClient(): ClientType {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { headers: { 'x-client-info': '@supabase/edge-functions' } }
    });
    return supabase;
  } catch (error: unknown) {
    console.error('Error creating Supabase client:', error);
    throw new Error('Failed to initialize Supabase client');
  }
}

// Helper function to wait for the MCP server to become ready
async function waitForMcpServerReady(url: string, maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      console.log(`Attempting to connect to MCP server at ${url}, attempt ${i + 1}...`);
      const response = await fetch(url);
      
      if (response.status === 200) {
        console.log('MCP server is ready!');
        return true;
      }
      
      console.log(`MCP server not ready yet. Status: ${response.status}`);
    } catch (error: unknown) {
      console.log(`Connection attempt failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Wait before the next attempt
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.error(`MCP server failed to become ready after ${maxAttempts} attempts`);
  return false;
}

/**
 * Deploy an MCP server in an E2B sandbox
 */
async function deployMcpServer(
  mcpServerObject: CustomObject,
  userProvidedEnvs: Record<string, string>,
  organisationId: string
): Promise<{ sandboxId: string; serverUrl: string }> {
  try {
    console.log(`Deploying MCP server "${mcpServerObject.metadata.title}" for organisation ${organisationId}`);
    
    // Create an E2B sandbox
    const sandbox = await Sandbox.create({
      apiKey: E2B_API_KEY,
      // Use default timeout from the MCP server object, or default to 30 minutes
      timeoutMs: mcpServerObject.metadata.default_timeout || DEFAULT_MCP_SERVER_TIMEOUT_MS,
    });
    
    console.log(`Created E2B sandbox with ID: ${sandbox.sandboxId}`);
    
    // Prepare environment variables for the MCP server
    const port = mcpServerObject.metadata.port || DEFAULT_MCP_SERVER_PORT;
    const envVars = {
      // Make the server listen on all interfaces (0.0.0.0) inside the sandbox
      MCP_HOST: '0.0.0.0',
      MCP_PORT: port.toString(),
      // Add the sandbox ID for tracing/debugging
      E2B_SANDBOX_ID: sandbox.sandboxId,
      // Add user-provided environment variables
      ...userProvidedEnvs,
    };
    
    // Check available methods on the sandbox
    console.log('Available methods on sandbox:', JSON.stringify(Object.getOwnPropertyNames(sandbox), null, 2));
    
    // Inspect the commands object if it exists
    if (sandbox.commands) {
      console.log('Available methods on sandbox.commands:', JSON.stringify(Object.getOwnPropertyNames(sandbox.commands), null, 2));
    }
    
    // Format all environment variables for shell script
    const envExportsStr = Object.entries(envVars)
      .map(([key, value]) => `export ${key}="${value?.toString().replace(/"/g, '\\"') || ''}"`)
      .join('\n');
    
    // Check if we need to run an installation command
    if (mcpServerObject.metadata.install_command) {
      console.log(`Installing MCP server with command: ${mcpServerObject.metadata.install_command}`);
      
      // Use the most appropriate method to run the installation command
      if (sandbox.commands && typeof sandbox.commands.run === 'function') {
        // Try running with commands.run
        const installResult = await sandbox.commands.run(mcpServerObject.metadata.install_command);
        console.log('Installation result:', installResult);
        
        if (installResult.exitCode !== 0) {
          throw new Error(`Installation failed with exit code ${installResult.exitCode}`);
        }
      } else if (sandbox.pty && typeof sandbox.pty.spawn === 'function') {
        // Try using pseudo-terminal (pty) as an alternative
        const terminal = await sandbox.pty.spawn('bash');
        
        // Set environment variables first
        for (const [key, value] of Object.entries(envVars)) {
          await terminal.write(`export ${key}="${value?.toString().replace(/"/g, '\\"') || ''}"\n`);
        }
        
        // Run the installation command
        await terminal.write(`${mcpServerObject.metadata.install_command}\n`);
        await terminal.write('exit\n');
        
        // Close the terminal
        await terminal.kill();
      } else if (sandbox.files && typeof sandbox.files.write === 'function') {
        // Create a shell script as a fallback
        const scriptPath = '/tmp/install_script.sh';
        const scriptContent = `#!/bin/bash\n${envExportsStr}\n${mcpServerObject.metadata.install_command}\n`;
        
        // Write the script
        await sandbox.files.write(scriptPath, scriptContent);
        
        // Make it executable
        if (typeof sandbox.commands?.run === 'function') {
          await sandbox.commands.run(`chmod +x ${scriptPath}`);
          const result = await sandbox.commands.run(scriptPath);
          
          if (result.exitCode !== 0) {
            throw new Error(`Installation script failed with exit code ${result.exitCode}`);
          }
        }
      }
    }
    
    // Start the MCP server
    console.log(`Starting MCP server with command: ${mcpServerObject.metadata.start_command}`);
    
    // Try different methods to run the start command
    if (sandbox.commands && typeof sandbox.commands.run === 'function') {
      // Run the command in the background using nohup
      const backgroundCmd = `nohup ${mcpServerObject.metadata.start_command} > /tmp/mcp-server.log 2>&1 &`;
      await sandbox.commands.run(backgroundCmd);
    } else if (sandbox.pty && typeof sandbox.pty.spawn === 'function') {
      // Try using pseudo-terminal (pty)
      const terminal = await sandbox.pty.spawn('bash');
      
      // Set environment variables
      for (const [key, value] of Object.entries(envVars)) {
        await terminal.write(`export ${key}="${value?.toString().replace(/"/g, '\\"') || ''}"\n`);
      }
      
      // Run in background with nohup
      await terminal.write(`nohup ${mcpServerObject.metadata.start_command} > /tmp/mcp-server.log 2>&1 &\n`);
      
      // Exit but keep processes running
      await terminal.write('disown -a\n');
      await terminal.write('exit\n');
      
      // Close the terminal but keep background processes
      await terminal.kill();
    } else if (sandbox.files && typeof sandbox.files.write === 'function' && typeof sandbox.commands?.run === 'function') {
      // Create a shell script to run in the background
      const scriptPath = '/tmp/start_script.sh';
      const scriptContent = `#!/bin/bash\n${envExportsStr}\nnohup ${mcpServerObject.metadata.start_command} > /tmp/mcp-server.log 2>&1 &\n`;
      
      // Write and execute the script
      await sandbox.files.write(scriptPath, scriptContent);
      await sandbox.commands.run(`chmod +x ${scriptPath}`);
      await sandbox.commands.run(scriptPath);
    } else {
      throw new Error('No suitable method found to execute start command');
    }
    
    // Wait for a moment to allow the server to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get the exposed port URL using the documented getHost method
    const serverUrl = sandbox.getHost(port);
    
    console.log(`MCP server is running on port ${port}, accessible at: ${serverUrl}`);
    
    return {
      sandboxId: sandbox.sandboxId,
      serverUrl,
    };
  } catch (error) {
    console.error(`Error deploying MCP server:`, error);
    throw new Error(`Failed to deploy MCP server: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Initialize the Supabase client with the service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Deno serve function to handle HTTP requests
Deno.serve(async (req) => {
  // Handle CORS for preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Initialize headers with CORS headers
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
  
  // Get the request URL and path
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '');
  
  try {
    // API endpoint switch based on path and method
    if (path === '/mcp-connections/install' && req.method === 'POST') {
      return await handleInstallMcpServer(req, headers);
    } else if (path.match(/^\/mcp-connections\/\w+-\w+-\w+-\w+-\w+$/) && req.method === 'DELETE') {
      const connectionId = path.split('/').pop();
      return await handleDeleteMcpServer(connectionId!, headers);
    } else if (path === '/mcp-connections' && req.method === 'GET') {
      return await handleGetMcpConnections(req, headers);
    } else if (path === '/mcp-server-definitions' && req.method === 'GET') {
      return await handleGetMcpServerDefinitions(headers);
    } else {
      // Invalid endpoint
      return new Response(
        JSON.stringify({ error: 'Not found', message: 'Endpoint not found' }), 
        { status: 404, headers }
      );
    }
  } catch (error) {
    console.error(`Error handling request to ${path}:`, error);
    return new Response(
      JSON.stringify({ error: 'Server error', message: error.message }), 
      { status: 500, headers }
    );
  }
});

// Handle POST /mcp-connections/install
async function handleInstallMcpServer(req: Request, headers: HeadersInit): Promise<Response> {
  try {
    // Parse request body
    const requestData = await req.json();
    
    // Validate required fields
    const { mcp_server_id, account_id, provided_credential_schema, title } = requestData;
    const organisationId = account_id; // Use organisationId internally to be consistent with our schema
    
    if (!mcp_server_id || !organisationId || !title) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request', 
          message: 'Missing required fields: mcp_server_id, account_id, and title are required' 
        }), 
        { status: 400, headers }
      );
    }
    
    // Fetch the MCP server definition from the database
    const { data: mcpServerDefinition, error: mcpServerError } = await supabase
      .from('objects')
      .select('*')
      .eq('id', mcp_server_id)
      .eq('related_object_type_id', 'mcp_server')
      .single();
    
    if (mcpServerError || !mcpServerDefinition) {
      console.error('Error fetching MCP server definition:', mcpServerError);
      return new Response(
        JSON.stringify({ 
          error: 'Not Found', 
          message: 'MCP server definition not found' 
        }), 
        { status: 404, headers }
      );
    }
    
    // Create a new connection object with initial pending status
    const { data: newConnection, error: createError } = await supabase
      .from('objects')
      .insert({
        related_object_type_id: 'connection',
        owner_organisation_id: organisationId,
        metadata: {
          title,
          mcp_status: 'mcpPending',
          mcp_server_id: mcp_server_id,
          created_at: new Date().toISOString(),
          provided_credential_schema: provided_credential_schema 
            ? encryptSensitiveFields(provided_credential_schema)
            : {}
        }
      })
      .select()
      .single();
    
    if (createError || !newConnection) {
      console.error('Error creating MCP connection:', createError);
      return new Response(
        JSON.stringify({ 
          error: 'Database Error', 
          message: 'Failed to create MCP connection record' 
        }), 
        { status: 500, headers }
      );
    }
    
    // Deploy the MCP server in an E2B sandbox
    try {
      // Update status to deploying
      await supabase
        .from('objects')
        .update({
          metadata: {
            ...newConnection.metadata,
            mcp_status: 'mcpDeploying'
          }
        })
        .eq('id', newConnection.id);
      
      // Deploy the server
      const { sandboxId, serverUrl } = await deployMcpServer(
        mcpServerDefinition,
        provided_credential_schema || {},
        organisationId
      );
      
      // Update the connection with the sandbox information
      const { data: updatedConnection, error: updateError } = await supabase
        .from('objects')
        .update({
          metadata: {
            ...newConnection.metadata,
            mcp_status: 'mcpRunning',
            e2b_sandbox_id: sandboxId,
            mcp_server_url: serverUrl,
          }
        })
        .eq('id', newConnection.id)
        .select()
        .single();
      
      if (updateError || !updatedConnection) {
        console.error('Error updating MCP connection:', updateError);
        return new Response(
          JSON.stringify({ 
            error: 'Database Error', 
            message: 'Failed to update MCP connection record' 
          }), 
          { status: 500, headers }
        );
      }
      
      // Return success with the connection
      return new Response(
        JSON.stringify({
          success: true,
          message: 'MCP server deployed successfully',
          connection: {
            ...updatedConnection,
            // Don't return sensitive credentials
            metadata: {
              ...updatedConnection.metadata,
              provided_credential_schema: Object.keys(updatedConnection.metadata.provided_credential_schema || {})
                .reduce((acc, key) => ({ ...acc, [key]: '[REDACTED]' }), {})
            }
          }
        }),
        { status: 200, headers }
      );
    } catch (deployError) {
      console.error('Error deploying MCP server:', deployError);
      
      // Update the connection with error status
      await supabase
        .from('objects')
        .update({
          metadata: {
            ...newConnection.metadata,
            mcp_status: 'mcpError',
            last_error: deployError.message || 'Unknown error'
          }
        })
        .eq('id', newConnection.id);
      
      return new Response(
        JSON.stringify({ 
          error: 'Deployment Error', 
          message: `Failed to deploy MCP server: ${deployError.message}`,
          connection_id: newConnection.id
        }), 
        { status: 500, headers }
      );
    }
  } catch (error) {
    console.error('Error in handleInstallMcpServer:', error);
    return new Response(
      JSON.stringify({ error: 'Server Error', message: error.message }), 
      { status: 500, headers }
    );
  }
}

// Handle DELETE /mcp-connections/:connection_id
async function handleDeleteMcpServer(connectionId: string, headers: HeadersInit): Promise<Response> {
  try {
    // Fetch the connection to get the sandbox ID
    const { data: connection, error: fetchError } = await supabase
      .from('objects')
      .select('*')
      .eq('id', connectionId)
      .eq('related_object_type_id', 'connection')
      .single();
    
    if (fetchError || !connection) {
      return new Response(
        JSON.stringify({ 
          error: 'Not Found', 
          message: 'MCP connection not found' 
        }), 
        { status: 404, headers }
      );
    }
    
    // If there's a sandbox ID, try to kill the sandbox
    const sandboxId = connection.metadata?.e2b_sandbox_id;
    if (sandboxId) {
      try {
        // Try to connect to the sandbox and kill it
        // Use connect instead of reconnect (which doesn't exist)
        const sandbox = await Sandbox.connect(sandboxId, { apiKey: E2B_API_KEY });
        await sandbox.kill();
        console.log(`Killed E2B sandbox ${sandboxId}`);
      } catch (sandboxError) {
        console.error(`Error killing E2B sandbox ${sandboxId}:`, sandboxError);
        // Continue with deletion even if sandbox cleanup fails
      }
    }
    
    // Delete the connection from the database
    const { error: deleteError } = await supabase
      .from('objects')
      .delete()
      .eq('id', connectionId);
    
    if (deleteError) {
      console.error('Error deleting MCP connection:', deleteError);
      return new Response(
        JSON.stringify({ 
          error: 'Database Error', 
          message: 'Failed to delete MCP connection' 
        }), 
        { status: 500, headers }
      );
    }
    
    // Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: 'MCP connection deleted successfully'
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Error in handleDeleteMcpServer:', error);
    return new Response(
      JSON.stringify({ error: 'Server Error', message: error.message }), 
      { status: 500, headers }
    );
  }
}

// Handle GET /mcp-connections?account_id=<account_id>
async function handleGetMcpConnections(req: Request, headers: HeadersInit): Promise<Response> {
  try {
    // Get the account_id from the query parameters
    const url = new URL(req.url);
    const organisationId = url.searchParams.get('account_id'); // Keep param name consistent but use org id internally
    
    if (!organisationId) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request', 
          message: 'Missing required query parameter: account_id' 
        }), 
        { status: 400, headers }
      );
    }
    
    // Fetch all MCP connections for the account
    const { data: connections, error: fetchError } = await supabase
      .from('objects')
      .select('*')
      .eq('related_object_type_id', 'connection')
      .eq('owner_organisation_id', organisationId);
    
    if (fetchError) {
      console.error('Error fetching MCP connections:', fetchError);
      return new Response(
        JSON.stringify({ 
          error: 'Database Error', 
          message: 'Failed to fetch MCP connections' 
        }), 
        { status: 500, headers }
      );
    }
    
    // Redact sensitive credential information before returning
    const redactedConnections = connections.map(connection => ({
      ...connection,
      metadata: {
        ...connection.metadata,
        provided_credential_schema: Object.keys(connection.metadata.provided_credential_schema || {})
          .reduce((acc, key) => ({ ...acc, [key]: '[REDACTED]' }), {})
      }
    }));
    
    // Return the connections
    return new Response(
      JSON.stringify({
        success: true,
        connections: redactedConnections || []
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Error in handleGetMcpConnections:', error);
    return new Response(
      JSON.stringify({ error: 'Server Error', message: error.message }), 
      { status: 500, headers }
    );
  }
}

// Handle GET /mcp-server-definitions
async function handleGetMcpServerDefinitions(headers: HeadersInit): Promise<Response> {
  try {
    // Fetch all MCP server definitions
    const { data: serverDefinitions, error: fetchError } = await supabase
      .from('objects')
      .select('*')
      .eq('related_object_type_id', 'mcp_server');
    
    if (fetchError) {
      console.error('Error fetching MCP server definitions:', fetchError);
      return new Response(
        JSON.stringify({ 
          error: 'Database Error', 
          message: 'Failed to fetch MCP server definitions' 
        }), 
        { status: 500, headers }
      );
    }
    
    // Return the server definitions
    return new Response(
      JSON.stringify({
        success: true,
        server_definitions: serverDefinitions || []
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Error in handleGetMcpServerDefinitions:', error);
    return new Response(
      JSON.stringify({ error: 'Server Error', message: error.message }), 
      { status: 500, headers }
    );
  }
} 