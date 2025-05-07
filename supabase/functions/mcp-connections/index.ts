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

// Constants for MCP server operations
const DEFAULT_MCP_SERVER_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MCP_SERVER_PORT = 3000;

// Simple encryption for sensitive credentials
// For Edge Functions where we don't have access to Node.js crypto
function encryptForEdgeFunction(text: string, secret: string): string {
  if (!text) return '';
  
  // This is a simple XOR-based encryption, not as secure as AES
  // but works for edge functions where we don't have full Node.js crypto
  let result = '';
  for (let i = 0; i < text.length; i++) {
    // XOR each character with a character from the secret
    const secretChar = secret.charCodeAt(i % secret.length);
    const textChar = text.charCodeAt(i);
    const encryptedChar = textChar ^ secretChar;
    result += String.fromCharCode(encryptedChar);
  }
  
  return Buffer.from(result).toString('base64');
}

function decryptForEdgeFunction(encryptedText: string, secret: string): string {
  if (!encryptedText) return '';
  
  try {
    // Decode base64
    const decoded = Buffer.from(encryptedText, 'base64').toString();
    
    // Decrypt with the same XOR operation (it's symmetric)
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      const secretChar = secret.charCodeAt(i % secret.length);
      const encryptedChar = decoded.charCodeAt(i);
      const decryptedChar = encryptedChar ^ secretChar;
      result += String.fromCharCode(decryptedChar);
    }
    
    return result;
  } catch (error) {
    console.error('Error decrypting:', error);
    return '';
  }
}

function encryptSensitiveFields(data: Record<string, string>): Record<string, string> {
  if (!data) return {};
  
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Sensitive field patterns
    const sensitivePatterns = [
      /api[_-]?key/i,
      /token/i,
      /secret/i,
      /password/i,
      /credential/i,
      /auth/i
    ];
    
    // Only encrypt non-empty sensitive values
    if (value && sensitivePatterns.some(pattern => pattern.test(key))) {
      const salt = Deno.env.get('ENCRYPT_SALT') || 'athenic-salt';
      result[key] = encryptForEdgeFunction(value, salt);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

function decryptSensitiveFields(data: Record<string, string>): Record<string, string> {
  if (!data) return {};
  
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Sensitive field patterns
    const sensitivePatterns = [
      /api[_-]?key/i,
      /token/i,
      /secret/i,
      /password/i,
      /credential/i,
      /auth/i
    ];
    
    // Only decrypt non-empty sensitive values
    if (value && sensitivePatterns.some(pattern => pattern.test(key))) {
      const salt = Deno.env.get('ENCRYPT_SALT') || 'athenic-salt';
      result[key] = decryptForEdgeFunction(value, salt);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

// Function to wait for the MCP server to become ready
async function waitForMcpServerReady(serverUrl: string, maxAttempts = 10, intervalMs = 2000): Promise<boolean> {
  console.log(`Waiting for MCP server at ${serverUrl} to become ready...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(serverUrl);
      
      // Check if the server is responding properly
      if (response.status === 200) {
        console.log(`MCP server at ${serverUrl} is ready (attempt ${attempt})`);
        return true;
      }
      
      console.log(`MCP server not ready yet (attempt ${attempt}), status: ${response.status}`);
    } catch (error) {
      console.log(`Connection to MCP server failed (attempt ${attempt}): ${error.message}`);
    }
    
    // Wait before the next attempt
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  console.error(`MCP server failed to become ready after ${maxAttempts} attempts`);
  return false;
}

// Function to deploy an MCP server in an E2B sandbox
async function deployMcpServer(
  mcpServerObject: CustomObject,
  userProvidedEnvs: Record<string, string>,
  accountId: string
): Promise<{ sandboxId: string; serverUrl: string; sandbox: any }> {
  try {
    console.log(`Deploying MCP server "${mcpServerObject.metadata.title}" for account ${accountId}`);
    
    // Create an E2B sandbox
    const sandbox = await Sandbox.create({
      apiKey: E2B_API_KEY,
      // Use default timeout from the MCP server object, or default to 30 minutes
      timeoutMs: mcpServerObject.metadata.default_timeout || DEFAULT_MCP_SERVER_TIMEOUT_MS,
    });
    
    const sandboxId = sandbox.sandboxId;
    console.log(`Created E2B sandbox with ID: ${sandboxId}`);
    
    // Extract the start command from the MCP server object
    const startCommand = mcpServerObject.metadata.start_command;
    if (!startCommand) {
      throw new Error('MCP server object is missing the start_command in metadata');
    }
    
    // Set up port forwarding for the MCP server
    const serverUrl = await sandbox.network.startProxy({
      port: MCP_SERVER_PORT,
      hostname: '0.0.0.0', // Listen on all interfaces inside the sandbox
      protocol: 'http',
    });
    
    console.log(`MCP server URL: ${serverUrl}`);
    
    // Execute the command to start the MCP server in the sandbox
    // First, let's install supergateway (used to convert stdio-based MCP servers to HTTP/SSE)
    await sandbox.process.startAndWait({
      cmd: 'npm install -g supergateway',
    });
    
    // Decrypt sensitive credentials for use in the sandbox
    const decryptedEnvs = decryptSensitiveFields(userProvidedEnvs);
    
    // Add an environment variable to direct the MCP server to use supergateway
    const envVars = {
      ...decryptedEnvs,
      // Use the supergateway to make MCP servers accessible via SSE
      MCP_SUPERGATEWAY: 'true',
      // Make the server listen on all interfaces (0.0.0.0) inside the sandbox
      MCP_HOST: '0.0.0.0',
      MCP_PORT: MCP_SERVER_PORT.toString(),
    };
    
    // Format environment variables for the command
    const envVarsString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    
    // Start the MCP server with the environment variables
    await sandbox.process.start({
      cmd: `${envVarsString} ${startCommand}`,
      onStdout: (data: string) => console.log(`[MCP Server Stdout]: ${data}`),
      onStderr: (data: string) => console.error(`[MCP Server Stderr]: ${data}`),
    });
    
    // Wait for the MCP server to become ready
    const isReady = await waitForMcpServerReady(serverUrl);
    if (!isReady) {
      // If the server doesn't become ready, we should clean up
      await sandbox.kill();
      throw new Error('MCP server failed to start properly');
    }
    
    console.log(`MCP server "${mcpServerObject.metadata.title || 'Unnamed'}" deployed successfully`);
    
    return {
      sandboxId,
      serverUrl,
      sandbox,
    };
  } catch (error) {
    console.error('Error deploying MCP server:', error);
    throw new Error(`Failed to deploy MCP server: ${error.message}`);
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
    
    if (!mcp_server_id || !account_id || !title) {
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
        related_object_type_id: 'mcp_connection',
        owner_account_id: account_id,
        metadata: {
          title,
          mcp_status: 'mcpPending', // Pending status while we deploy
          mcp_server_id: mcp_server_id,
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
        account_id
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
            mcp_last_error: deployError.message || 'Unknown error'
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
      .eq('related_object_type_id', 'mcp_connection')
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
        // Try to reconnect to the sandbox and kill it
        const sandbox = await Sandbox.reconnect(sandboxId, { apiKey: E2B_API_KEY });
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
    const accountId = url.searchParams.get('account_id');
    
    if (!accountId) {
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
      .eq('related_object_type_id', 'mcp_connection')
      .eq('owner_account_id', accountId);
    
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