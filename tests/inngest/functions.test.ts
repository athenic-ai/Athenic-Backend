import { testFunction } from '../../src/inngest/functions';

// Mock the Inngest client and step functions
jest.mock('inngest', () => {
  const mockStepRun = jest.fn().mockImplementation((id, fn) => fn());
  const mockStep = { run: mockStepRun };

  return {
    mocks: {
      step: mockStep,
      stepRun: mockStepRun,
    },
  };
});

// Define a type for our mock function to avoid linter errors
type MockInngestFunction = {
  config: { id: string };
  eventTrigger: { event: string };
  handler: Function;
  __executeHandler: (event: any) => Promise<any>;
};

jest.mock('../../src/inngest/client', () => {
  return {
    inngest: {
      createFunction: jest.fn().mockImplementation((config, eventTrigger, handler) => {
        return {
          config,
          eventTrigger,
          handler,
          __executeHandler: async (event: any) => {
            const { mocks } = require('inngest');
            return handler({ event, step: mocks.step });
          },
        };
      }),
    },
  };
});

describe('Inngest Functions', () => {
  beforeEach(() => {
    // Clear all mock implementations and calls before each test
    jest.clearAllMocks();
  });

  test('testFunction should be defined with correct configuration', () => {
    // Verify the function is created with correct configuration
    expect(testFunction).toBeDefined();
    // Cast to our mock type to access the properties
    const mockTestFunction = testFunction as unknown as MockInngestFunction;
    expect(mockTestFunction.config.id).toBe('test-connection-handler');
    expect(mockTestFunction.eventTrigger.event).toBe('athenic/test.connection');
  });

  test('testFunction should process events correctly', async () => {
    // Create a test event
    const testEvent = {
      name: 'athenic/test.connection',
      data: {
        message: 'Testing Inngest connection',
        timestamp: '2025-04-15T12:00:00.000Z',
      },
    };

    // Cast to our mock type to access the __executeHandler method
    const mockTestFunction = testFunction as unknown as MockInngestFunction;
    
    // Execute the handler function
    const result = await mockTestFunction.__executeHandler(testEvent);

    // Verify the result
    expect(result).toEqual({
      message: `Processed test event: ${testEvent.data.message}`,
      receivedAt: expect.any(String),
      originalTimestamp: testEvent.data.timestamp,
    });

    // Get the mock
    const { mocks } = require('inngest');

    // Verify step.run was called twice
    expect(mocks.stepRun).toHaveBeenCalledTimes(2);
    
    // First step should be log-event-receipt
    expect(mocks.stepRun.mock.calls[0][0]).toBe('log-event-receipt');
    
    // Second step should be process-test-event
    expect(mocks.stepRun.mock.calls[1][0]).toBe('process-test-event');
  });
}); 