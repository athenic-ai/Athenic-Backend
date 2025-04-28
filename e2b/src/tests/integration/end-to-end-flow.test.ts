import { expect, test, beforeAll, afterAll, describe, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import WebSocket from 'ws';
import { Server } from 'http';
import express from 'express';
import dotenv from 'dotenv';
import { createServer } from '../../tests/helpers/test-server';
import { waitForSocketState } from '../../tests/helpers/websocket-helpers';

// Load environment variables from .env
dotenv.config();

// Skip all tests if E2B_API_KEY is not provided
const shouldRunTests = !!process.env.E2B_API_KEY;

// Conditional describe that skips all tests if shouldRunTests is false
const conditionalDescribe = shouldRunTests ? describe : describe.skip;

conditionalDescribe('End-to-End Flow Tests', () => {
  let server: Server;
  let app: express.Express;
  let wsClient: WebSocket;
  let clientId: string;
  let wsMessages: any[] = [];
  const wsUrl = process.env.TEST_WS_URL || 'ws://localhost:8002';
  
  beforeEach(() => {
    // Clear message array before each test
    wsMessages = [];
  });
  
  beforeAll(async () => {
    try {
      // Create test server
      const serverConfig = await createServer();
      server = serverConfig.server;
      app = serverConfig.app;
      
      // Generate a unique client ID for this test run
      clientId = `test_client_${Date.now()}`;
      
      // Connect WebSocket client
      wsClient = new WebSocket(`${wsUrl}?clientId=${clientId}`);
      
      // Wait for WebSocket connection to be established
      await waitForSocketState(wsClient, wsClient.OPEN);
      
      // Setup message handler
      wsClient.on('message', (data) => {
        const message = JSON.parse(data.toString());
        wsMessages.push(message);
      });
    } catch (error) {
      console.error('Error in test setup:', error);
      throw new Error(`Failed to set up tests: ${error}`);
    }
  }, 90000); // Increased timeout to 90 seconds
  
  afterAll(async () => {
    // Close WebSocket client if open
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }
    
    // Close server if it exists
    if (server && server.listening) {
      server.close();
    }
  });
  
  // Test 1: Test simple Python code execution
  test('End-to-end flow: Simple Python code execution', async () => {
    // Send code execution request
    const response = await request(app)
      .post('/execute-stream')
      .send({
        code: 'print("Hello from E2B Integration Test")',
        clientId: clientId,
        template: 'code-interpreter-v1'
      });
    
    // Check HTTP response (should be 202 Accepted)
    expect(response.status).toBe(202);
    expect(response.body.message).toContain('Execution started');
    
    // Wait for all WebSocket messages (with timeout)
    const timeout = 15000; // 15 seconds
    const startTime = Date.now();
    while (true) {
      // Check if we have received all expected message types
      const hasStatus = wsMessages.some(msg => msg.type === 'status' && msg.message === 'Sandbox closed.');
      const hasStdout = wsMessages.some(msg => msg.type === 'stdout' && msg.data.includes('Hello from E2B Integration Test'));
      const hasResult = wsMessages.some(msg => msg.type === 'result');
      
      if (hasStatus && hasStdout && hasResult) break;
      
      // Check timeout
      if (Date.now() - startTime > timeout) {
        console.log('WebSocket messages received:', wsMessages);
        throw new Error(`Test timed out after ${timeout}ms`);
      }
      
      // Wait a short time before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Validate WebSocket messages
    expect(wsMessages.some(msg => msg.type === 'status' && msg.message.includes('Creating sandbox'))).toBe(true);
    expect(wsMessages.some(msg => msg.type === 'status' && msg.message.includes('Sandbox') && msg.message.includes('created'))).toBe(true);
    expect(wsMessages.some(msg => msg.type === 'status' && msg.message === 'Executing code...')).toBe(true);
    expect(wsMessages.some(msg => msg.type === 'stdout' && msg.data.includes('Hello from E2B Integration Test'))).toBe(true);
    expect(wsMessages.some(msg => msg.type === 'result')).toBe(true);
    expect(wsMessages.some(msg => msg.type === 'status' && msg.message === 'Closing sandbox...')).toBe(true);
    expect(wsMessages.some(msg => msg.type === 'status' && msg.message === 'Sandbox closed.')).toBe(true);
  }, 30000); // Extended timeout for E2B operations
  
  // Test 2: Test code that requires package installation
  test('End-to-end flow: Code with package installation', async () => {
    // Python code that imports a package (requests) that may need to be installed
    const testCode = `
import sys
try:
    import requests
    print("Successfully imported requests")
    response = requests.get("https://jsonplaceholder.typicode.com/todos/1")
    print(f"API Response status: {response.status_code}")
    print(f"API Response body: {response.json()}")
except ImportError:
    print("Installing requests package...")
    !pip install requests
    import requests
    print("Successfully installed and imported requests")
    response = requests.get("https://jsonplaceholder.typicode.com/todos/1")
    print(f"API Response status: {response.status_code}")
    print(f"API Response body: {response.json()}")
`;
    
    // Send code execution request
    const response = await request(app)
      .post('/execute-stream')
      .send({
        code: testCode,
        clientId: clientId,
        template: 'code-interpreter-v1'
      });
    
    // Check HTTP response
    expect(response.status).toBe(202);
    
    // Wait for completion (this may take longer due to package installation)
    const timeout = 60000; // 60 seconds
    const startTime = Date.now();
    while (true) {
      // Check if execution has completed
      const hasCompleted = wsMessages.some(msg => 
        msg.type === 'status' && msg.message === 'Sandbox closed.'
      );
      
      const hasApiResponse = wsMessages.some(msg => 
        msg.type === 'stdout' && msg.data.includes('API Response')
      );
      
      if (hasCompleted && hasApiResponse) break;
      
      // Check timeout
      if (Date.now() - startTime > timeout) {
        console.log('WebSocket messages received:', wsMessages);
        throw new Error(`Test timed out after ${timeout}ms`);
      }
      
      // Wait a short time before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Validate that we received the API response data
    expect(wsMessages.some(msg => 
      msg.type === 'stdout' && msg.data.includes('API Response status')
    )).toBe(true);
    
    expect(wsMessages.some(msg => 
      msg.type === 'stdout' && msg.data.includes('API Response body')
    )).toBe(true);
  }, 90000); // Extended timeout for package installation
  
  // Test 3: Test code that produces errors
  test('End-to-end flow: Code with runtime errors', async () => {
    // Python code with a deliberate error
    const testCode = `
# This code will raise a ZeroDivisionError
print("About to divide by zero...")
result = 10 / 0
print("This line will never execute")
`;
    
    // Send code execution request
    const response = await request(app)
      .post('/execute-stream')
      .send({
        code: testCode,
        clientId: clientId,
        template: 'code-interpreter-v1'
      });
    
    // Check HTTP response
    expect(response.status).toBe(202);
    
    // Wait for error messages
    const timeout = 15000; // 15 seconds
    const startTime = Date.now();
    while (true) {
      // Check if execution has completed with an error
      const hasStdout = wsMessages.some(msg => 
        msg.type === 'stdout' && msg.data.includes('About to divide by zero')
      );
      
      const hasError = wsMessages.some(msg => 
        (msg.type === 'stderr' && msg.data.includes('ZeroDivisionError')) ||
        (msg.type === 'result' && msg.error && msg.error.includes('ZeroDivisionError'))
      );
      
      const hasCompleted = wsMessages.some(msg => 
        msg.type === 'status' && msg.message === 'Sandbox closed.'
      );
      
      if (hasStdout && hasError && hasCompleted) break;
      
      // Check timeout
      if (Date.now() - startTime > timeout) {
        console.log('WebSocket messages received:', wsMessages);
        throw new Error(`Test timed out after ${timeout}ms`);
      }
      
      // Wait a short time before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Validate correct error handling
    expect(wsMessages.some(msg => 
      msg.type === 'stdout' && msg.data.includes('About to divide by zero')
    )).toBe(true);
    
    // Verify error message in either stderr or result
    const hasError = wsMessages.some(msg => 
      (msg.type === 'stderr' && msg.data.includes('ZeroDivisionError')) ||
      (msg.type === 'result' && msg.error && msg.error.includes('ZeroDivisionError'))
    );
    expect(hasError).toBe(true);
    
    // Verify that execution terminated after the error
    expect(wsMessages.some(msg => 
      msg.type === 'status' && msg.message === 'Sandbox closed.'
    )).toBe(true);
  }, 30000); // Extended timeout for error handling
}); 