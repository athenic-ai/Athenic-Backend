import { jest } from '@jest/globals';
import axios from 'axios';
import { inngest } from '../../src/inngest/client';
import * as functionModule from '../../src/inngest/functions';
import { createNetwork } from '@inngest/agent-kit';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock createNetwork function
jest.mock('@inngest/agent-kit', () => ({
  createNetwork: jest.fn().mockResolvedValue({
    state: {
      kv: {
        get: jest.fn(),
        set: jest.fn(),
      }
    }
  })
}));

// Mock the Inngest client createFunction method
jest.mock('../../src/inngest/client', () => ({
  inngest: {
    createFunction: jest.fn().mockImplementation((config, triggers, handler) => {
      return {
        config,
        triggers,
        handler,
        // Add mock functions for testing
        __handler: handler
      };
    })
  }
}));

describe('Inngest Functions', () => {
  const { testFunction, chatMessageHandler } = functionModule;
  
  beforeEach(() => {
    // Clear all mock implementations and calls before each test
    jest.clearAllMocks();
    
    // Mock successful axios response
    mockedAxios.post.mockResolvedValue({ data: { success: true } });
  });

  it('testFunction should be defined with correct configuration', () => {
    expect(testFunction).toBeDefined();
    expect(testFunction.config).toEqual({ id: 'test-connection-handler' });
    expect(testFunction.triggers).toEqual({ event: 'athenic/test.connection' });
  });

  it('chatMessageHandler should be defined with correct configuration', () => {
    expect(chatMessageHandler).toBeDefined();
    expect(chatMessageHandler.config).toEqual({ id: 'chat-message-handler' });
    expect(chatMessageHandler.triggers).toEqual({ event: 'athenic/chat.message.received' });
  });
  
  describe('chatMessageHandler', () => {
    it('should process chat messages that do not require E2B', async () => {
      // Create mock event data
      const mockEvent = {
        data: {
          message: 'Hello, how are you today?',
          clientId: 'test-client-123',
          userId: 'user-123',
          orgId: 'org-456'
        }
      };
      
      // Create mock step object with AI capabilities
      const mockStep = {
        run: jest.fn().mockImplementation((id, fn) => fn()),
        ai: {
          invoke: jest.fn().mockImplementation(({ messages }) => {
            // Check if this is the analysis prompt
            if (messages[1]?.content?.includes('Would code execution be helpful')) {
              return 'NO, this is a general conversation.';
            }
            // Return a generic response for regular message
            return 'Hello! I\'m doing well. How can I help you today?';
          })
        }
      };
      
      // Call the handler directly
      const result = await chatMessageHandler.__handler({ event: mockEvent, step: mockStep } as any);
      
      // Verify steps were run
      expect(mockStep.run).toHaveBeenCalledWith('log-chat-message', expect.any(Function));
      expect(mockStep.run).toHaveBeenCalledWith('create-agent-network', expect.any(Function));
      expect(mockStep.run).toHaveBeenCalledWith('analyze-execution-needs', expect.any(Function));
      expect(mockStep.run).toHaveBeenCalledWith('generate-response', expect.any(Function));
      expect(mockStep.run).toHaveBeenCalledWith('send-response-to-client', expect.any(Function));
      
      // Verify AI was invoked with the analysis prompt
      expect(mockStep.ai.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Would code execution be helpful')
            })
          ])
        })
      );
      
      // Verify AI was invoked with the response prompt
      expect(mockStep.ai.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Generate a helpful, informative')
            })
          ])
        })
      );
      
      // Verify response was sent to client
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/response'),
        expect.objectContaining({
          clientId: 'test-client-123',
          requiresE2B: false
        })
      );
      
      // Verify the result
      expect(result).toEqual({
        message: expect.any(String),
        requiresE2B: false,
        e2bResult: null,
        clientId: 'test-client-123',
        timestamp: expect.any(String)
      });
    });
    
    it('should process chat messages that require E2B', async () => {
      // Create mock event data with a message that would require code execution
      const mockEvent = {
        data: {
          message: 'Write a Python function to calculate Fibonacci numbers',
          clientId: 'test-client-456',
          userId: 'user-123',
          orgId: 'org-456'
        }
      };
      
      // Mock E2B execution result
      const mockE2BResult = {
        success: true,
        message: 'Code execution completed successfully.',
        sandboxId: 'test-sandbox-123'
      };
      
      // Create mock step object with AI capabilities and agent tools
      const mockStep = {
        run: jest.fn().mockImplementation((id, fn) => fn()),
        ai: {
          invoke: jest.fn().mockImplementation(({ messages }) => {
            // Check if this is the analysis prompt
            if (messages[1]?.content?.includes('Would code execution be helpful')) {
              return 'YES, this requires code execution.';
            }
            // Check if this is preparing a response about code execution
            if (messages[1]?.content?.includes('The user\'s request requires code execution')) {
              return 'I\'ll write a Python function to calculate Fibonacci numbers for you.';
            }
            // Check if this is generating code
            if (messages[1]?.content?.includes('Generate appropriate code to address this request')) {
              return `
def fibonacci(n):
    """Calculate the nth Fibonacci number recursively."""
    if n <= 0:
        return 0
    elif n == 1:
        return 1
    else:
        return fibonacci(n-1) + fibonacci(n-2)

# Test the function
for i in range(10):
    print(f"Fibonacci({i}) = {fibonacci(i)}")
              `;
            }
            // Default response
            return 'Default response';
          })
        },
        agent: {
          useTools: jest.fn().mockImplementation((tools, fn) => {
            // Call the function with mock tools
            return fn({ 
              tools: { 
                executeCodeInSandbox: jest.fn().mockResolvedValue(mockE2BResult) 
              } 
            });
          })
        }
      };
      
      // Call the handler directly
      const result = await chatMessageHandler.__handler({ event: mockEvent, step: mockStep } as any);
      
      // Verify steps were run
      expect(mockStep.run).toHaveBeenCalledWith('log-chat-message', expect.any(Function));
      expect(mockStep.run).toHaveBeenCalledWith('create-agent-network', expect.any(Function));
      expect(mockStep.run).toHaveBeenCalledWith('analyze-execution-needs', expect.any(Function));
      expect(mockStep.run).toHaveBeenCalledWith('prepare-response-with-e2b', expect.any(Function));
      expect(mockStep.run).toHaveBeenCalledWith('send-response-to-client', expect.any(Function));
      
      // Verify AI was called for analysis and determined code execution was needed
      expect(mockStep.ai.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Would code execution be helpful')
            })
          ])
        })
      );
      
      // Verify AI was called to generate a response about code execution
      expect(mockStep.ai.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('The user\'s request requires code execution')
            })
          ])
        })
      );
      
      // Verify AI was called to generate code
      expect(mockStep.ai.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Generate appropriate code to address this request')
            })
          ])
        })
      );
      
      // Verify agent tools were used
      expect(mockStep.agent.useTools).toHaveBeenCalledWith(
        expect.arrayContaining([expect.anything()]), 
        expect.any(Function)
      );
      
      // Verify response was sent to client
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/response'),
        expect.objectContaining({
          clientId: 'test-client-456',
          requiresE2B: true,
          e2bResult: mockE2BResult
        })
      );
      
      // Verify the result
      expect(result).toEqual({
        message: expect.any(String),
        requiresE2B: true,
        e2bResult: mockE2BResult,
        clientId: 'test-client-456',
        timestamp: expect.any(String)
      });
    });
    
    it('should handle errors from LLM invocation', async () => {
      // Create mock event data
      const mockEvent = {
        data: {
          message: 'Hello, how are you today?',
          clientId: 'test-client-error',
          userId: 'user-123',
          orgId: 'org-456'
        }
      };
      
      // Create mock step object with AI that throws an error
      const mockStep = {
        run: jest.fn().mockImplementation((id, fn) => {
          // Simulate error in analyze-execution-needs step
          if (id === 'analyze-execution-needs') {
            throw new Error('LLM service unavailable');
          }
          return fn();
        }),
        ai: {
          invoke: jest.fn().mockRejectedValue(new Error('LLM service unavailable'))
        }
      };
      
      // Call the handler and expect it to throw an error
      await expect(
        chatMessageHandler.__handler({ event: mockEvent, step: mockStep } as any)
      ).rejects.toThrow('LLM service unavailable');
      
      // Verify run was called for initial steps
      expect(mockStep.run).toHaveBeenCalledWith('log-chat-message', expect.any(Function));
      expect(mockStep.run).toHaveBeenCalledWith('create-agent-network', expect.any(Function));
      expect(mockStep.run).toHaveBeenCalledWith('analyze-execution-needs', expect.any(Function));
    });
    
    it('should handle errors when sending response to client', async () => {
      // Mock axios to fail
      mockedAxios.post.mockRejectedValue(new Error('Network error'));
      
      // Create mock event
      const mockEvent = {
        data: {
          message: 'Hello there',
          clientId: 'test-client-789',
          userId: 'user-123',
          orgId: 'org-456'
        }
      };
      
      // Create mock step with required AI capabilities
      const mockStep = {
        run: jest.fn().mockImplementation((id, fn) => fn()),
        ai: {
          invoke: jest.fn().mockImplementation(({ messages }) => {
            // For the analysis step
            if (messages[1]?.content?.includes('Would code execution be helpful')) {
              return 'NO, this is a greeting.';
            }
            // For the response step
            return 'Hello! How can I help you today?';
          })
        }
      };
      
      // Call the handler directly
      const result = await chatMessageHandler.__handler({ event: mockEvent, step: mockStep } as any);
      
      // Verify error was handled and result was still returned
      expect(result).toEqual({
        message: expect.any(String),
        requiresE2B: false,
        e2bResult: null,
        clientId: 'test-client-789',
        timestamp: expect.any(String)
      });
      
      // Verify axios was called
      expect(mockedAxios.post).toHaveBeenCalled();
      
      // Verify the error was logged
      expect(mockStep.run).toHaveBeenCalledWith('send-response-to-client', expect.any(Function));
    });
  });
}); 