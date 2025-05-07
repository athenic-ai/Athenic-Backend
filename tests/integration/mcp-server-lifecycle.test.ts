/**
 * Integration test for MCP server lifecycle
 * 
 * This test verifies the full lifecycle of MCP server connections:
 * - Installing a new MCP server
 * - Getting connection status
 * - Using the MCP server with AgentKit
 * - Removing the MCP server connection
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import fetch from 'node-fetch';
import { createState } from '@inngest/agent-kit';
import { buildMcpServersConfig } from '../../src/inngest/utils/mcpHelpers.js';

// Test configuration
const TEST_ACCOUNT_ID = process.env.TEST_ACCOUNT_ID || 'test.account-id';
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Skip tests if service role key is not available
const shouldSkipTests = !SUPABASE_SERVICE_ROLE_KEY;

// Test function to make API requests to the MCP connections endpoints
async function makeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: any
): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText}\n${error}`);
  }

  return response.json();
}

// Test with longer timeout due to E2B startup time
jest.setTimeout(60000);

describe('MCP Server Lifecycle (Integration)', () => {
  // Track the connection ID for cleanup
  let testConnectionId: string | null = null;
  let mcpServerId: string | null = null;

  beforeAll(async () => {
    if (shouldSkipTests) {
      console.warn('Skipping MCP integration tests - SUPABASE_SERVICE_ROLE_KEY not provided');
      return;
    }

    // Get the first available MCP server definition
    const serverDefinitions = await makeRequest('GET', 'mcp-connections/server-definitions');
    if (!serverDefinitions || serverDefinitions.length === 0) {
      throw new Error('No MCP server definitions found');
    }

    // Use a simple test server that doesn't require external credentials
    mcpServerId = serverDefinitions.find((server: any) => 
      server.metadata.title.includes('Echo') || 
      server.metadata.title.includes('Test') || 
      server.metadata.title.includes('Calculator')
    )?.id;

    if (!mcpServerId) {
      mcpServerId = serverDefinitions[0].id;
      console.warn(`No simple test server found, using ${serverDefinitions[0].metadata.title}`);
    }
  });

  afterAll(async () => {
    if (shouldSkipTests) return;
    
    // Cleanup: Make sure the test connection is deleted
    if (testConnectionId) {
      try {
        await makeRequest('DELETE', `mcp-connections/${testConnectionId}`);
        console.log(`Test connection ${testConnectionId} deleted during cleanup`);
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    }
  });

  it('should skip tests if service role key is not available', () => {
    if (shouldSkipTests) {
      expect(true).toBe(true); // Dummy assertion when skipping
    }
  });

  it('should successfully install an MCP server', async () => {
    if (shouldSkipTests) return;

    // Install a new MCP server connection
    const installPayload = {
      mcp_server_id: mcpServerId,
      account_id: TEST_ACCOUNT_ID,
      title: `Integration Test Server ${Date.now()}`,
      // No credentials required for test servers
      provided_credential_schema: {}
    };

    const result = await makeRequest('POST', 'mcp-connections/install', installPayload);
    
    // Store the connection ID for later tests
    testConnectionId = result.id;
    
    // Check response
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.metadata.mcp_status).toBeDefined();
    
    // The status might be either mcpDeploying or mcpRunning depending on timing
    expect(['mcpDeploying', 'mcpRunning']).toContain(result.metadata.mcp_status);
    
    // If deploying, wait for it to finish
    if (result.metadata.mcp_status === 'mcpDeploying') {
      console.log('Server is deploying, waiting for it to finish...');
      
      // Poll for status changes
      let retries = 10;
      while (retries > 0) {
        // Wait 3 seconds between polls
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get connections
        const connections = await makeRequest('GET', `mcp-connections?account_id=${TEST_ACCOUNT_ID}`);
        const connection = connections.find((c: any) => c.id === testConnectionId);
        
        if (connection?.metadata.mcp_status === 'mcpRunning') {
          console.log('Server is now running');
          break;
        }
        
        if (connection?.metadata.mcp_status === 'mcpError') {
          throw new Error(`Server deployment failed: ${connection.metadata.last_error || 'Unknown error'}`);
        }
        
        retries--;
        if (retries === 0) {
          throw new Error('Timed out waiting for server deployment');
        }
      }
    }
  });

  it('should list active MCP connections', async () => {
    if (shouldSkipTests || !testConnectionId) return;

    // Get all connections for the test account
    const connections = await makeRequest('GET', `mcp-connections?account_id=${TEST_ACCOUNT_ID}`);
    
    // Verify response
    expect(Array.isArray(connections)).toBe(true);
    
    // Find our test connection
    const testConnection = connections.find((c: any) => c.id === testConnectionId);
    expect(testConnection).toBeDefined();
    
    // Check connection has expected properties
    expect(testConnection.metadata.mcp_status).toBe('mcpRunning');
    expect(testConnection.metadata.mcp_server_url).toBeDefined();
    expect(testConnection.metadata.e2b_sandbox_id).toBeDefined();
  });

  it('should build MCP server configurations for AgentKit', async () => {
    if (shouldSkipTests || !testConnectionId) return;

    // Call the buildMcpServersConfig function to see if our connection is included
    const mcpServers = await buildMcpServersConfig(TEST_ACCOUNT_ID);
    
    // Verify response
    expect(Array.isArray(mcpServers)).toBe(true);
    expect(mcpServers.length).toBeGreaterThan(0);
    
    // There should be at least one server with a transport config
    const serverUrls = mcpServers.map(server => server.transport.url);
    expect(serverUrls.length).toBeGreaterThan(0);
    
    // Log for debugging
    console.log(`Found ${mcpServers.length} MCP servers for AgentKit:`, 
      mcpServers.map(s => ({ name: s.name, url: s.transport.url })));
  });

  it('should successfully delete an MCP server connection', async () => {
    if (shouldSkipTests || !testConnectionId) return;

    // Delete the test connection
    await makeRequest('DELETE', `mcp-connections/${testConnectionId}`);
    
    // Verify it's gone
    const connections = await makeRequest('GET', `mcp-connections?account_id=${TEST_ACCOUNT_ID}`);
    const deletedConnection = connections.find((c: any) => c.id === testConnectionId);
    
    expect(deletedConnection).toBeUndefined();
    
    // Clear the connection ID since it's been deleted
    testConnectionId = null;
  });
}); 