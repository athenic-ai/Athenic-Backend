import { jest } from '@jest/globals';
import { Sandbox } from '@e2b/code-interpreter';
import * as e2bService from '../../src/e2b-service';
import { OutputMessage } from '../../src/types';

// Mock implementation of Sandbox
class MockSandbox {
  id: string;
  onStdout: (callback: (data: OutputMessage) => void) => void;
  onStderr: (callback: (data: OutputMessage) => void) => void;

  constructor(id: string) {
    this.id = id;
    this.onStdout = jest.fn().mockImplementation((callback) => {
      // Mock implementation that does nothing
    });
    this.onStderr = jest.fn().mockImplementation((callback) => {
      // Mock implementation that does nothing
    });
  }

  async kill(): Promise<void> {
    return Promise.resolve();
  }

  async runCode(code: string, options?: {
    timeoutMs?: number,
    onStdout?: (data: OutputMessage) => void,
    onStderr?: (data: OutputMessage) => void
  }): Promise<{ stdout: string; stderr: string }> {
    if (options?.onStdout) {
      options.onStdout({ line: "Test stdout output" });
    }
    
    if (code.includes('error') && options?.onStderr) {
      options.onStderr({ line: "Test stderr output" });
    }
    
    return Promise.resolve({ stdout: 'Test stdout', stderr: code.includes('error') ? 'Test error' : '' });
  }
}

// Map to store mock sandboxes
const mockSandboxes = new Map<string, MockSandbox>();

/**
 * Mock the E2B service's activeSandboxes functionality
 */
export function mockActiveSandboxes(): void {
  // Mock createSandbox to return a new sandbox ID and add it to mockSandboxes
  jest.spyOn(e2bService, 'createSandbox').mockImplementation(async (template = 'code-interpreter-v1') => {
    const sandboxId = `mock-sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const mockSandbox = new MockSandbox(sandboxId);
    mockSandboxes.set(sandboxId, mockSandbox);
    return sandboxId;
  });

  // Mock closeSandbox to remove the sandbox from mockSandboxes
  jest.spyOn(e2bService, 'closeSandbox').mockImplementation(async (sandboxId: string) => {
    const mockSandbox = mockSandboxes.get(sandboxId);
    if (mockSandbox) {
      await mockSandbox.kill();
      mockSandboxes.delete(sandboxId);
    }
  });

  // Mock getActiveSandboxCount to return the current count of mock sandboxes
  jest.spyOn(e2bService, 'getActiveSandboxCount').mockImplementation(() => {
    return mockSandboxes.size;
  });

  // Mock cleanupAllSandboxes to clear all mock sandboxes
  jest.spyOn(e2bService, 'cleanupAllSandboxes').mockImplementation(async () => {
    const promises: Promise<void>[] = [];
    for (const [sandboxId, mockSandbox] of mockSandboxes.entries()) {
      promises.push(mockSandbox.kill());
    }
    await Promise.all(promises);
    mockSandboxes.clear();
  });

  // Additional mocks for runCodeAndStream if needed
  jest.spyOn(e2bService, 'runCodeAndStream').mockImplementation(
    async (sandboxId: string, code: string, clientId: string, timeoutMs = 30000) => {
      // Simulate code execution
      return Promise.resolve();
    }
  );
}

/**
 * Reset all E2B service mocks and clear the mockSandboxes
 */
export function resetE2bService(): void {
  jest.restoreAllMocks();
  mockSandboxes.clear();
}

/**
 * Helper to create a specific number of mock sandboxes
 */
export function createMockSandboxes(count: number): Promise<string[]> {
  const promises: Promise<string>[] = [];
  for (let i = 0; i < count; i++) {
    promises.push(e2bService.createSandbox());
  }
  return Promise.all(promises);
} 