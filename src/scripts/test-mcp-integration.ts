#!/usr/bin/env node

/**
 * Test script for MCP integration
 * 
 * Usage:
 * ts-node src/scripts/test-mcp-integration.ts <organisationId> [customMessage]
 * 
 * Example:
 * ts-node src/scripts/test-mcp-integration.ts demo.gameforgifts.com "Find articles about AI trends"
 */

import { setTimeout } from 'node:timers/promises';
import fetch from 'node-fetch';

async function main() {
  // Parse command line arguments
  const [,, organisationId, customMessage] = process.argv;
  
  if (!organisationId) {
    console.error('Error: Organisation ID is required');
    console.log('Usage: ts-node src/scripts/test-mcp-integration.ts <organisationId> [customMessage]');
    process.exit(1);
  }
  
  // Default test message if none provided
  const message = customMessage || 'List the top 5 AI research papers from 2024';
  
  console.log('=== MCP Integration Test ===');
  console.log(`Organisation ID: ${organisationId}`);
  console.log(`Test message: "${message}"`);
  console.log('===========================');
  
  try {
    // Create a client ID for this test session
    const clientId = `test-mcp-${Date.now()}`;
    
    // Generate event to trigger the test function
    const eventData = {
      name: 'athenic/test.mcp_integration',
      data: {
        organisationId,
        clientId,
        message,
      },
    };
    
    // Determine the Inngest API URL - use environment variable if set, otherwise default
    const inngestApiPort = process.env.INNGEST_API_PORT || '8288';
    const inngestApiUrl = `http://localhost:${inngestApiPort}/e/athenic-backend`;
    
    console.log(`Sending event to Inngest API at ${inngestApiUrl}`);
    
    // Send the event to Inngest API to trigger the test function
    const response = await fetch(inngestApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to send event to Inngest: ${response.status} ${response.statusText}`);
    }
    
    const responseData = await response.json();
    console.log('Event sent successfully:', responseData);
    console.log('Function execution started. Check the Inngest Dev Server UI for results.');
    console.log('');
    console.log('Note: The execution may take some time depending on MCP server availability and the complexity of the query.');
    console.log('You can monitor progress at: http://localhost:8288/functions/test-mcp-integration');
    
    // Wait for a moment to ensure the function starts
    await setTimeout(2000);
    
    console.log('');
    console.log('Test initiated successfully. To run additional tests, you can:');
    console.log('1. Check for MCP connection objects:');
    console.log(`   SELECT * FROM objects WHERE related_object_type_id = 'connection' AND metadata->>'mcp_status' = 'mcpRunning';`);
    console.log('2. Monitor the Inngest logs for function execution details');
    
  } catch (error) {
    console.error('Error during test:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Uncaught error:', error);
  process.exit(1);
}); 