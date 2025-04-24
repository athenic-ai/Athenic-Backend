/**
 * Comprehensive mock for the E2B SDK
 * This mock will be used instead of the actual E2B SDK in our tests
 */

// Mock execution result
export interface MockExecution {
  logs: {
    stdout: string[];
    stderr: string[];
  };
  results: any[];
  error?: string;
}

// Mock Terminal class
export class Terminal {
  public process = {
    kill: jest.fn().mockResolvedValue(undefined)
  };
}

// Sandbox class mock
export class MockSandbox {
  public id: string = `mock-sandbox-${Date.now()}`;
  public codeExecutionId?: string;
  public terminal: Terminal;
  
  constructor() {
    // Initialize sandbox mock
    this.terminal = new Terminal();
  }
  
  /**
   * Static method to create a sandbox instance
   * @param template - The template to use
   * @param options - Options containing apiKey
   * @returns A new sandbox instance
   */
  static async create(template: string, options: { apiKey: string }): Promise<MockSandbox> {
    return new MockSandbox();
  }
  
  /**
   * Run code in the sandbox
   * @param code - Code to execute
   * @param opts - Options including callbacks
   * @returns Execution result
   */
  async runCode(code: string, opts: any = {}): Promise<MockExecution> {
    // Create execution result
    const executionResult: MockExecution = {
      logs: {
        stdout: [],
        stderr: []
      },
      results: []
    };
    
    // Handle stdout
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
    
    // Handle stderr and errors
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
    
    // Handle package installation
    if (code.includes('pip install')) {
      if (opts.onStdout) {
        opts.onStdout('Collecting package');
        opts.onStdout('  Downloading package-1.0.0-py3-none-any.whl');
        opts.onStdout('Installing collected packages: package');
        opts.onStdout('Successfully installed package-1.0.0');
        
        executionResult.logs.stdout.push(
          'Collecting package',
          '  Downloading package-1.0.0-py3-none-any.whl',
          'Installing collected packages: package',
          'Successfully installed package-1.0.0'
        );
      }
    }
    
    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return executionResult;
  }
  
  /**
   * Close the sandbox - deprecated method
   */
  async close(): Promise<void> {
    return Promise.resolve();
  }
  
  /**
   * Kill the sandbox - new recommended method
   */
  async kill(): Promise<void> {
    return Promise.resolve();
  }
  
  /**
   * Alternative method name for closing (used in some E2B versions)
   */
  async dispose(): Promise<void> {
    return this.close();
  }
}

// Code interpreter mock
export const CodeInterpreter = MockSandbox;

// Export default
export default {
  Sandbox: MockSandbox,
  CodeInterpreter
}; 