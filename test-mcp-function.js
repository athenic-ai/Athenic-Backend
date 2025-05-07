/**
 * Test script for MCP Connections Edge Function
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Supabase credentials from environment or use default development credentials
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testMcpServerDefinitions() {
  try {
    console.log('Testing GET /mcp-server-definitions endpoint...');
    const { data, error } = await supabase.functions.invoke('mcp-connections', {
      method: 'GET',
      path: '/mcp-server-definitions',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (error) {
      console.error('Error fetching MCP server definitions:', error);
      return;
    }

    console.log('MCP Server Definitions:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error testing MCP server definitions:', error);
  }
}

async function testListMcpConnections() {
  try {
    console.log('Testing GET /mcp-connections endpoint...');
    
    // Use a test account ID
    const testAccountId = 'test-account-123';
    
    const { data, error } = await supabase.functions.invoke('mcp-connections', {
      method: 'GET',
      path: `/mcp-connections?account_id=${testAccountId}`,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (error) {
      console.error('Error fetching MCP connections:', error);
      return;
    }

    console.log('MCP Connections:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error testing MCP connections list:', error);
  }
}

// Run the tests
async function runTests() {
  console.log('===== TESTING MCP CONNECTIONS EDGE FUNCTION =====');
  
  // Test retrieving MCP server definitions
  await testMcpServerDefinitions();
  
  console.log('\n=====\n');
  
  // Test listing MCP connections
  await testListMcpConnections();
  
  console.log('\n===== TESTS COMPLETED =====');
}

runTests().catch(console.error); 