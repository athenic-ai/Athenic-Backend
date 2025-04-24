/**
 * Mock implementation of E2B Sandbox for testing
 * This allows us to run tests without requiring an actual E2B connection
 */

// Mock Execution result
export interface MockExecution {
  logs: {
    stdout: string[];
    stderr: string[];
  };
  results: any[];
  error?: string;
}

// Mock Sandbox class
export class MockSandbox {
  public id: string;
  
  constructor() {
    this.id = `mock-sandbox-${Date.now()}`;
  }
  
  /**
   * Runs code in the mock sandbox
   * @param code - Code to execute
   * @param opts - Options including callbacks for stdout/stderr
   * @returns Execution result
   */
  async runCode(code: string, opts: any = {}): Promise<MockExecution> {
    // Simple mock implementation that simulates Python code execution
    const executionResult: MockExecution = {
      logs: {
        stdout: [],
        stderr: []
      },
      results: []
    };
    
    // If we have a handler for stdout, call it with some sample output
    if (opts.onStdout && typeof opts.onStdout === 'function') {
      if (code.includes('print(')) {
        // Extract content inside print statements
        const printMatches = code.match(/print\(["'](.+?)["']\)/g) || [];
        for (const match of printMatches) {
          const content = match.replace(/print\(["'](.+?)["']\)/, '$1');
          opts.onStdout(content);
          executionResult.logs.stdout.push(content);
        }
      } else {
        // Default output if no print statements
        const output = 'Mock execution completed successfully';
        opts.onStdout(output);
        executionResult.logs.stdout.push(output);
      }
    }
    
    // If code contains 'error' or division by zero, simulate an error
    if (code.includes('/ 0') || code.toLowerCase().includes('error')) {
      const errorMsg = code.includes('/ 0') 
        ? 'ZeroDivisionError: division by zero'
        : 'MockError: This is a simulated error';
      
      if (opts.onStderr && typeof opts.onStderr === 'function') {
        opts.onStderr(errorMsg);
      }
      
      executionResult.logs.stderr.push(errorMsg);
      executionResult.error = errorMsg;
    }
    
    // Wait a short time to simulate execution
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return executionResult;
  }
  
  /**
   * Closes the mock sandbox
   */
  async close(): Promise<void> {
    // Do nothing in the mock
    return Promise.resolve();
  }
}

// Mock Sandbox creator function
export const MockSandboxFactory = {
  create: async (options: any): Promise<MockSandbox> => {
    return new MockSandbox();
  }
};

export default MockSandboxFactory; 