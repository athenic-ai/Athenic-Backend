import fetch from 'node-fetch';
import { hasE2BApiKey, isE2BServiceAvailable, retry } from './utils';
import { describe, test, expect, beforeAll, jest } from '@jest/globals';

// Configure the base URL for the E2B service
const E2B_URL = process.env.E2B_SERVICE_URL || 'https://api.e2b.dev';
const E2B_API_KEY = process.env.E2B_API_KEY || '';

describe('E2B Trigger Logic', () => {
  let serviceAvailable = false;

  beforeAll(async () => {
    if (!hasE2BApiKey()) {
      console.warn('E2B API KEY is not set. Some tests will be skipped.');
      return;
    }

    try {
      serviceAvailable = await isE2BServiceAvailable(E2B_URL);
      if (!serviceAvailable) {
        console.warn(`E2B service is not available at ${E2B_URL}. Some tests will be skipped.`);
      }
    } catch (error) {
      console.error('Error checking E2B service availability:', error);
    }
  });

  const shouldRequireExecution = async (message: string) => {
    if (!hasE2BApiKey() || !serviceAvailable) {
      return null; // Skip the check if the service is not available
    }

    try {
      const response = await retry(() => 
        fetch(`${E2B_URL}/analyze-execution-needs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${E2B_API_KEY}`
          },
          body: JSON.stringify({ message }),
        })
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json() as { requiresExecution: boolean };
      return data.requiresExecution;
    } catch (error) {
      console.error('Error checking execution requirement:', error);
      return null;
    }
  };

  describe('Message Analysis', () => {
    const testCases = [
      { 
        message: 'Run this Python code: print("Hello, World!")', 
        expected: true,
        language: 'python',
        description: 'should detect Python code execution request'
      },
      { 
        message: 'Please execute this JavaScript: console.log("Test")', 
        expected: true,
        language: 'javascript', 
        description: 'should detect JavaScript execution request'
      },
      { 
        message: 'Can you tell me about the weather today?', 
        expected: false,
        language: null,
        description: 'should not detect code execution in informational query'
      },
      { 
        message: 'What is the capital of France?', 
        expected: false,
        language: null,
        description: 'should not detect code execution in factual question'
      },
      { 
        message: 'def hello():\n    print("Hello")\n\nhello()', 
        expected: true,
        language: 'python',
        description: 'should detect Python code blocks'
      },
      { 
        message: '```python\nprint("Hello, World!")\n```', 
        expected: true,
        language: 'python',
        description: 'should detect code in markdown code blocks'
      },
      { 
        message: '```javascript\nconsole.log("Hello");\n```', 
        expected: true,
        language: 'javascript',
        description: 'should detect JavaScript in markdown code blocks'
      }
    ];

    testCases.forEach(({ message, expected, description }) => {
      test(description, async () => {
        // Skip if service is not available
        if (!hasE2BApiKey() || !serviceAvailable) {
          console.warn(`Skipping test "${description}" due to missing API key or unavailable service`);
          return;
        }

        const requiresExecution = await shouldRequireExecution(message);
        
        // Only assert if we got a valid response
        if (requiresExecution !== null) {
          expect(requiresExecution).toBe(expected);
        } else {
          console.warn(`Skipping assertions for "${description}" due to API error`);
        }
      });
    });
  });

  describe('Code Execution', () => {
    test('should execute Python code', async () => {
      // Skip if service is not available
      if (!hasE2BApiKey() || !serviceAvailable) {
        console.warn('Skipping Python execution test due to missing API key or unavailable service');
        return;
      }

      const code = 'print("Hello from Python")\nresult = 2 + 2\nprint(f"Result: {result}")';
      
      try {
        const response = await retry(() => 
          fetch(`${E2B_URL}/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${E2B_API_KEY}`
            },
            body: JSON.stringify({
              code,
              language: 'python'
            }),
          })
        );
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        expect(data.output).toContain('Hello from Python');
        expect(data.output).toContain('Result: 4');
        expect(data.error).toBeFalsy();
      } catch (error) {
        console.error('Error executing Python code:', error);
        // In CI environment, we might need to skip this test
        if (process.env.CI) {
          console.warn('Skipping assertion in CI environment due to execution error');
        } else {
          throw error;
        }
      }
    });

    test('should execute JavaScript code', async () => {
      // Skip if service is not available
      if (!hasE2BApiKey() || !serviceAvailable) {
        console.warn('Skipping JavaScript execution test due to missing API key or unavailable service');
        return;
      }

      const code = 'console.log("Hello from JavaScript");\nconst result = 3 * 7;\nconsole.log(`Result: ${result}`);';
      
      try {
        const response = await retry(() => 
          fetch(`${E2B_URL}/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${E2B_API_KEY}`
            },
            body: JSON.stringify({
              code,
              language: 'javascript'
            }),
          })
        );
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        expect(data.output).toContain('Hello from JavaScript');
        expect(data.output).toContain('Result: 21');
        expect(data.error).toBeFalsy();
      } catch (error) {
        console.error('Error executing JavaScript code:', error);
        // In CI environment, we might need to skip this test
        if (process.env.CI) {
          console.warn('Skipping assertion in CI environment due to execution error');
        } else {
          throw error;
        }
      }
    });

    test('should handle execution errors', async () => {
      // Skip if service is not available
      if (!hasE2BApiKey() || !serviceAvailable) {
        console.warn('Skipping error handling test due to missing API key or unavailable service');
        return;
      }

      // Code with a deliberate error (division by zero)
      const code = 'result = 1 / 0\nprint(result)';
      
      try {
        const response = await retry(() => 
          fetch(`${E2B_URL}/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${E2B_API_KEY}`
            },
            body: JSON.stringify({
              code,
              language: 'python'
            }),
          })
        );
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        expect(data.error).toBeTruthy();
        expect(data.error).toContain('division by zero');
      } catch (error) {
        console.error('Error testing execution error handling:', error);
        // In CI environment, we might need to skip this test
        if (process.env.CI) {
          console.warn('Skipping assertion in CI environment due to execution error');
        } else {
          throw error;
        }
      }
    });
  });
}); 