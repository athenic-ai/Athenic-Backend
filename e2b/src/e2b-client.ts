import { Sandbox } from '@e2b/code-interpreter';

/**
 * Client response from running code
 */
export interface RunCodeResult {
  logs: string[];
  error?: string;
  results?: any[];
}

/**
 * E2B Client wraps the E2B Sandbox functionality
 * for easier use in our application
 */
export class E2BClient {
  public sandbox: Sandbox | null = null;
  private readonly apiKey: string;

  /**
   * Creates a new E2B client
   * @param apiKey E2B API key (optional, will use env var if not provided)
   */
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.E2B_API_KEY || '';
  }

  /**
   * Initialize the client and create a sandbox
   * @param template The sandbox template to use
   */
  async initialize(template = 'base'): Promise<void> {
    if (!this.apiKey) {
      throw new Error('E2B API key is required');
    }

    if (!this.sandbox) {
      this.sandbox = await Sandbox.create(template, {
        apiKey: this.apiKey,
      });
    }
  }

  /**
   * Run code in the sandbox
   * @param code Code to execute
   * @param options Options for execution
   */
  async runCode(code: string, options: any = {}): Promise<RunCodeResult> {
    if (!this.sandbox) {
      await this.initialize();
    }

    const logs: string[] = [];
    
    const execution = await this.sandbox!.runCode(code, {
      onStdout: (output: any) => {
        const outputText = typeof output === 'string' ? output : output.text || JSON.stringify(output);
        logs.push(outputText);
        if (options.onStdout) {
          options.onStdout(outputText);
        }
      },
      onStderr: (output: any) => {
        const outputText = typeof output === 'string' ? output : output.text || JSON.stringify(output);
        logs.push(outputText);
        if (options.onStderr) {
          options.onStderr(outputText);
        }
      }
    });

    return {
      logs,
      error: execution.error ? execution.error.toString() : undefined,
      results: execution.results,
    };
  }

  /**
   * Close the sandbox and release resources
   */
  async close(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.kill();
      this.sandbox = null;
    }
  }
} 