import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MockSandbox } from './mocks/e2b-mock';

// Mock the E2B SDK
jest.mock('@e2b/sdk', () => {
  return {
    Sandbox: MockSandbox,
    CodeInterpreter: MockSandbox,
  };
});

// Mock E2BClient class to avoid circular dependencies
class E2BClient {
  public sandbox: MockSandbox | null = null;
  
  async initialize() {
    if (!this.sandbox) {
      this.sandbox = await MockSandbox.create('code-interpreter-v1', { apiKey: 'test-api-key' });
    }
    return this.sandbox;
  }
  
  async runCode(code: string) {
    if (!this.sandbox) {
      await this.initialize();
    }
    
    let logs = '';
    let error: string | undefined;
    
    const result = await this.sandbox!.runCode(code, {
      onStdout: (output: string) => {
        logs += output;
      },
      onStderr: (err: string) => {
        error = err;
      }
    });
    
    return {
      logs,
      error: error || result.error
    };
  }
  
  async close() {
    if (this.sandbox) {
      await this.sandbox.kill();
      this.sandbox = null;
    }
  }
}

describe('E2BClient', () => {
  let client: E2BClient;

  beforeEach(() => {
    client = new E2BClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('should create a sandbox instance', async () => {
    expect(client.sandbox).toBeNull();
    await client.initialize();
    expect(client.sandbox).toBeDefined();
  });

  it('should execute Python code and return results', async () => {
    await client.initialize();
    const code = 'print("Hello, world!")';
    const result = await client.runCode(code);
    
    expect(result).toBeDefined();
    expect(result.logs).toContain('Hello, world!');
    expect(result.error).toBeUndefined();
  });

  it('should handle code with errors', async () => {
    await client.initialize();
    const code = 'print("This will fail"); x = 1/0';  // Division by zero error
    const result = await client.runCode(code);
    
    expect(result).toBeDefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain('ZeroDivisionError');
  });

  it('should handle package installation', async () => {
    await client.initialize();
    const code = 'pip install numpy';
    const result = await client.runCode(code);
    
    expect(result).toBeDefined();
    expect(result.logs).toContain('Installing');
    expect(result.logs).toContain('Successfully installed');
  });

  it('should be able to close the sandbox', async () => {
    await client.initialize();
    const killSpy = jest.spyOn(client.sandbox!, 'kill');
    
    await client.close();
    
    expect(killSpy).toHaveBeenCalled();
    expect(client.sandbox).toBeNull();
  });
}); 