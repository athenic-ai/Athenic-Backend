/**
 * Tests for the E2B Sandbox Manager
 */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { E2BSandboxManager } from '../e2b-sandbox-manager.js';
import { Sandbox } from '@e2b/code-interpreter';
import { LogLevel } from '../../utils/logger.js';

// Mock E2B Sandbox
jest.mock('@e2b/code-interpreter', () => {
  const mockSandbox = {
    sandboxId: 'mock-sandbox-id',
    isRunning: jest.fn().mockResolvedValue(true),
    setTimeout: jest.fn().mockResolvedValue(undefined),
    kill: jest.fn().mockResolvedValue(undefined),
    network: {
      startProxy: jest.fn().mockResolvedValue('https://mock-sandbox-url.com'),
    },
    process: {
      start: jest.fn().mockResolvedValue(undefined),
      startAndWait: jest.fn().mockResolvedValue(undefined),
    },
  };
  
  return {
    Sandbox: {
      create: jest.fn().mockResolvedValue(mockSandbox),
    },
  };
});

describe('E2BSandboxManager', () => {
  let sandboxManager: E2BSandboxManager;
  const mockApiKey = 'mock-api-key';
  
  // Setup a clean instance before each test
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock console methods to prevent test output clutter
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Get the singleton instance with test config
    sandboxManager = E2BSandboxManager.getInstance({
      autoStartCleanup: false, // Disable auto-cleanup to control test timing
      logLevel: LogLevel.ERROR, // Minimize logging
      cleanupIntervalMs: 100, // Use short interval for testing
      maxIdleTimeMs: 200, // Use short idle time for testing
    });
  });
  
  // Cleanup after all tests
  afterAll(async () => {
    // Make sure cleanup runs and timers are cleared
    await E2BSandboxManager.getInstance().cleanupAllSandboxes();
  });
  
  describe('Sandbox Creation and Tracking', () => {
    it('should create and track a new sandbox', async () => {
      // Act
      const { sandbox, sandboxId } = await sandboxManager.createSandbox(
        mockApiKey, 
        'test-purpose'
      );
      
      // Assert
      expect(sandboxId).toBe('mock-sandbox-id');
      expect(sandbox).toBeDefined();
      expect(Sandbox.create).toHaveBeenCalledWith({
        apiKey: mockApiKey,
        timeoutMs: expect.any(Number)
      });
      
      // Verify the sandbox is tracked
      const trackedSandbox = sandboxManager.getSandbox(sandboxId);
      expect(trackedSandbox).toBeDefined();
      expect(trackedSandbox?.purpose).toBe('test-purpose');
      expect(trackedSandbox?.status).toBe('running');
    });
    
    it('should check if a sandbox is running', async () => {
      // Arrange
      const { sandboxId } = await sandboxManager.createSandbox(mockApiKey, 'test-purpose');
      
      // Mock the isRunning response
      const mockIsRunning = Sandbox.create().isRunning as jest.Mock;
      mockIsRunning.mockResolvedValueOnce(true);
      
      // Act
      const isRunning = await sandboxManager.isSandboxRunning(sandboxId);
      
      // Assert
      expect(isRunning).toBe(true);
      expect(mockIsRunning).toHaveBeenCalled();
    });
    
    it('should update tracked sandbox status when sandbox stops running', async () => {
      // Arrange
      const { sandboxId } = await sandboxManager.createSandbox(mockApiKey, 'test-purpose');
      
      // Mock the isRunning response to indicate the sandbox has stopped
      const mockIsRunning = Sandbox.create().isRunning as jest.Mock;
      mockIsRunning.mockResolvedValueOnce(false);
      
      // Act
      const isRunning = await sandboxManager.isSandboxRunning(sandboxId);
      
      // Assert
      expect(isRunning).toBe(false);
      
      // Check if the status was updated
      const trackedSandbox = sandboxManager.getSandbox(sandboxId);
      expect(trackedSandbox?.status).toBe('stopped');
    });
    
    it('should handle errors when checking sandbox status', async () => {
      // Arrange
      const { sandboxId } = await sandboxManager.createSandbox(mockApiKey, 'test-purpose');
      
      // Mock the isRunning response to throw an error
      const mockIsRunning = Sandbox.create().isRunning as jest.Mock;
      mockIsRunning.mockRejectedValueOnce(new Error('Connection error'));
      
      // Act
      const isRunning = await sandboxManager.isSandboxRunning(sandboxId);
      
      // Assert
      expect(isRunning).toBe(false);
      
      // Check if the status was updated to error
      const trackedSandbox = sandboxManager.getSandbox(sandboxId);
      expect(trackedSandbox?.status).toBe('error');
    });
  });
  
  describe('Sandbox Resource Management', () => {
    it('should release a sandbox when no longer needed', async () => {
      // Arrange
      const { sandboxId } = await sandboxManager.createSandbox(mockApiKey, 'test-purpose');
      const mockKill = Sandbox.create().kill as jest.Mock;
      
      // Act
      await sandboxManager.releaseSandbox(sandboxId);
      
      // Assert
      expect(mockKill).toHaveBeenCalled();
      
      // Verify the sandbox is no longer tracked
      const trackedSandbox = sandboxManager.getSandbox(sandboxId);
      expect(trackedSandbox).toBeUndefined();
    });
    
    it('should handle errors when releasing a sandbox', async () => {
      // Arrange
      const { sandboxId } = await sandboxManager.createSandbox(mockApiKey, 'test-purpose');
      const mockKill = Sandbox.create().kill as jest.Mock;
      mockKill.mockRejectedValueOnce(new Error('Kill error'));
      
      // Act
      await sandboxManager.releaseSandbox(sandboxId);
      
      // Assert
      expect(mockKill).toHaveBeenCalled();
      
      // Verify the sandbox is still removed from tracking despite the error
      const trackedSandbox = sandboxManager.getSandbox(sandboxId);
      expect(trackedSandbox).toBeUndefined();
    });
    
    it('should update last used timestamp for a sandbox', async () => {
      // Arrange
      const { sandboxId } = await sandboxManager.createSandbox(mockApiKey, 'test-purpose');
      const trackedSandbox = sandboxManager.getSandbox(sandboxId);
      const originalLastUsed = trackedSandbox?.lastUsed;
      
      // Wait a short time to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Act
      sandboxManager.updateLastUsed(sandboxId);
      
      // Assert
      const updatedSandbox = sandboxManager.getSandbox(sandboxId);
      expect(updatedSandbox?.lastUsed).not.toBe(originalLastUsed);
      expect(updatedSandbox?.lastUsed.getTime()).toBeGreaterThan(originalLastUsed.getTime());
    });
    
    it('should setup keep-alive for a sandbox', async () => {
      // Arrange - Create a sandbox
      const { sandboxId } = await sandboxManager.createSandbox(mockApiKey, 'test-purpose');
      
      // Act - Setup keep-alive with short interval for testing
      sandboxManager.setupKeepAlive(sandboxId, 100);
      
      // Wait for the keep-alive to trigger
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Assert - Verify setTimeout was called
      const mockSetTimeout = Sandbox.create().setTimeout as jest.Mock;
      expect(mockSetTimeout).toHaveBeenCalled();
      
      // Verify last used timestamp was updated
      const trackedSandbox = sandboxManager.getSandbox(sandboxId);
      expect(trackedSandbox?.keepAliveInterval).toBeDefined();
      
      // Cleanup - Release the sandbox to clear the interval
      await sandboxManager.releaseSandbox(sandboxId);
    });
    
    it('should handle keep-alive for stopped sandboxes', async () => {
      // Arrange - Create a sandbox
      const { sandboxId } = await sandboxManager.createSandbox(mockApiKey, 'test-purpose');
      
      // Mock isRunning to return false (sandbox stopped)
      const mockIsRunning = Sandbox.create().isRunning as jest.Mock;
      mockIsRunning.mockResolvedValue(false);
      
      // Act - Setup keep-alive with short interval
      sandboxManager.setupKeepAlive(sandboxId, 100);
      
      // Wait for the keep-alive to trigger
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Assert - Verify setTimeout was NOT called (since sandbox not running)
      const mockSetTimeout = Sandbox.create().setTimeout as jest.Mock;
      expect(mockSetTimeout).not.toHaveBeenCalled();
      
      // Verify the keep-alive interval was cleared
      const trackedSandbox = sandboxManager.getSandbox(sandboxId);
      expect(trackedSandbox?.keepAliveInterval).toBeUndefined();
      
      // Cleanup
      await sandboxManager.releaseSandbox(sandboxId);
    });
  });
  
  describe('Cleanup', () => {
    it('should clean up idle sandboxes', async () => {
      // Arrange - Create sandboxes
      const { sandboxId: id1 } = await sandboxManager.createSandbox(mockApiKey, 'test-1');
      const { sandboxId: id2 } = await sandboxManager.createSandbox(mockApiKey, 'test-2');
      
      // Make one sandbox idle
      const trackedSandbox1 = sandboxManager.getSandbox(id1);
      trackedSandbox1.lastUsed = new Date(Date.now() - 1000); // Set to 1 second ago
      
      // Keep the other sandbox recently used
      sandboxManager.updateLastUsed(id2);
      
      // Act
      await sandboxManager.cleanupIdleSandboxes();
      
      // Assert
      expect(sandboxManager.getSandbox(id1)).toBeUndefined(); // Should be cleaned up
      expect(sandboxManager.getSandbox(id2)).toBeDefined(); // Should still be tracked
      
      // Cleanup
      await sandboxManager.releaseSandbox(id2);
    });
    
    it('should clean up all sandboxes', async () => {
      // Arrange - Create sandboxes
      await sandboxManager.createSandbox(mockApiKey, 'test-1');
      await sandboxManager.createSandbox(mockApiKey, 'test-2');
      
      // Act
      await sandboxManager.cleanupAllSandboxes();
      
      // Assert - Check stats
      const stats = sandboxManager.getStats();
      expect(stats.totalSandboxes).toBe(0);
    });
    
    it('should start and stop cleanup interval', async () => {
      // Mock setInterval and clearInterval
      jest.useFakeTimers();
      
      // Act - Start cleanup interval
      sandboxManager.startCleanupInterval();
      
      // Assert cleanup interval is running
      expect(setInterval).toHaveBeenCalled();
      
      // Act - Stop cleanup interval
      sandboxManager.stopCleanupInterval();
      
      // Assert cleanup interval is stopped
      expect(clearInterval).toHaveBeenCalled();
      
      // Restore timers
      jest.useRealTimers();
    });
  });
  
  describe('Stats', () => {
    it('should return accurate stats', async () => {
      // Arrange - Create sandboxes with different statuses
      const { sandboxId: id1 } = await sandboxManager.createSandbox(mockApiKey, 'test-purpose');
      const { sandboxId: id2 } = await sandboxManager.createSandbox(mockApiKey, 'test-purpose');
      const { sandboxId: id3 } = await sandboxManager.createSandbox(mockApiKey, 'other-purpose');
      
      // Set one sandbox to stopped status
      const mockIsRunning = Sandbox.create().isRunning as jest.Mock;
      mockIsRunning.mockResolvedValueOnce(false);
      await sandboxManager.isSandboxRunning(id2);
      
      // Set one sandbox to error status
      mockIsRunning.mockRejectedValueOnce(new Error('Connection error'));
      await sandboxManager.isSandboxRunning(id3);
      
      // Act
      const stats = sandboxManager.getStats();
      
      // Assert
      expect(stats.totalSandboxes).toBe(3);
      expect(stats.running).toBe(1);
      expect(stats.stopped).toBe(1);
      expect(stats.error).toBe(1);
      expect(stats.byPurpose['test-purpose']).toBe(2);
      expect(stats.byPurpose['other-purpose']).toBe(1);
      
      // Cleanup
      await sandboxManager.cleanupAllSandboxes();
    });
  });
}); 