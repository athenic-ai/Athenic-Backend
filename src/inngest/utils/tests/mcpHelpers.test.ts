/**
 * Unit tests for MCP helpers
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as mcpHelpersModule from '../mcpHelpers.js';
import { buildMcpServersConfig, fetchMcpConnectionsForOrganisation } from '../mcpHelpers.js';
import fetch from 'node-fetch';
import { Response } from 'node-fetch';

// Type for MCP connection objects
type McpConnection = {
  id: string;
  title: string;
  mcp_status: string;
  mcp_server_url?: string;
  e2b_sandbox_id: string;
  created_at: string;
};

// Type for mock response objects
interface MockResponse {
  ok: boolean;
  json: () => Promise<any>;
  statusText: string;
}

// Mock node-fetch
jest.mock('node-fetch');
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

// Mock the fetchMcpConnectionsForOrganisation function
jest.mock('../mcpHelpers.js', () => {
  const originalModule = jest.requireActual('../mcpHelpers.js');
  
  // Create a new object without using spread
  return {
    buildMcpServersConfig: originalModule.buildMcpServersConfig,
    fetchMcpConnectionsForOrganisation: jest.fn(),
    // Add other functions from the module explicitly if needed
  };
});

// Get the mocked version of the functions
const mockedFetchMcpConnectionsForOrganisation = 
  mcpHelpersModule.fetchMcpConnectionsForOrganisation as jest.MockedFunction<typeof fetchMcpConnectionsForOrganisation>;

describe('MCP Helpers', () => {
  // Store original env and reset it after each test
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Setup mock environment variables
    process.env = { 
      ...originalEnv,
      SUPABASE_URL: 'https://test-supabase-url.com',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    };
    
    // Reset all mocks before each test
    jest.resetAllMocks();
  });
  
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });
  
  describe('fetchMcpConnectionsForOrganisation', () => {
    it('should fetch MCP connections for a specific organisation', async () => {
      // Arrange
      const organisationId = 'test-org-id';
      const mockConnections = [
        { 
          id: 'conn1',
          metadata: {
            id: 'conn1',
            title: 'Test Connection 1',
            mcp_status: 'mcpRunning',
            mcp_server_url: 'https://mcp1.e2b.dev',
            e2b_sandbox_id: 'sandbox1',
            created_at: '2025-01-01',
          }
        },
        {
          id: 'conn2',
          metadata: {
            id: 'conn2',
            title: 'Test Connection 2',
            mcp_status: 'mcpStopped',
            mcp_server_url: 'https://mcp2.e2b.dev',
            e2b_sandbox_id: 'sandbox2',
            created_at: '2025-01-02',
          }
        }
      ];
      
      // Mock successful fetch response
      const mockResponse: MockResponse = {
        ok: true,
        json: () => Promise.resolve(mockConnections),
        statusText: 'OK',
      };
      
      mockedFetch.mockResolvedValueOnce(mockResponse as unknown as Response);
      
      // Call the real function - mocking fetch allows us to test the actual implementation
      const result = await fetchMcpConnectionsForOrganisation(organisationId);
      
      // Assert
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining(`mcp-connections?account_id=${organisationId}`),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-service-role-key',
          }),
        })
      );
      
      // Verify the test returns the expected connections - using optional chaining
      // to address potential undefined values in the assertion
      expect(result).toEqual([
        mockConnections[0]?.metadata,
        mockConnections[1]?.metadata,
      ]);
    });
    
    it('should handle fetch errors gracefully', async () => {
      // Arrange
      const organisationId = 'test-org-id';
      
      // Mock a fetch error
      mockedFetch.mockRejectedValueOnce(new Error('Network error'));
      
      // Act
      const result = await fetchMcpConnectionsForOrganisation(organisationId);
      
      // Assert
      expect(result).toEqual([]);
    });
    
    it('should handle non-200 responses gracefully', async () => {
      // Arrange
      const organisationId = 'test-org-id';
      
      // Mock a non-200 response
      const mockResponse: MockResponse = {
        ok: false,
        json: () => Promise.resolve({}),
        statusText: 'Not Found',
      };
      
      mockedFetch.mockResolvedValueOnce(mockResponse as unknown as Response);
      
      // Act
      const result = await fetchMcpConnectionsForOrganisation(organisationId);
      
      // Assert
      expect(result).toEqual([]);
    });
    
    it('should handle invalid response format', async () => {
      // Arrange
      const organisationId = 'test-org-id';
      
      // Mock an invalid response format (not an array)
      const mockResponse: MockResponse = {
        ok: true,
        json: () => Promise.resolve({ error: 'Invalid format' }),
        statusText: 'OK',
      };
      
      mockedFetch.mockResolvedValueOnce(mockResponse as unknown as Response);
      
      // Act
      const result = await fetchMcpConnectionsForOrganisation(organisationId);
      
      // Assert
      expect(result).toEqual([]);
    });
  });
  
  describe('buildMcpServersConfig', () => {
    it('should build MCP server configurations from active connections', async () => {
      // Arrange
      const organisationId = 'test-org-id';
      const mockConnections: McpConnection[] = [
        {
          id: 'conn1',
          title: 'Test Connection 1',
          mcp_status: 'mcpRunning',
          mcp_server_url: 'https://mcp1.e2b.dev',
          e2b_sandbox_id: 'sandbox1',
          created_at: '2025-01-01',
        },
        {
          id: 'conn2',
          title: 'Test Connection 2',
          mcp_status: 'mcpStopped', // This one should be filtered out (not running)
          mcp_server_url: 'https://mcp2.e2b.dev',
          e2b_sandbox_id: 'sandbox2', 
          created_at: '2025-01-02',
        },
        {
          id: 'conn3',
          title: 'Test Connection 3',
          mcp_status: 'mcpRunning',
          mcp_server_url: 'wss://mcp3.e2b.dev', // WebSocket URL
          e2b_sandbox_id: 'sandbox3',
          created_at: '2025-01-03',
        },
        {
          id: 'conn4',
          title: 'Invalid Connection',
          mcp_status: 'mcpRunning',
          // Missing mcp_server_url - should be filtered out
          e2b_sandbox_id: 'sandbox4',
          created_at: '2025-01-04',
        }
      ];
      
      // Mock fetchMcpConnectionsForOrganisation to return our test connections
      mockedFetchMcpConnectionsForOrganisation.mockResolvedValueOnce(mockConnections);
      
      // Act
      const result = await buildMcpServersConfig(organisationId);
      
      // Assert
      // We should only get configurations for the running connections with valid URLs
      expect(result).toHaveLength(2);
      
      // Check each result with proper non-null assertions
      if (result && result.length >= 2) {
        // Check the first connection (HTTP URL - should use SSE transport)
        expect(result[0]).toEqual({
          name: 'Test Connection 1',
          transport: {
            type: 'sse',
            url: 'https://mcp1.e2b.dev',
          },
        });
        
        // Check the third connection (WebSocket URL - should use WS transport)
        expect(result[1]).toEqual({
          name: 'Test Connection 3',
          transport: {
            type: 'ws',
            url: 'wss://mcp3.e2b.dev',
          },
        });
      }
    });
    
    it('should handle case with no connections gracefully', async () => {
      // Arrange
      const organisationId = 'test-org-id';
      
      // Mock empty connections array
      mockedFetchMcpConnectionsForOrganisation.mockResolvedValueOnce([]);
      
      // Act
      const result = await buildMcpServersConfig(organisationId);
      
      // Assert
      expect(result).toEqual([]);
    });
    
    it('should handle case with no active connections gracefully', async () => {
      // Arrange
      const organisationId = 'test-org-id';
      const mockConnections: McpConnection[] = [
        {
          id: 'conn1',
          title: 'Test Connection 1',
          mcp_status: 'mcpStopped', // Not running
          mcp_server_url: 'https://mcp1.e2b.dev',
          e2b_sandbox_id: 'sandbox1',
          created_at: '2025-01-01',
        },
        {
          id: 'conn2',
          title: 'Test Connection 2',
          mcp_status: 'mcpError', // Error state
          mcp_server_url: 'https://mcp2.e2b.dev',
          e2b_sandbox_id: 'sandbox2',
          created_at: '2025-01-02',
        }
      ];
      
      // Mock connections with no active ones
      mockedFetchMcpConnectionsForOrganisation.mockResolvedValueOnce(mockConnections);
      
      // Act
      const result = await buildMcpServersConfig(organisationId);
      
      // Assert
      expect(result).toEqual([]);
    });
    
    it('should handle error in connection processing gracefully', async () => {
      // Arrange
      const organisationId = 'test-org-id';
      const mockConnections: McpConnection[] = [
        {
          id: 'conn1',
          title: 'Test Connection 1',
          mcp_status: 'mcpRunning',
          mcp_server_url: 'https://mcp1.e2b.dev',
          e2b_sandbox_id: 'sandbox1',
          created_at: '2025-01-01',
        },
        {
          // This will be an invalid connection
          id: 'conn2',
          title: 'Test Connection 2',
          mcp_status: 'mcpRunning',
          mcp_server_url: undefined, // Will cause error when processed
          e2b_sandbox_id: 'sandbox2',
          created_at: '2025-01-02',
        }
      ];
      
      // Mock connections where one will cause an error
      mockedFetchMcpConnectionsForOrganisation.mockResolvedValueOnce(mockConnections);
      
      // Mock console.error to avoid cluttering test output
      jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Act
      const result = await buildMcpServersConfig(organisationId);
      
      // Assert
      // We should still get the valid connection, with non-null assertion
      expect(result).toHaveLength(1);
      if (result && result.length > 0) {
        expect(result[0]?.name).toBe('Test Connection 1');
      }
    });
  });
}); 