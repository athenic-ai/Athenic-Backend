import { Server } from 'http';
import WebSocket from 'ws';
import axios from 'axios';
import { startServer, createSandbox, runCodeAndStream, closeSandbox } from '../src/server';

// Mock @e2b/code-interpreter to avoid actually creating sandboxes
jest.mock('@e2b/code-interpreter', () => {
  const mockKill = jest.fn().mockResolvedValue(undefined);
  const mockRunCode = jest.fn().mockImplementation(async (code, options) => {
    // Simulate output
    if (options?.onStdout) {
      options.onStdout({ line: "Test output" });
      options.onStdout({ line: "More output" });
    }
    
    // Simulate error if code contains 'error'
    if (code.includes('error')) {
      if (options?.onStderr) {
        options.onStderr({ line: "Test error" });
      }
      throw new Error('Execution failed');
    }
    
    return { results: [{ value: 'success' }] };
  });
  
  return {
    Sandbox: {
      create: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          sandboxId: 'test-integration-sandbox-id',
          kill: mockKill,
          runCode: mockRunCode,
        });
      }),
    },
  };
});

describe('E2B Server Integration', () => {
  let server: Server;
  let baseUrl: string;
  let serverPort: number;
  
  beforeAll(async () => {
    // Start the server on a random port
    server = await startServer();
    serverPort = (server.address() as any).port;
    baseUrl = `http://localhost:${serverPort}`;
    
    console.log(`Server started on ${baseUrl}`);
  });
  
  afterAll(() => {
    // Close the server
    server.close();
  });
  
  it('should respond to health check', async () => {
    const response = await axios.get(`${baseUrl}/health`);
    
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('status', 'healthy');
  });
  
  it('should analyze execution needs', async () => {
    const response = await axios.post(`${baseUrl}/analyze-execution-needs`, {
      message: 'Run this Python code: print("Hello")'
    });
    
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('requiresExecution', true);
  });
  
  it('should execute code synchronously', async () => {
    const response = await axios.post(`${baseUrl}/execute`, {
      code: 'console.log("Hello World")',
      language: 'javascript'
    });
    
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('executionId');
    expect(response.data).toHaveProperty('result');
  });
  
  it('should handle streaming code execution with deprecated endpoint', async () => {
    const clientId = 'test-client-' + Math.random().toString(36).substring(2);
    
    // Connect WebSocket
    const ws = new WebSocket(`ws://localhost:${serverPort}?clientId=${clientId}`);
    
    // Wait for connection
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        resolve();
      });
    });
    
    // Collect messages
    const messages: string[] = [];
    ws.on('message', (data) => {
      messages.push(data.toString());
    });
    
    // Execute code with streaming
    const response = await axios.post(`${baseUrl}/execute-stream`, {
      code: 'console.log("Hello from integration test")',
      clientId
    });
    
    expect(response.status).toBe(202);
    
    // Wait for messages (with timeout)
    await new Promise<void>((resolve) => {
      const checkMessages = () => {
        // Look for result message
        if (messages.some(msg => JSON.parse(msg).type === 'result')) {
          resolve();
          return;
        }
        
        setTimeout(checkMessages, 100);
      };
      
      setTimeout(checkMessages, 100);
    });
    
    // Close WebSocket
    ws.close();
    
    // Verify messages
    const parsedMessages = messages.map(msg => JSON.parse(msg));
    
    // Should have welcome message
    expect(parsedMessages.some(msg => 
      msg.type === 'status' && msg.status === 'connected'
    )).toBe(true);
    
    // Should have stdout messages
    expect(parsedMessages.some(msg => 
      msg.type === 'stdout'
    )).toBe(true);
    
    // Should have result message
    expect(parsedMessages.some(msg => 
      msg.type === 'result'
    )).toBe(true);
  });
  
  it('should expose methods for AgentKit tools', async () => {
    // Test the exported functions directly
    
    // Create sandbox
    const sandboxId = await createSandbox();
    expect(sandboxId).toBe('test-integration-sandbox-id');
    
    // Set up WebSocket to receive messages
    const clientId = 'agent-kit-test-' + Math.random().toString(36).substring(2);
    const ws = new WebSocket(`ws://localhost:${serverPort}?clientId=${clientId}`);
    
    // Wait for connection
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        resolve();
      });
    });
    
    // Collect messages
    const messages: string[] = [];
    ws.on('message', (data) => {
      messages.push(data.toString());
    });
    
    // Run code via AgentKit method
    await runCodeAndStream(sandboxId, 'console.log("Hello from AgentKit")', clientId);
    
    // Close sandbox
    await closeSandbox(sandboxId);
    
    // Close WebSocket
    ws.close();
    
    // Verify messages
    const parsedMessages = messages.map(msg => JSON.parse(msg));
    
    // Should have welcome message
    expect(parsedMessages.some(msg => 
      msg.type === 'status' && msg.status === 'connected'
    )).toBe(true);
    
    // Should have status messages
    expect(parsedMessages.some(msg => 
      msg.type === 'status' && msg.status === 'starting'
    )).toBe(true);
    
    // Should have stdout messages
    expect(parsedMessages.some(msg => 
      msg.type === 'stdout'
    )).toBe(true);
    
    // Should have result message
    expect(parsedMessages.some(msg => 
      msg.type === 'result'
    )).toBe(true);
    
    // Should have completed status
    expect(parsedMessages.some(msg => 
      msg.type === 'status' && msg.status === 'completed'
    )).toBe(true);
  });
}); 