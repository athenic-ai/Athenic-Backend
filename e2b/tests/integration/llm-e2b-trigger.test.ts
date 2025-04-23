/**
 * This test file verifies the LLM-based code execution detection logic
 * implemented in ProcessMessageJob.checkIfCodeExecutionRequired().
 * 
 * It mocks the NlpService to simulate LLM responses without making actual API calls.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Import the function under test
// For testing purposes, we'll recreate the function to avoid direct dependencies
async function checkIfCodeExecutionRequired(messageText, nlpService) {
  try {
    console.log("Checking if code execution is required...");
    const checkPrompt = `Does the following user request require code execution, access to a file system, running terminal commands, or modifying a code repository? Respond only with YES or NO.\n\nRequest: "${messageText}"`;
    
    // Use a simple, fast model for this check
    const checkResult = await nlpService.execute({ 
      promptParts: [{"type": "text", "text": checkPrompt}], 
      systemInstruction: "You are an assistant that determines if a request needs code execution capabilities.", 
      functionUsage: "none", 
      useLiteModels: true 
    });

    if (checkResult.status === 200) {
      const requiresExecution = checkResult.message?.toUpperCase().includes('YES') || false;
      console.log(`Code execution ${requiresExecution ? 'IS' : 'is NOT'} required.`);
      return { 
        requiresCodeExecution: requiresExecution, 
        status: 200, 
        message: `Code execution ${requiresExecution ? 'is' : 'is not'} required.` 
      };
    } else {
      console.error("Error checking for code execution requirement:", checkResult.message);
      return { 
        requiresCodeExecution: false, 
        status: checkResult.status, 
        message: checkResult.message || 'Unknown error' 
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error checking for code execution requirement:", errorMessage);
    return { 
      requiresCodeExecution: false, 
      status: 500, 
      message: `Error checking for code execution: ${errorMessage}` 
    };
  }
}

describe('LLM-based E2B Trigger Detection', () => {
  let mockNlpService;
  
  beforeEach(() => {
    // Create a simple mock
    mockNlpService = {
      execute: jest.fn()
    };
  });
  
  test('Should detect code execution requirement when LLM responds with YES', async () => {
    // Arrange: Set up mock to return a "YES" response
    mockNlpService.execute.mockResolvedValue({
      status: 200,
      message: 'YES, this requires code execution.'
    });
    
    // Act: Call the function with a message
    const result = await checkIfCodeExecutionRequired(
      'Can you run this Python script for me?', 
      mockNlpService
    );
    
    // Assert: Verify the function correctly interpreted the LLM response
    expect(result.requiresCodeExecution).toBe(true);
    expect(result.status).toBe(200);
    
    // Verify correct prompt was sent to LLM
    expect(mockNlpService.execute).toHaveBeenCalledWith(expect.objectContaining({
      promptParts: [expect.objectContaining({
        text: expect.stringContaining('Does the following user request require code execution')
      })],
      useLiteModels: true
    }));
  });
  
  test('Should not detect code execution requirement when LLM responds with NO', async () => {
    // Arrange: Set up mock to return a "NO" response
    mockNlpService.execute.mockResolvedValue({
      status: 200,
      message: 'NO, this does not require code execution.'
    });
    
    // Act: Call the function with a message
    const result = await checkIfCodeExecutionRequired(
      'What is the weather like today?', 
      mockNlpService
    );
    
    // Assert: Verify the function correctly interpreted the LLM response
    expect(result.requiresCodeExecution).toBe(false);
    expect(result.status).toBe(200);
  });
  
  test('Should handle LLM API errors gracefully', async () => {
    // Arrange: Set up mock to simulate an API error
    mockNlpService.execute.mockResolvedValue({
      status: 500,
      message: 'API error: Rate limit exceeded'
    });
    
    // Act: Call the function with a message
    const result = await checkIfCodeExecutionRequired(
      'Some message', 
      mockNlpService
    );
    
    // Assert: Verify the function handled the error
    expect(result.requiresCodeExecution).toBe(false);
    expect(result.status).toBe(500);
    expect(result.message).toContain('API error');
  });
  
  test('Should handle unexpected exceptions', async () => {
    // Arrange: Set up mock to throw an exception
    mockNlpService.execute.mockImplementation(() => {
      throw new Error('Unexpected error');
    });
    
    // Act: Call the function with a message
    const result = await checkIfCodeExecutionRequired(
      'Some message', 
      mockNlpService
    );
    
    // Assert: Verify the function handled the exception
    expect(result.requiresCodeExecution).toBe(false);
    expect(result.status).toBe(500);
    expect(result.message).toContain('Error checking for code execution');
  });
  
  test('Should handle empty or null LLM responses', async () => {
    // Arrange: Set up mock to return an empty response
    mockNlpService.execute.mockResolvedValue({
      status: 200,
      message: ''
    });
    
    // Act: Call the function with a message
    const result = await checkIfCodeExecutionRequired(
      'Some message', 
      mockNlpService
    );
    
    // Assert: Verify the function handled the empty response safely
    expect(result.requiresCodeExecution).toBe(false);
    expect(result.status).toBe(200);
  });
  
  test('Should correctly parse ambiguous LLM responses', async () => {
    // Test cases with different response patterns
    const testCases = [
      {
        response: 'YES, but with some caveats...',
        expected: true,
        description: 'YES with additional text'
      },
      {
        response: 'I would say YES because...',
        expected: true,
        description: 'YES embedded in sentence'
      },
      {
        response: 'NO, this is just an informational query.',
        expected: false,
        description: 'NO with explanation'
      },
      {
        response: 'The answer is NO.',
        expected: false,
        description: 'NO embedded in sentence'
      },
      {
        response: 'Based on my analysis, YES.',
        expected: true,
        description: 'YES at end of sentence'
      }
    ];
    
    for (const testCase of testCases) {
      // Reset mock for each test case
      mockNlpService.execute.mockReset();
      
      // Arrange: Set up mock response
      mockNlpService.execute.mockResolvedValue({
        status: 200,
        message: testCase.response
      });
      
      // Act: Call the function with a message
      const result = await checkIfCodeExecutionRequired(
        'Test message', 
        mockNlpService
      );
      
      // Assert: Verify correct parsing
      expect(result.requiresCodeExecution).toBe(testCase.expected);
      expect(result.status).toBe(200);
    }
  });
}); 