/**
 * Test suite for SandboxEnvironment class
 * 
 * Tests the interaction with E2B for sandboxed execution
 */

const { SupabaseClient } = require('@supabase/supabase-js');
const { SandboxEnvironment } = require('../supabase/functions/agents/sandboxEnvironment');
const E2B = require('e2b');

// Mock E2B module
jest.mock('e2b', () => ({
  startSession: jest.fn().mockImplementation(async () => ({
    id: 'mock-session-id',
    close: jest.fn().mockResolvedValue(undefined),
    process: {
      start: jest.fn().mockImplementation(async ({ cmd, onStdout, onStderr }) => {
        // Simulate process output
        if (onStdout) onStdout('Mock process output');
        if (cmd.includes('error')) {
          if (onStderr) onStderr('Mock error output');
          return { wait: jest.fn().mockResolvedValue(1) };
        }
        return { wait: jest.fn().mockResolvedValue(0) };
      }),
      run: jest.fn().mockImplementation(async ({ cmd, onStdout, onStderr }) => {
        // Simulate process output
        if (onStdout) onStdout('Mock process output');
        if (cmd.includes('error')) {
          if (onStderr) onStderr('Mock error output');
          return { exitCode: 1, stdout: '', stderr: 'Mock error output' };
        }
        return { exitCode: 0, stdout: 'Mock process output', stderr: '' };
      })
    },
    filesystem: {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue('Mock file content'),
      list: jest.fn().mockResolvedValue(['file1.txt', 'file2.txt']),
      remove: jest.fn().mockResolvedValue(undefined)
    },
    browser: null,
    addFirewallRule: jest.fn().mockResolvedValue(undefined),
    limitResources: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  insert: jest.fn().mockResolvedValue({ data: null, error: null }),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
  gt: jest.fn().mockReturnThis(),
  rpc: jest.fn().mockResolvedValue({ data: [], error: null })
};

// Test security policy
const testSecurityPolicy = {
  allowedHosts: ['api.openai.com', 'api.example.com'],
  allowedCommands: ['node', 'npm', 'ls', 'cat'],
  resourceLimits: {
    cpuLimit: 1,
    memoryMB: 1024,
    timeoutSec: 60
  }
};

describe('SandboxEnvironment', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('should initialize the sandbox environment', async () => {
    const sandbox = new SandboxEnvironment(
      mockSupabaseClient,
      'test-organization',
      testSecurityPolicy
    );

    await sandbox.initialize();

    // Check that E2B session was created
    expect(E2B.startSession).toHaveBeenCalledWith({
      template: 'athenic-agent',
      envVars: expect.objectContaining({
        ORGANIZATION_ID: 'test-organization'
      })
    });

    // Check that firewall rules were set
    expect(sandbox.session.addFirewallRule).toHaveBeenCalledWith({
      direction: 'egress',
      protocol: 'tcp',
      port: 443,
      allowedHosts: testSecurityPolicy.allowedHosts
    });

    // Check that resource limits were set
    expect(sandbox.session.limitResources).toHaveBeenCalledWith({
      cpuCores: testSecurityPolicy.resourceLimits.cpuLimit,
      memoryMB: testSecurityPolicy.resourceLimits.memoryMB,
      timeoutSec: testSecurityPolicy.resourceLimits.timeoutSec
    });
  });

  test('should execute a command successfully', async () => {
    const sandbox = new SandboxEnvironment(
      mockSupabaseClient,
      'test-organization',
      testSecurityPolicy
    );

    await sandbox.initialize();
    const result = await sandbox.executeCommand('ls -la');

    expect(result.success).toBe(true);
    expect(sandbox.session.process.start).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd: 'ls -la'
      })
    );
  });

  test('should handle command errors', async () => {
    const sandbox = new SandboxEnvironment(
      mockSupabaseClient,
      'test-organization',
      testSecurityPolicy
    );

    await sandbox.initialize();
    const result = await sandbox.executeCommand('command-that-causes-error');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('should reject disallowed commands', async () => {
    const sandbox = new SandboxEnvironment(
      mockSupabaseClient,
      'test-organization',
      testSecurityPolicy
    );

    await sandbox.initialize();
    const result = await sandbox.executeCommand('sudo rm -rf /');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Command not allowed');
  });

  test('should execute file operations', async () => {
    const sandbox = new SandboxEnvironment(
      mockSupabaseClient,
      'test-organization',
      testSecurityPolicy
    );

    await sandbox.initialize();
    
    // Test writing a file
    const writeResult = await sandbox.executeFileOperation('write', {
      path: '/tmp/test.txt',
      content: 'Hello World'
    });
    
    expect(writeResult.success).toBe(true);
    expect(sandbox.session.filesystem.write).toHaveBeenCalledWith(
      '/tmp/test.txt',
      'Hello World'
    );
    
    // Test reading a file
    const readResult = await sandbox.executeFileOperation('read', {
      path: '/tmp/test.txt'
    });
    
    expect(readResult.success).toBe(true);
    expect(readResult.output).toContain('Mock file content');
    expect(sandbox.session.filesystem.read).toHaveBeenCalledWith('/tmp/test.txt');
    
    // Test listing files
    const listResult = await sandbox.executeFileOperation('list', {
      path: '/tmp'
    });
    
    expect(listResult.success).toBe(true);
    expect(listResult.output).toContain('file1.txt');
    expect(sandbox.session.filesystem.list).toHaveBeenCalledWith('/tmp');
  });

  test('should clean up resources on cleanup', async () => {
    const sandbox = new SandboxEnvironment(
      mockSupabaseClient,
      'test-organization',
      testSecurityPolicy
    );

    await sandbox.initialize();
    await sandbox.cleanup();

    expect(sandbox.session.close).toHaveBeenCalled();
  });
}); 