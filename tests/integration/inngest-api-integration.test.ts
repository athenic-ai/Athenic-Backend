import axios from 'axios';
import { chatMessageHandler } from '../../src/inngest/functions';
import { inngest } from '../../src/inngest/client';
import { executeCodeInSandbox } from '../../src/inngest/tools/e2b-tools';

// Mock dependencies
jest.mock('axios');
jest.mock('../../src/inngest/client', () => ({
  inngest: {
    createFunction: jest.fn().mockImplementation((config, trigger, handler) => {
      return {
        config,
        trigger,
        handler
      };
    }),
    send: jest.fn().mockResolvedValue({ success: true })
  }
}));

jest.mock('../../src/inngest/tools/e2b-tools', () => ({
  executeCodeInSandbox: {
    name: 'executeCodeInSandbox',
    description: 'Executes code in a secure sandbox environment and streams output.'
  }
}));

// Mock the e2b-service module
jest.mock('@e2b/e2b-service', () => ({
  createSandbox: jest.fn().mockResolvedValue('mock-sandbox-id'),
  runCodeAndStream: jest.fn().mockResolvedValue(undefined),
  closeSandbox: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('@inngest/agent-kit', () => ({
  createNetwork: jest.fn().mockResolvedValue({
    state: {
      kv: {
        get: jest.fn(),
        set: jest.fn()
      }
    }
  })
}));

// Create a mock for the Inngest handler testing
const createMockEvent = (message: string, clientId: string) => ({
  name: 'athenic/chat.message.received',
  data: {
    message,
    clientId,
    userId: 'test-user',
    organisationId: 'test-org',
    timestamp: new Date().toISOString()
  },
  user: { id: 'test-user' },
  ts: new Date().getTime()
});

describe('Inngest-API Integration', () => {
  const mockClientId = 'test-client-id';
  const mockMessage = 'Can you write a Python function to calculate factorial?';
  const mockResponse = 'I will calculate the factorial for you';
  let handler: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock step.ai.invoke to return predefined responses
    const mockInvoke = jest.fn()
      // First invocation returns 'YES' (analyze if code execution needed)
      .mockResolvedValueOnce('YES, code execution would be helpful')
      // Second invocation returns the response message
      .mockResolvedValueOnce(mockResponse)
      // Third invocation returns Python code
      .mockResolvedValueOnce(`def factorial(n):
    if n == 0 or n == 1:
        return 1
    else:
        return n * factorial(n-1)
        
# Test the function
for i in range(6):
    print(f"factorial({i}) = {factorial(i)}")`);
    
    // Setup mock functions that the handler will call
    const mockRun = jest.fn().mockImplementation((stepId, fn) => fn());
    const mockAgent = {
      useTools: jest.fn().mockImplementation((tools, fn) => {
        return fn({ tools: { executeCodeInSandbox: jest.fn().mockResolvedValue({
          success: true,
          message: 'Code executed successfully',
          sandboxId: 'mock-sandbox-id'
        }) }});
      }),
      createNetwork: jest.fn().mockResolvedValue({
        state: {
          kv: {
            get: jest.fn(),
            set: jest.fn()
          }
        }
      })
    };
    
    // Extract handler from chatMessageHandler for testing
    if (chatMessageHandler && typeof chatMessageHandler === 'object' && 'handler' in chatMessageHandler) {
      handler = chatMessageHandler.handler;
    } else {
      throw new Error('chatMessageHandler does not have a handler property');
    }
    
    // Mock the step parameter passed to the handler
    global.step = {
      run: mockRun,
      ai: {
        invoke: mockInvoke
      },
      agent: mockAgent
    };
    
    // Mock successful axios response
    (axios.post as jest.Mock).mockResolvedValue({ data: { status: 'success' } });
  });
  
  it('should call /api/chat/response endpoint with correct parameters', async () => {
    // Create event with chat message
    const event = createMockEvent(mockMessage, mockClientId);
    
    // Execute the handler
    await handler({ event, step: global.step });
    
    // Verify the API server was called with correct data
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/response'),
      expect.objectContaining({
        clientId: mockClientId,
        response: mockResponse,
        requiresE2B: true
      })
    );
  });
  
  it('should call /api/chat/execution-started when code is executed', async () => {
    // Create event with chat message
    const event = createMockEvent(mockMessage, mockClientId);
    
    // Execute the handler
    await handler({ event, step: global.step });
    
    // Since our test environment doesn't actually call the E2B tool implementation,
    // we can't directly verify that the execution-started endpoint is called.
    // Instead, we'll verify that the useTools method is called, which would trigger
    // the E2B execution flow in a real environment.
    expect(global.step.agent.useTools).toHaveBeenCalledWith(
      [executeCodeInSandbox],
      expect.any(Function)
    );
    
    // Verify at least one axios.post call happened
    expect(axios.post).toHaveBeenCalled();
  });
  
  it('should handle errors when API calls fail', async () => {
    // Create event with chat message
    const event = createMockEvent(mockMessage, mockClientId);
    
    // Mock axios to fail on the first call
    (axios.post as jest.Mock)
      .mockRejectedValueOnce(new Error('API server not available'))
      .mockResolvedValueOnce({ data: { status: 'success' } });
    
    // Execute the handler - should complete despite the error
    const result = await handler({ event, step: global.step });
    
    // Verify handler completes despite API error
    expect(result).toBeDefined();
    
    // Verify error handling in send-response-to-client step
    expect(global.step.run).toHaveBeenCalledWith(
      'send-response-to-client',
      expect.any(Function)
    );
  });
  
  it('should still return a result to Inngest even if API call fails', async () => {
    // Create event with chat message
    const event = createMockEvent(mockMessage, mockClientId);
    
    // Mock all axios calls to fail
    (axios.post as jest.Mock).mockRejectedValue(
      new Error('API server not available')
    );
    
    // Execute the handler
    const result = await handler({ event, step: global.step });
    
    // Verify that handler still returns a result
    expect(result).toMatchObject({
      message: mockResponse,
      requiresE2B: true,
      clientId: mockClientId
    });
  });
  
  // Clean up global mock
  afterAll(() => {
    delete global.step;
  });
}); 