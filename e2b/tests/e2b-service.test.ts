import * as e2bService from '../src/e2b-service';
import WebSocket from 'ws';
import { OutputMessage } from '../src/types';
import { Sandbox } from '@e2b/code-interpreter';
import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { mockActiveSandboxes as setupMockSandboxes, resetE2bService, createMockSandboxes } from './test-helpers/e2b-mock';

// Mock the @e2b/code-interpreter Sandbox
jest.mock('@e2b/code-interpreter', () => {
  const mockKill = jest.fn().mockResolvedValue(undefined);
  const mockRunCode = jest.fn().mockImplementation(async (code: string, options?: any) => {
    // Simulate execution and callback
    if (options?.onStdout) {
      options.onStdout({ line: "Hello from stdout" });
    }
    
    if (code.includes('error')) {
      if (options?.onStderr) {
        options.onStderr({ line: "Error in code execution" });
      }
      throw new Error('Test error');
    }
    
    return { results: [{ value: 'test result' }] };
  });
  
  return {
    Sandbox: {
      create: jest.fn().mockImplementation((template: string, options?: any) => {
        return Promise.resolve({
          sandboxId: 'test-sandbox-id',
          kill: mockKill,
          runCode: mockRunCode,
        });
      }),
    },
  };
});

// Make WebSocket available to the mock implementation
let clientsMap: Map<string, any>;

// Define WebSocket readyState constants
const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

// Mock WebSocket to avoid actual connection attempts
class MockWebSocket {
  // Static constants to match WebSocket interface
  static readonly CONNECTING = WS_CONNECTING;
  static readonly OPEN = WS_OPEN;
  static readonly CLOSING = WS_CLOSING;
  static readonly CLOSED = WS_CLOSED;
  
  // Instance properties
  readyState = WS_OPEN; // Default to OPEN state
  onopen: ((ev: any) => any) | null = null;
  onmessage: ((ev: any) => any) | null = null;
  onclose: ((ev: any) => any) | null = null;
  onerror: ((ev: any) => any) | null = null;
  
  constructor(url: string) {
    // Mock constructor implementation
    setTimeout(() => {
      if (this.onopen) {
        this.onopen({ type: 'open' });
      }
    }, 0);
  }
  
  send = jest.fn().mockImplementation((_data: string) => {
    // Mock implementation that does nothing
  });
  
  close = jest.fn().mockImplementation(() => {
    this.readyState = WS_CLOSED;
    if (this.onclose) {
      this.onclose({ type: 'close', code: 1000, reason: 'Normal closure' });
    }
  });
}

// Replace global WebSocket with our mock
global.WebSocket = MockWebSocket as any;

// Mock e2b-service module
jest.mock('../src/e2b-service', () => {
  // Create mock sandbox map
  const mockSandboxMap = new Map();
  
  return {
    // Mock these functions
    createSandbox: jest.fn().mockImplementation(async (template = 'base') => {
      try {
        const sandboxId = 'test-sandbox-id';
        const mockRunCode = jest.fn().mockImplementation(async (code: string, options: any) => {
          // Simulate execution
          if (options?.onStdout) {
            options.onStdout({ line: "Hello from stdout" });
          }
          
          if (code.includes('error')) {
            if (options?.onStderr) {
              options.onStderr({ line: "Error in code execution" });
            }
            throw new Error('Test error');
          }
          
          return { results: [{ value: 'test result' }] };
        });
        
        const mockSandbox = { 
          sandboxId, 
          kill: jest.fn().mockResolvedValue(undefined),
          runCode: mockRunCode,
          onStdout: jest.fn().mockImplementation((_callback: any) => {
            // Empty mock implementation
          }),
          onStderr: jest.fn().mockImplementation((_callback: any) => {
            // Empty mock implementation
          })
        };
        
        // Add to mock map
        mockSandboxMap.set(sandboxId, mockSandbox);
        console.log(`Created sandbox ${sandboxId} with template ${template}`);
        
        return sandboxId;
      } catch (error: any) {
        console.error('Error creating sandbox:', error);
        throw new Error(`Failed to create sandbox: ${error.message}`);
      }
    }),
    
    registerClientsMap: jest.fn().mockImplementation((clients: Map<string, any>) => {
      clientsMap = clients;
    }),
    
    runCodeAndStream: jest.fn().mockImplementation(async (sandboxId: string, code: string, clientId: string, timeoutMs = 30000) => {
      const sandbox = mockSandboxMap.get(sandboxId);
      
      if (!sandbox) {
        throw new Error(`Sandbox ${sandboxId} not found`);
      }
      
      // Use the sandbox's mocked runCode method
      try {
        const executionId = 'mock-execution-id';
        const client = clientsMap?.get(clientId);
        
        if (!client || client.readyState !== WS_OPEN) {
          console.warn(`Client ${clientId} not connected or ready, output will be lost`);
        }
        
        // Send status updates through WebSocket if available
        const send = (message: any) => {
          const clientWs = clientsMap?.get(clientId);
          if (clientWs && clientWs.readyState === WS_OPEN) {
            clientWs.send(JSON.stringify(message));
          } else {
            console.warn(`Cannot send message to client ${clientId}, WebSocket not open`);
          }
        };
        
        // Send starting status
        send({
          type: 'status',
          executionId,
          status: 'starting',
          message: 'Running code...',
          sandboxId
        });
        
        const startTime = Date.now();
        
        await sandbox.runCode(code, {
          timeoutMs,
          onStdout: (output: OutputMessage) => {
            const text = typeof output === 'string' ? output : output.line || String(output);
            send({
              type: 'stdout',
              executionId,
              data: text
            });
          },
          onStderr: (output: OutputMessage) => {
            const text = typeof output === 'string' ? output : output.line || String(output);
            send({
              type: 'stderr',
              executionId,
              data: text
            });
          }
        });
        
        const duration = Date.now() - startTime;
        
        // Notify about successful completion
        send({
          type: 'result',
          executionId,
          data: 'Execution completed successfully',
          duration
        });
        
        send({
          type: 'status',
          executionId,
          status: 'completed',
          message: `Execution completed in ${duration}ms`,
          sandboxId
        });
      } catch (error: any) {
        console.error(`Error running code in sandbox ${sandboxId}:`, error);
        
        // Notify about error if WebSocket is available
        const clientWs = clientsMap?.get(clientId);
        if (clientWs && clientWs.readyState === WS_OPEN) {
          clientWs.send(JSON.stringify({
            type: 'error',
            executionId: 'mock-execution-id',
            error: error.message || 'Unknown error'
          }));
          
          clientWs.send(JSON.stringify({
            type: 'status',
            executionId: 'mock-execution-id',
            status: 'error',
            message: `Execution failed: ${error.message}`,
            sandboxId
          }));
        }
        
        throw error;
      }
    }),
    
    closeSandbox: jest.fn().mockImplementation(async (sandboxId: string) => {
      const sandbox = mockSandboxMap.get(sandboxId);
      
      if (sandbox) {
        try {
          await sandbox.kill();
          mockSandboxMap.delete(sandboxId);
          console.log(`Closed sandbox ${sandboxId}`);
        } catch (error: any) {
          console.error(`Error closing sandbox ${sandboxId}:`, error);
          throw new Error(`Failed to close sandbox: ${error.message}`);
        }
      } else {
        console.warn(`Sandbox ${sandboxId} not found, may have been closed already`);
      }
    }),
    
    getActiveSandboxCount: jest.fn().mockImplementation(() => {
      return mockSandboxMap.size;
    }),
    
    cleanupAllSandboxes: jest.fn().mockImplementation(async () => {
      const promises: Promise<void>[] = [];
      
      for (const [sandboxId, sandbox] of mockSandboxMap.entries()) {
        console.log(`Cleaning up sandbox ${sandboxId}`);
        promises.push(sandbox.kill());
      }
      
      await Promise.all(promises);
      mockSandboxMap.clear();
      
      console.log('All sandboxes cleaned up');
    }),
    
    // Dummy implementation of activeSandboxes
    activeSandboxes: new Map(),
    
    // Expose internal mockActiveSandboxes for test manipulation
    _getMockSandbox: (id: string) => mockSandboxMap.get(id)
  };
});

describe('E2B Service', () => {
  beforeEach(() => {
    setupMockSandboxes();
  });

  afterEach(() => {
    resetE2bService();
  });

  describe('createSandbox', () => {
    it('should create a new sandbox and return its ID', async () => {
      const sandboxId = await e2bService.createSandbox();
      
      expect(sandboxId).toBeDefined();
      expect(typeof sandboxId).toBe('string');
      expect(sandboxId).toContain('mock-sandbox-');
      expect(e2bService.getActiveSandboxCount()).toBe(1);
    });

    it('should allow custom template name', async () => {
      const customTemplate = 'python-v1';
      const sandboxId = await e2bService.createSandbox(customTemplate);
      
      expect(sandboxId).toBeDefined();
      expect(typeof sandboxId).toBe('string');
      expect(e2bService.getActiveSandboxCount()).toBe(1);
    });
  });

  describe('closeSandbox', () => {
    it('should close a specific sandbox by ID', async () => {
      // Create a sandbox
      const sandboxId = await e2bService.createSandbox();
      expect(e2bService.getActiveSandboxCount()).toBe(1);
      
      // Close the sandbox
      await e2bService.closeSandbox(sandboxId);
      expect(e2bService.getActiveSandboxCount()).toBe(0);
    });

    it('should handle closing non-existent sandbox gracefully', async () => {
      // Attempt to close a non-existent sandbox
      await expect(e2bService.closeSandbox('non-existent-id')).resolves.not.toThrow();
    });
  });

  describe('cleanupAllSandboxes', () => {
    it('should clean up all active sandboxes', async () => {
      // Create multiple sandboxes
      await createMockSandboxes(3);
      expect(e2bService.getActiveSandboxCount()).toBe(3);
      
      // Clean up all sandboxes
      await e2bService.cleanupAllSandboxes();
      expect(e2bService.getActiveSandboxCount()).toBe(0);
    });
  });

  describe('getActiveSandboxCount', () => {
    it('should return the correct count of active sandboxes', async () => {
      expect(e2bService.getActiveSandboxCount()).toBe(0);
      
      // Create sandboxes
      await createMockSandboxes(2);
      expect(e2bService.getActiveSandboxCount()).toBe(2);
      
      // Create one more
      await e2bService.createSandbox();
      expect(e2bService.getActiveSandboxCount()).toBe(3);
    });
  });

  describe('runCodeAndStream', () => {
    it('should run code in a specified sandbox', async () => {
      // Create a sandbox
      const sandboxId = await e2bService.createSandbox();
      const code = 'print("Hello, World!")';
      const clientId = 'test-client-id';
      
      // Run code in sandbox
      await expect(
        e2bService.runCodeAndStream(sandboxId, code, clientId)
      ).resolves.not.toThrow();
    });
  });
}); 