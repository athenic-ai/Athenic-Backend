/**
 * MCP Server Health Check Endpoint
 * 
 * This endpoint checks the health status of active MCP servers.
 * It verifies sandbox status, server connectivity, and response time.
 */

import { createClient } from '@supabase/supabase-js';

// Supabase edge function configuration
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Setup CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Response timeout (milliseconds)
const RESPONSE_TIMEOUT_MS = 5000;

// Interface for the E2B sandbox connection
interface McpConnection {
  id: string;
  metadata: {
    title: string;
    mcp_status: string;
    mcp_server_url?: string;
    e2b_sandbox_id: string;
    created_at: string;
  };
}

// Health check result interface
interface HealthCheckResult {
  connection_id: string;
  title: string;
  status: 'healthy' | 'unhealthy' | 'error';
  status_code?: number;
  response_time_ms?: number;
  error?: string;
  last_checked: string;
  e2b_sandbox_id: string;
  server_url?: string;
}

/**
 * Check health status of a single MCP server
 * 
 * @param serverUrl The URL of the MCP server
 * @returns Health check result
 */
async function checkServerHealth(
  connection: McpConnection
): Promise<HealthCheckResult> {
  const startTime = performance.now();
  const connectionId = connection.id;
  const serverUrl = connection.metadata.mcp_server_url;
  const title = connection.metadata.title || 'Unnamed MCP server';
  const sandboxId = connection.metadata.e2b_sandbox_id;
  
  // Prepare the base result
  const result: HealthCheckResult = {
    connection_id: connectionId,
    title,
    status: 'error',
    last_checked: new Date().toISOString(),
    e2b_sandbox_id: sandboxId,
    server_url: serverUrl,
  };
  
  // Check if we have a server URL
  if (!serverUrl) {
    result.error = 'No server URL available';
    return result;
  }
  
  try {
    // Set up request timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RESPONSE_TIMEOUT_MS);
    
    // Make the health check request
    const response = await fetch(serverUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    // Calculate response time
    const endTime = performance.now();
    const responseTimeMs = Math.round(endTime - startTime);
    
    // Update result with response info
    result.response_time_ms = responseTimeMs;
    result.status_code = response.status;
    
    // Determine health status based on status code
    if (response.ok) {
      result.status = 'healthy';
    } else {
      result.status = 'unhealthy';
      result.error = `Unhealthy response: ${response.status} ${response.statusText}`;
    }
  } catch (error) {
    // Handle fetch errors
    if (error.name === 'AbortError') {
      result.error = `Request timed out after ${RESPONSE_TIMEOUT_MS}ms`;
    } else {
      result.error = `Connection error: ${error.message}`;
    }
    result.status = 'unhealthy';
  }
  
  return result;
}

/**
 * Get all active MCP connections for an account
 * 
 * @param accountId The account ID
 * @param supabase Supabase client instance
 * @returns Array of MCP connections
 */
async function getActiveMcpConnections(
  accountId: string,
  supabase: ReturnType<typeof createClient>
): Promise<McpConnection[]> {
  try {
    // Query MCP connections for the account
    const { data, error } = await supabase
      .from('objects')
      .select('*')
      .eq('related_object_type_id', 'mcp_connection')
      .eq('owner_account_id', accountId);
    
    if (error) {
      console.error('Error fetching MCP connections:', error);
      return [];
    }
    
    if (!data || !Array.isArray(data)) {
      return [];
    }
    
    // Filter for connections that are intended to be running
    return data.filter(
      (connection) => connection.metadata?.mcp_status === 'mcpRunning'
    ) as McpConnection[];
  } catch (error) {
    console.error('Error getting MCP connections:', error);
    return [];
  }
}

// Deno serve function to handle HTTP requests
Deno.serve(async (req) => {
  // Handle CORS for preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Initialize headers with CORS headers
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
  
  // Only support GET method
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers }
    );
  }
  
  try {
    // Get query parameters
    const url = new URL(req.url);
    const accountId = url.searchParams.get('account_id');
    const connectionId = url.searchParams.get('connection_id');
    
    // Validate required parameters
    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: account_id' }),
        { status: 400, headers }
      );
    }
    
    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    // Get active MCP connections
    const connections = await getActiveMcpConnections(accountId, supabase);
    
    // Filter by connection ID if provided
    const connectionsToCheck = connectionId 
      ? connections.filter(conn => conn.id === connectionId)
      : connections;
    
    if (connectionId && connectionsToCheck.length === 0) {
      return new Response(
        JSON.stringify({ error: 'MCP connection not found or not running' }),
        { status: 404, headers }
      );
    }
    
    // Check health for all applicable connections
    const healthPromises = connectionsToCheck.map(connection => 
      checkServerHealth(connection)
    );
    
    // Wait for all health checks to complete
    const healthResults = await Promise.all(healthPromises);
    
    // Calculate aggregate status
    const aggregateStatus = {
      total: healthResults.length,
      healthy: healthResults.filter(r => r.status === 'healthy').length,
      unhealthy: healthResults.filter(r => r.status === 'unhealthy').length,
      error: healthResults.filter(r => r.status === 'error').length,
      timestamp: new Date().toISOString(),
    };
    
    // Return health check results
    return new Response(
      JSON.stringify({
        status: aggregateStatus.healthy === aggregateStatus.total ? 'healthy' : 'unhealthy',
        aggregate: aggregateStatus,
        connections: healthResults,
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error(`Error in health check:`, error);
    return new Response(
      JSON.stringify({ error: 'Server error', message: error.message }),
      { status: 500, headers }
    );
  }
}); 