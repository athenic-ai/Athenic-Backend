import { Sandbox } from '@e2b/code-interpreter';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

describe('E2B Sandbox', () => {
  let sandbox: Sandbox;
  
  beforeEach(async () => {
    // Create a new sandbox for each test
    sandbox = await Sandbox.create();
  });
  
  afterEach(async () => {
    // Clean up the sandbox after each test
    if (sandbox) {
      await sandbox.kill();
    }
  });
  
  test('Should create a sandbox with proper properties', () => {
    expect(sandbox).toBeDefined();
    expect(sandbox.sandboxId).toBeDefined();
    expect(typeof sandbox.sandboxId).toBe('string');
  });
  
  test('Should execute Python code and return results', async () => {
    const code = 'print("Hello, world!")\n2 + 2';
    const execution = await sandbox.runCode(code);
    
    expect(execution).toBeDefined();
    expect(execution.results).toBeDefined();
    expect(execution.results.length).toBeGreaterThan(0);
    expect(execution.results[0].text).toBe('4');
    
    expect(execution.logs).toBeDefined();
    expect(execution.logs.stdout).toBeDefined();
    expect(execution.logs.stdout.length).toBeGreaterThan(0);
    expect(execution.logs.stdout[0]).toContain('Hello, world!');
  });
  
  test('Should handle Python errors correctly', async () => {
    const code = 'x = undefinedVariable';
    const execution = await sandbox.runCode(code);
    
    expect(execution).toBeDefined();
    // Check that an error exists in some form
    expect(execution.error).toBeTruthy();
    
    // In newer versions of the library, the error might not be in stderr
    // It could be in the error property instead, so we'll check for either
    const hasError = execution.error !== null || 
                     (execution.logs && 
                      execution.logs.stderr && 
                      execution.logs.stderr.length > 0);
    
    expect(hasError).toBe(true);
  });
  
  test('Should maintain state between code executions', async () => {
    await sandbox.runCode('x = 5');
    const execution = await sandbox.runCode('x + 10');
    
    expect(execution).toBeDefined();
    expect(execution.results).toBeDefined();
    expect(execution.results.length).toBeGreaterThan(0);
    expect(execution.results[0].text).toBe('15');
  });
  
  test('Should handle streaming output', async () => {
    const stdoutMessages: string[] = [];
    const stderrMessages: string[] = [];
    
    const code = `
import time
print("Start")
time.sleep(0.5)
print("Middle")
time.sleep(0.5)
print("End")
`;
    
    console.log('Starting sandbox streaming test with code:', code);
    
    const execution = await sandbox.runCode(code, {
      onStdout: (output: any) => {
        console.log('Received stdout:', typeof output, output);
        
        let text = '';
        if (typeof output === 'string') {
          text = output;
        } else if (output && typeof output === 'object') {
          // The actual format from E2B has a 'line' property
          text = output.line || output.text || String(output);
        }
        
        console.log('Processed to:', text);
        if (text) stdoutMessages.push(text.trim());
      },
      onStderr: (output: any) => {
        console.log('Received stderr:', typeof output, output);
        
        let text = '';
        if (typeof output === 'string') {
          text = output;
        } else if (output && typeof output === 'object') {
          // The actual format from E2B has a 'line' property
          text = output.line || output.text || String(output);
        }
        
        console.log('Processed to:', text);
        if (text) stderrMessages.push(text.trim());
      }
    });
    
    console.log('Execution completed. Results:', {
      stdoutMessages,
      stderrMessages,
      error: execution.error
    });
    
    expect(execution).toBeDefined();
    
    // Just check if we got any output
    expect(stdoutMessages.length).toBeGreaterThan(0);
    expect(stderrMessages.length).toBe(0);
  });
  
  // Skip this test if no API key is available
  (process.env.E2B_API_KEY ? test : test.skip)('Should install and use external packages', async () => {
    // First install a package
    await sandbox.runCode('!pip install numpy');
    
    // Then use it
    const execution = await sandbox.runCode(`
import numpy as np
a = np.array([1, 2, 3])
b = np.array([4, 5, 6])
np.dot(a, b)
`);
    
    expect(execution).toBeDefined();
    expect(execution.results).toBeDefined();
    expect(execution.results.length).toBeGreaterThan(0);
    expect(execution.results[0].text).toBe('32');
  }, 60000); // Increase timeout for package installation
}); 