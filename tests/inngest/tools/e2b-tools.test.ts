import { expect, jest, test, describe, beforeEach, afterEach } from '@jest/globals';
import { executeCodeInSandbox, getActiveSandboxes, cleanupSandboxes } from '../../../src/inngest/tools/e2b-tools';
import axios from 'axios';

// Mock axios
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ status: 200 })
}));

// Mock the E2B service functions
jest.mock('@e2b/e2b-service', () => {
  return {
    createSandbox: jest.fn().mockResolvedValue('test-sandbox-id'),
    runCodeAndStream: jest.fn().mockResolvedValue(undefined),
    closeSandbox: jest.fn().mockResolvedValue(undefined),
    getActiveSandboxCount: jest.fn().mockReturnValue(5),
    cleanupAllSandboxes: jest.fn().mockResolvedValue(undefined)
  };
}, { virtual: true });

// Get the mocked functions from the mock
const createSandbox = jest.requireMock('@e2b/e2b-service').createSandbox;
const runCodeAndStream = jest.requireMock('@e2b/e2b-service').runCodeAndStream;
const closeSandbox = jest.requireMock('@e2b/e2b-service').closeSandbox;
const getActiveSandboxCount = jest.requireMock('@e2b/e2b-service').getActiveSandboxCount;
const cleanupAllSandboxes = jest.requireMock('@e2b/e2b-service').cleanupAllSandboxes;

describe('E2B Tools', () => {
  // Mock the step and network objects
  const mockStep = {
    run: jest.fn().mockImplementation((id, fn) => fn())
  };
  
  const mockNetwork = {
    state: {
      kv: {
        get: jest.fn(),
        set: jest.fn()
      }
    }
  };

  // Mock event data
  const mockEvent = {
    data: {
      clientId: 'test-client-id'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up process.env
    process.env.API_SERVER_PORT = '3000';
    
    // Default mock implementations
    (mockStep.run as jest.Mock).mockImplementation((id, fn) => fn());
    mockNetwork.state.kv.get.mockReturnValue(null);
    (createSandbox as jest.Mock).mockResolvedValue('test-sandbox-id');
    (runCodeAndStream as jest.Mock).mockResolvedValue(undefined);
    (closeSandbox as jest.Mock).mockResolvedValue(undefined);
    (getActiveSandboxCount as jest.Mock).mockReturnValue(5);
    (cleanupAllSandboxes as jest.Mock).mockResolvedValue(undefined);
  });

  describe('executeCodeInSandbox', () => {
    test('should create a sandbox, run code, and close sandbox when successful', async () => {
      // Arrange
      const code = 'console.log("Hello, World!")';
      const template = 'code-interpreter-v1';
      
      // Get clientId from event
      mockStep.event = mockEvent;

      // Act
      const result = await executeCodeInSandbox.handler(
        { code, template },
        { step: mockStep as any, network: mockNetwork as any }
      );

      // Assert
      expect(mockStep.run).toHaveBeenCalledTimes(3); // 3 steps: create, run, close
      expect(createSandbox).toHaveBeenCalledWith(template);
      expect(runCodeAndStream).toHaveBeenCalledWith('test-sandbox-id', code, 'test-client-id');
      expect(closeSandbox).toHaveBeenCalledWith('test-sandbox-id');
      expect(mockNetwork.state.kv.set).toHaveBeenCalledWith('lastSandboxId', 'test-sandbox-id');
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:3000/api/chat/execution-started',
        { clientId: 'test-client-id', sandboxId: 'test-sandbox-id' }
      );
      expect(result).toEqual({
        success: true,
        message: 'Code execution completed successfully. Output has been streamed to your terminal.',
        sandboxId: 'test-sandbox-id'
      });
    });

    test('should use clientId from network state if available', async () => {
      // Arrange
      const code = 'console.log("Hello, World!")';
      mockNetwork.state.kv.get.mockReturnValue('network-client-id');

      // Act
      const result = await executeCodeInSandbox.handler(
        { code },
        { step: mockStep as any, network: mockNetwork as any }
      );

      // Assert
      expect(mockNetwork.state.kv.get).toHaveBeenCalledWith('clientId');
      expect(runCodeAndStream).toHaveBeenCalledWith('test-sandbox-id', code, 'network-client-id');
      expect(result.success).toBe(true);
    });

    test('should return error if clientId is not found', async () => {
      // Arrange
      const code = 'console.log("Test")';
      
      // No clientId in network or event
      mockNetwork.state.kv.get.mockReturnValue(null);
      mockStep.event = { data: {} };

      // Act
      const result = await executeCodeInSandbox.handler(
        { code },
        { step: mockStep as any, network: mockNetwork as any }
      );

      // Assert
      expect(result).toEqual({
        error: 'Client ID not found for streaming. Cannot execute code without a client connection.'
      });
      expect(createSandbox).not.toHaveBeenCalled();
    });

    test('should handle createSandbox failure', async () => {
      // Arrange
      const code = 'console.log("Test")';
      mockStep.event = mockEvent;
      
      // Mock sandbox creation failure
      (createSandbox as jest.Mock).mockRejectedValue(new Error('Failed to create sandbox'));

      // Act
      const result = await executeCodeInSandbox.handler(
        { code },
        { step: mockStep as any, network: mockNetwork as any }
      );

      // Assert
      expect(result).toEqual({
        error: 'Failed to execute code: Failed to create sandbox',
        sandboxId: undefined
      });
      expect(closeSandbox).not.toHaveBeenCalled();
    });

    test('should handle runCodeAndStream failure and still close sandbox', async () => {
      // Arrange
      const code = 'console.log("Test")';
      mockStep.event = mockEvent;
      
      // Mock code execution failure
      (runCodeAndStream as jest.Mock).mockRejectedValue(new Error('Code execution failed'));

      // Act
      const result = await executeCodeInSandbox.handler(
        { code },
        { step: mockStep as any, network: mockNetwork as any }
      );

      // Assert
      expect(result).toEqual({
        error: 'Failed to execute code: Code execution failed',
        sandboxId: 'test-sandbox-id'
      });
      expect(closeSandbox).toHaveBeenCalledWith('test-sandbox-id');
    });

    test('should continue if API notification fails', async () => {
      // Arrange
      const code = 'console.log("Test")';
      mockStep.event = mockEvent;
      
      // Mock API notification failure
      (axios.post as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Act
      const result = await executeCodeInSandbox.handler(
        { code },
        { step: mockStep as any, network: mockNetwork as any }
      );

      // Assert
      expect(axios.post).toHaveBeenCalled();
      expect(runCodeAndStream).toHaveBeenCalled(); // Should still continue
      expect(result.success).toBe(true);
    });
  });

  describe('getActiveSandboxes', () => {
    test('should return the current count of active sandboxes', async () => {
      // Act
      const result = await getActiveSandboxes.handler(
        {},
        { step: mockStep as any }
      );

      // Assert
      expect(getActiveSandboxCount).toHaveBeenCalled();
      expect(result).toEqual({
        count: 5,
        message: 'There are currently 5 active sandbox instances.'
      });
    });
  });

  describe('cleanupSandboxes', () => {
    test('should clean up all active sandbox instances', async () => {
      // Act
      const result = await cleanupSandboxes.handler(
        {},
        { step: mockStep as any }
      );

      // Assert
      expect(cleanupAllSandboxes).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'All sandbox instances have been cleaned up.'
      });
    });
  });
}); 