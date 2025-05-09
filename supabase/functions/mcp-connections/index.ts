// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
// @ts-ignore
import { Sandbox } from 'npm:@e2b/code-interpreter';
// @ts-ignore
import { corsHeaders } from '../_shared/configs/cors.ts';
// @ts-ignore
import { ClientType } from 'npm:@supabase/supabase-js/src/types.ts';

// Type definitions
interface CustomObject {
  id: string;
  related_object_type_id: string;
  owner_organisation_id: string;
  metadata: Record<string, any>;
  created_at?: string;
  embedding?: any;
  owner_member_id?: string;
}

// Request and response types
interface InstallMcpServerRequest {
  mcpServerId: string;
  organisationId: string;
  memberId?: string;
  auth?: Record<string, string>;
}

// API Configuration
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const E2B_API_KEY = Deno.env.get('E2B_API_KEY') || '';
const DEFAULT_MCP_SERVER_PORT = 3000;
const DEFAULT_MCP_SERVER_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes - increased from 30 to 60

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
async function waitForMcpServerReady(url: string, maxAttempts = 15, initialWaitMs = 5000): Promise<boolean> {
  // Initial wait before even starting to check connections
  console.log(`Waiting ${initialWaitMs}ms before beginning connection checks...`);
  await new Promise(resolve => setTimeout(resolve, initialWaitMs));
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Ensure the URL has a proper protocol prefix
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      
      console.log(`Attempting to connect to MCP server at ${fullUrl}, attempt ${i + 1}...`);
      const response = await fetch(fullUrl, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        // Reasonable timeout for each request
        signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
      });
      
      // Any 2xx or 3xx status could be considered success
      if (response.ok || response.status < 400) {
        console.log(`MCP server is ready at ${fullUrl}!`);
        return true;
      }
      
      // If we get a 404, try with /sse if it doesn't already have it
      if (response.status === 404 && !fullUrl.endsWith('/sse')) {
        const sseUrl = `${fullUrl.endsWith('/') ? fullUrl.slice(0, -1) : fullUrl}/sse`;
        console.log(`Trying SSE endpoint at ${sseUrl}...`);
        
        try {
          const sseResponse = await fetch(sseUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
          });
          
          if (sseResponse.ok || sseResponse.status < 400) {
            console.log(`MCP server is ready at ${sseUrl}!`);
            return true;
          }
        } catch (sseError) {
          console.log(`SSE endpoint check failed: ${sseError instanceof Error ? sseError.message : String(sseError)}`);
        }
      }
      
      console.log(`MCP server not ready yet. Status: ${response.status}`);
      
      // Wait between attempts, increasing the wait time for later attempts
      const waitTime = Math.min(2000 * (i + 1), 10000);
      console.log(`Server not ready yet. Waiting ${waitTime}ms before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } catch (error: unknown) {
      console.log(`Connection attempt failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Wait between attempts with exponential backoff
      const waitTime = Math.min(2000 * (i + 1), 10000);
      console.log(`Connection failed. Waiting ${waitTime}ms before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
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
): Promise<{ sandboxId: string; serverUrl: string; sandbox: any }> {
  try {
    console.log(`Deploying MCP server "${mcpServerObject.metadata.title}" for organisation ${organisationId}`);
    
    // Get the timeout from metadata or use a default
    const timeoutMs = mcpServerObject.metadata.default_timeout || DEFAULT_MCP_SERVER_TIMEOUT_MS;
    console.log(`Using timeout of ${timeoutMs}ms for MCP server deployment`);
    
    // Create the sandbox using "base" template as shown in the example
    console.log("Creating sandbox...");
    const sandbox = await Sandbox.create({
      apiKey: E2B_API_KEY,
      timeoutMs: Number(timeoutMs),
    });
    
    console.log(`Created E2B sandbox with ID: ${sandbox.sandboxId}`);
    
    // Get the server URL
    const port = mcpServerObject.metadata.port || DEFAULT_MCP_SERVER_PORT;
    const host = sandbox.getHost(port);
    const serverUrl = `https://${host}`;
    
    console.log(`Server will be accessible at: ${serverUrl}`);
    
    // Construct the environment variables
    const envVars = {
      MCP_HOST: '0.0.0.0',
      MCP_PORT: port.toString(),
      E2B_SANDBOX_ID: sandbox.sandboxId,
      ...userProvidedEnvs
    };
    
    // Following the example code exactly:
    // Use supergateway to proxy the MCP server
    const command = mcpServerObject.metadata.start_command;
    console.log("Starting MCP server with command:", command);
    
    await sandbox.commands.run(
      `npx -y supergateway --base-url ${serverUrl} --port ${port} --cors --stdio "${command.replace(/"/g, '\\"')}"`,
      {
        env: envVars,
        background: true
      }
    );
    
    console.log(`MCP server started at: ${serverUrl}/sse`);
    
    // Return all needed info
    return {
      sandboxId: sandbox.sandboxId,
      serverUrl: `${serverUrl}/sse`,
      sandbox
    };
  } catch (error: unknown) {
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
Deno.serve(async (req: Request) => {
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
  } catch (error: unknown) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return new Response(
      JSON.stringify({ error: 'Server error', message: error instanceof Error ? error.message : String(error) }), 
      { status: 500, headers }
    );
  }
});

// Handle POST /mcp-connections/install
async function handleInstallMcpServer(req: Request, headers: HeadersInit): Promise<Response> {
  try {
    // Extract request data using the original parameter names that the frontend expects
    const data = await req.json();
    const { mcp_server_id, account_id, provided_credential_schema, title } = data;
    const organisationId = account_id; // Map to our internal variable name
    
    if (!mcp_server_id || !organisationId || !title) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: mcp_server_id, account_id, and title are required' }), 
        { status: 400, headers }
      );
    }
    
    console.log(`Attempting to install MCP server ${mcp_server_id} for organisation ${organisationId}`);
    
    // Get Supabase Admin client
    const supabase = createSupabaseAdmin();
    
    // Get MCP server definition from DB
    const { data: mcpServerObjects, error: mcpServerError } = await supabase
      .from('objects')
      .select('*')
      .eq('related_object_type_id', 'mcp_server')
      .eq('id', mcp_server_id)
      .limit(1);
      
    if (mcpServerError || !mcpServerObjects || mcpServerObjects.length === 0) {
      console.error('Error retrieving MCP server:', mcpServerError);
      return new Response(
        JSON.stringify({ success: false, error: 'MCP server not found' }), 
        { status: 404, headers }
      );
    }
    
    const mcpServerObject = mcpServerObjects[0] as CustomObject;
    
    // Deploy the MCP server using the example code pattern
    const { serverUrl, sandboxId } = await deployMcpServer(mcpServerObject, provided_credential_schema || {}, organisationId);
    
    // Check if the server is ready
    const isReady = await waitForMcpServerReady(serverUrl);
    if (!isReady) {
      throw new Error('MCP server was deployed but did not respond in time');
    }
    
    // Add connection to Supabase
    const { data: newConnection, error: connectionError } = await supabase
      .from('objects')
      .insert([
        {
          related_object_type_id: 'connection',
          owner_organisation_id: organisationId,
          metadata: {
            title,
            mcp_status: 'mcpRunning',
            mcp_server_id: mcp_server_id,
            created_at: new Date().toISOString(),
            e2b_sandbox_id: sandboxId,
            mcp_server_url: serverUrl,
            provided_credential_schema: provided_credential_schema || {}
          }
        }
      ])
      .select()
      .limit(1);
      
    if (connectionError || !newConnection || newConnection.length === 0) {
      console.error('Error creating MCP connection:', connectionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create MCP connection' }), 
        { status: 500, headers }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'MCP server installed successfully',
        connection: newConnection[0]
      }), 
      { status: 200, headers }
    );
  } catch (error: unknown) {
    console.error('Error in handleInstallMcpServer:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to install MCP server', 
        message: error instanceof Error ? error.message : String(error)
      }), 
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
    const redactedConnections = connections.map((connection: CustomObject) => ({
      ...connection,
      metadata: {
        ...connection.metadata,
        // Ensure credentials and sensitive info are redacted
        auth: connection.metadata.auth ? Object.keys(connection.metadata.auth).reduce(
          (acc: Record<string, string>, key: string) => ({ ...acc, [key]: '[REDACTED]' }), {}
        ) : {}
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