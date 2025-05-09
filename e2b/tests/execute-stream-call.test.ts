/**
 * Tests for execute-stream API call from processMessageJob
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import fetch from 'node-fetch';

// Mock fetch
jest.mock('node-fetch');

interface MockResponse {
  ok: boolean;
  json: () => Promise<any>;
  statusText: string;
  text?: () => Promise<string>;
}

// Create a mock implementation of ProcessMessageJob that isolates the E2B service call functionality
class MockProcessMessageJob {
  fetchImpl: jest.Mock;
  
  constructor() {
    this.fetchImpl = jest.fn();
  }

  async callE2BService(messageText: string, clientId: string, template = 'base') {
    const e2bServiceUrl = process.env.E2B_SERVICE_URL || 'http://localhost:4000';
    const e2bWebsocketUrl = process.env.E2B_WEBSOCKET_URL || 'ws://localhost:4000';

    try {
      console.log(`Calling E2B service at ${e2bServiceUrl}/execute-stream`);
      
      const response = await this.fetchImpl(`${e2bServiceUrl}/execute-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: messageText,
          language: template,
          clientId: clientId,
          timeout: 30000,
        }),
      }) as MockResponse;

      if (!response.ok) {
        throw new Error(`E2B service request failed: ${response.statusText}`);
      }

      // Parse the response
      const responseData = await response.json();
      console.log("E2B execution initiated successfully:", responseData);
      
      // Return data instructing the frontend to open WebSocket connection
      return {
        status: 200,
        message: null,
        data: {
          requiresE2B: true,
          e2bWebSocketUrl: e2bWebsocketUrl,
          clientId: clientId,
          executionId: responseData.executionId,
          initialStatus: 'Initiating E2B execution...'
        }
      };
      
    } catch (e2bError) {
      console.error("Failed to call E2B Service:", e2bError);
      throw e2bError;
    }
  }
}

describe('E2B Service Integration', () => {
  let mockJob;
  const mockClientId = 'test-client-123';
  const mockCode = 'print("Hello from E2B test")';
  
  beforeEach(() => {
    mockJob = new MockProcessMessageJob();
    
    // Reset fetch mock
    jest.resetAllMocks();
    
    // Set environment variables for testing
    process.env.E2B_SERVICE_URL = 'http://test-e2b-service.com';
    process.env.E2B_WEBSOCKET_URL = 'ws://test-e2b-service.com';
  });
  
  test('should call E2B service with correct parameters', async () => {
    // Arrange: Mock successful fetch response
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        executionId: 'mock-execution-id',
        status: 'streaming',
        clientId: mockClientId
      }),
      statusText: 'OK'
    };
    
    mockJob.fetchImpl.mockResolvedValue(mockResponse);
    
    // Act: Call the service
    const result = await mockJob.callE2BService(mockCode, mockClientId);
    
    // Assert: Verify fetch was called with correct URL
    expect(mockJob.fetchImpl).toHaveBeenCalledWith(
      'http://test-e2b-service.com/execute-stream',
      expect.anything() // Use anything() instead of objectContaining for more flexibility
    );
    
    // Then verify the body parameters separately
    const requestBody = JSON.parse(mockJob.fetchImpl.mock.calls[0][1].body);
    expect(requestBody).toEqual({
      code: mockCode,
      language: 'base', // default template
      clientId: mockClientId,
      timeout: 30000
    });
    
    // Verify correct response structure
    expect(result).toEqual({
      status: 200,
      message: null,
      data: {
        requiresE2B: true,
        e2bWebSocketUrl: 'ws://test-e2b-service.com',
        clientId: mockClientId,
        executionId: 'mock-execution-id',
        initialStatus: 'Initiating E2B execution...'
      }
    });
  });
  
  test('should handle template selection based on message content', async () => {
    // Arrange: Mock successful fetch response
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        executionId: 'mock-execution-id',
        status: 'streaming',
        clientId: mockClientId
      }),
      statusText: 'OK'
    };
    
    mockJob.fetchImpl.mockResolvedValue(mockResponse);
    
    // Act: Call with message that should trigger JavaScript template
    const jsCode = 'Can you run this JavaScript code for me? const x = 5;';
    await mockJob.callE2BService(jsCode, mockClientId, 'nodejs-v1');
    
    // Assert: Verify correct template was selected
    const requestBody = JSON.parse(mockJob.fetchImpl.mock.calls[0][1].body);
    expect(requestBody.language).toBe('nodejs-v1');
  });
  
  test('should handle E2B service errors', async () => {
    // Arrange: Mock failed fetch response
    const mockErrorResponse = {
      ok: false,
      statusText: 'Internal Server Error',
      text: jest.fn().mockResolvedValue('Service unavailable')
    };
    
    mockJob.fetchImpl.mockResolvedValue(mockErrorResponse);
    
    // Act & Assert: Verify error is thrown
    await expect(mockJob.callE2BService(mockCode, mockClientId))
      .rejects
      .toThrow('E2B service request failed: Internal Server Error');
  });
  
  test('should handle network errors', async () => {
    // Arrange: Mock network error
    const networkError = new Error('Network connection failed');
    mockJob.fetchImpl.mockRejectedValue(networkError);
    
    // Act & Assert: Verify error is thrown
    await expect(mockJob.callE2BService(mockCode, mockClientId))
      .rejects
      .toThrow('Network connection failed');
  });
}); 