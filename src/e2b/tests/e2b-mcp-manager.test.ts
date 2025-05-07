import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { 
  deployMcpServer, 
  getMcpServerStatus, 
  stopMcpServer, 
  extendMcpServerTimeout 
} from '../e2b-mcp-manager.js';
import { Sandbox } from '@e2b/code-interpreter';

// Mock the E2B Sandbox class
jest.mock('@e2b/code-interpreter', () => {
  // Mock sandbox instance that will be returned by Sandbox.create
  const mockSandbox = {
    sandboxId: 'test-sandbox-id',
    network: {
      startProxy: jest.fn().mockResolvedValue('https://test-proxy-url.e2b.dev') 
    },
    process: {
      startAndWait: jest.fn().mockResolvedValue({}),
      start: jest.fn().mockResolvedValue({})
    },
    setTimeout: jest.fn().mockResolvedValue({}),
    kill: jest.fn().mockResolvedValue({}),
    isRunning: jest.fn().mockResolvedValue(true)
  };
  
  // Mock Sandbox static methods with any type to avoid type errors
  return {
    Sandbox: {
      create: jest.fn().mockResolvedValue(mockSandbox),
      reconnect: jest.fn().mockResolvedValue(mockSandbox)
    }
  } as any;
});

// Mock fetch function for testing waitForMcpServerReady
global.fetch = jest.fn().mockImplementation(() => 
  Promise.resolve({
    status: 200,
    json: () => Promise.resolve({ ok: true })
  } as Response)
) as any;

describe('E2B MCP Manager', () => {
  const mockServerObject = {
    id: 'test-server-id',
    metadata: {
      title: 'Test MCP Server',
      start_command: 'npx -y @modelcontextprotocol/server-test',
      default_timeout: 600000
    }
  };
  
  const userProvidedEnvs = {
    TEST_API_KEY: 'test-api-key',
    NORMAL_VAR: 'test-value'
  };
  
  const mockAccountId = 'test-account-id';
  
  describe('deployMcpServer', () => {
    it('should deploy an MCP server in an E2B sandbox', async () => {
      // Act
      const result = await deployMcpServer(mockServerObject, userProvidedEnvs, mockAccountId);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.sandboxId).toBe('test-sandbox-id');
      expect(result.serverUrl).toBe('https://test-proxy-url.e2b.dev');
      expect(result.sandbox).toBeDefined();
      
      // Verify the E2B Sandbox was created with the right parameters
      const { Sandbox } = require('@e2b/code-interpreter');
      expect(Sandbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMs: mockServerObject.metadata.default_timeout,
        })
      );
      
      // Verify that supergateway was installed
      expect(result.sandbox.process.startAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          cmd: 'npm install -g supergateway'
        })
      );
      
      // Verify that the MCP server was started with environment variables
      expect(result.sandbox.process.start).toHaveBeenCalledWith(
        expect.objectContaining({
          cmd: expect.stringContaining(mockServerObject.metadata.start_command),
        })
      );
    });
    
    it('should throw an error if the MCP server object is missing start_command', async () => {
      // Arrange
      const invalidServerObject = {
        id: 'invalid-server-id',
        metadata: {
          title: 'Invalid Server',
          // Missing start_command
          default_timeout: 600000
        }
      };
      
      // Act & Assert
      await expect(deployMcpServer(invalidServerObject, userProvidedEnvs, mockAccountId))
        .rejects.toThrow('MCP server object is missing the start_command in metadata');
    });
  });
  
  describe('getMcpServerStatus', () => {
    it('should return mcpRunning for a running sandbox', async () => {
      // Arrange
      const { Sandbox } = require('@e2b/code-interpreter');
      const mockSandbox = Sandbox.reconnect.mock.results[0].value;
      mockSandbox.isRunning.mockResolvedValueOnce(true);
      
      // Act
      const status = await getMcpServerStatus('test-sandbox-id');
      
      // Assert
      expect(status).toBe('mcpRunning');
      expect(Sandbox.reconnect).toHaveBeenCalledWith('test-sandbox-id', expect.any(Object));
    });
    
    it('should return mcpStopped for a stopped sandbox', async () => {
      // Arrange
      const { Sandbox } = require('@e2b/code-interpreter');
      const mockSandbox = Sandbox.reconnect.mock.results[0].value;
      mockSandbox.isRunning.mockResolvedValueOnce(false);
      
      // Act
      const status = await getMcpServerStatus('test-sandbox-id');
      
      // Assert
      expect(status).toBe('mcpStopped');
    });
    
    it('should return mcpError if reconnecting fails', async () => {
      // Arrange
      const { Sandbox } = require('@e2b/code-interpreter');
      Sandbox.reconnect.mockRejectedValueOnce(new Error('Sandbox not found'));
      
      // Act
      const status = await getMcpServerStatus('non-existent-sandbox-id');
      
      // Assert
      expect(status).toBe('mcpError');
    });
  });
  
  describe('stopMcpServer', () => {
    it('should stop an MCP server in an E2B sandbox', async () => {
      // Arrange
      const { Sandbox } = require('@e2b/code-interpreter');
      const mockSandbox = Sandbox.reconnect.mock.results[0].value;
      
      // Act
      await stopMcpServer('test-sandbox-id');
      
      // Assert
      expect(Sandbox.reconnect).toHaveBeenCalledWith('test-sandbox-id', expect.any(Object));
      expect(mockSandbox.kill).toHaveBeenCalled();
    });
    
    it('should not throw if the sandbox does not exist', async () => {
      // Arrange
      const { Sandbox } = require('@e2b/code-interpreter');
      Sandbox.reconnect.mockRejectedValueOnce(new Error('Sandbox not found'));
      
      // Act & Assert
      await expect(stopMcpServer('non-existent-sandbox-id'))
        .resolves.not.toThrow();
    });
  });
  
  describe('extendMcpServerTimeout', () => {
    it('should extend the timeout of an MCP server in an E2B sandbox', async () => {
      // Arrange
      const { Sandbox } = require('@e2b/code-interpreter');
      const mockSandbox = Sandbox.reconnect.mock.results[0].value;
      const newTimeoutMs = 1800000; // 30 minutes
      
      // Act
      await extendMcpServerTimeout('test-sandbox-id', newTimeoutMs);
      
      // Assert
      expect(Sandbox.reconnect).toHaveBeenCalledWith('test-sandbox-id', expect.any(Object));
      expect(mockSandbox.setTimeout).toHaveBeenCalledWith(newTimeoutMs);
    });
    
    it('should use default timeout if not specified', async () => {
      // Arrange
      const { Sandbox } = require('@e2b/code-interpreter');
      const mockSandbox = Sandbox.reconnect.mock.results[0].value;
      const defaultTimeoutMs = 30 * 60 * 1000; // 30 minutes
      
      // Act
      await extendMcpServerTimeout('test-sandbox-id', defaultTimeoutMs);
      
      // Assert
      expect(mockSandbox.setTimeout).toHaveBeenCalledWith(expect.any(Number));
    });
    
    it('should not throw if the sandbox does not exist', async () => {
      // Arrange
      const { Sandbox } = require('@e2b/code-interpreter');
      Sandbox.reconnect.mockRejectedValueOnce(new Error('Sandbox not found'));
      const defaultTimeoutMs = 30 * 60 * 1000; // 30 minutes
      
      // Act & Assert
      await expect(extendMcpServerTimeout('non-existent-sandbox-id', defaultTimeoutMs))
        .resolves.not.toThrow();
    });
  });
}); 