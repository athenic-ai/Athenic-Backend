import { inngest, testInngestConnection } from '../../src/inngest/client';

// Mock the Inngest client
jest.mock('inngest', () => {
  const mocks = {
    send: jest.fn().mockResolvedValue({ success: true }),
  };

  return {
    Inngest: jest.fn().mockImplementation(() => ({
      send: mocks.send,
    })),
    mocks,
  };
});

describe('Inngest Client', () => {
  beforeEach(() => {
    // Clear all mock implementations and calls before each test
    jest.clearAllMocks();
  });

  test('should initialize Inngest client with correct configuration', () => {
    // Verify the client is created
    expect(inngest).toBeDefined();
  });

  test('testInngestConnection should send a test event', async () => {
    // Get the mock implementation
    const { mocks } = require('inngest');

    // Test the connection function
    const result = await testInngestConnection();

    // Verify the test was successful
    expect(result).toBeTruthy();
    
    // Verify send was called with the correct event
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'athenic/test.connection',
        data: expect.objectContaining({
          message: 'Testing Inngest connection',
          timestamp: expect.any(String),
        }),
      })
    );
  });

  test('testInngestConnection should handle errors properly', async () => {
    // Get the mock implementation
    const { mocks } = require('inngest');

    // Make the send function throw an error
    mocks.send.mockRejectedValueOnce(new Error('Test error'));

    // Test the connection function
    const result = await testInngestConnection();

    // Verify the test failed
    expect(result).toBeFalsy();
  });
}); 