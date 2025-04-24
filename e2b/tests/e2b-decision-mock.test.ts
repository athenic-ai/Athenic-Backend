import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock NLP service
class MockNLPService {
  async execute({ promptParts }: { promptParts: Array<{ type: string, text: string }> }) {
    // Extract the user request from the prompt
    const prompt = promptParts.find(part => part.type === 'text')?.text || '';
    
    // Attempt to extract the actual request from the prompt wrapper
    const requestMatch = prompt.match(/Request: "([^"]+)"/);
    const request = requestMatch ? requestMatch[1] : prompt;
    
    // Look for keywords indicating code execution in the request
    const needsExecution = 
      request.includes('code') || 
      request.includes('run') || 
      request.includes('execute') || 
      request.includes('python') ||
      request.includes('javascript') ||
      request.includes('repository') || 
      request.includes('file') || 
      request.includes('terminal') || 
      request.includes('command') || 
      request.includes('npm') ||
      request.includes('```');
    
    // Look for simple information queries that shouldn't require code execution
    const isInfoQuery = 
      request.includes('what is') || 
      request.includes('weather') || 
      request.includes('capital') || 
      request.includes('history') || 
      request.includes('your name') ||
      request.includes('bake');
    
    // Information queries should override code execution keywords
    return {
      status: 200,
      message: (needsExecution && !isInfoQuery) ? 'YES' : 'NO'
    };
  }
  
  async executeThread() {
    return {
      status: 200,
      message: 'Standard chat response'
    };
  }
}

// Mock E2B Service client
class MockE2BServiceClient {
  async callExecuteStream({ code, clientId }: { code: string, clientId: string }) {
    return {
      status: 202,
      message: 'Execution started. Updates will be sent via WebSocket.',
      data: { 
        requiresE2B: true,
        clientId,
        wsUrl: `ws://localhost:3002?clientId=${clientId}`
      }
    };
  }
}

// Mock ProcessMessageJob that mimics the functionality in the Supabase function
class ProcessMessageJob {
  private nlpService: MockNLPService;
  private e2bService: MockE2BServiceClient;
  
  constructor() {
    this.nlpService = new MockNLPService();
    this.e2bService = new MockE2BServiceClient();
  }
  
  async start(message: string) {
    console.log("Processing message:", message);
    
    // Convert message to message parts format as expected by NLP service
    const messageParts = [{ type: 'text', text: message }];
    
    // Check if code execution is required
    let requiresCodeExecution = false;
    try {
      console.log("Checking if code execution is required...");
      const checkPrompt = `Does the following user request require code execution, access to a file system, running terminal commands, or modifying a code repository? Respond only with YES or NO.\n\nRequest: "${message}"`;
      
      const checkResult = await this.nlpService.execute({ 
        promptParts: [{"type": "text", "text": checkPrompt}]
      });

      if (checkResult.status === 200 && checkResult.message?.toUpperCase().includes('YES')) {
        requiresCodeExecution = true;
        console.log("Code execution is required.");
      } else {
        console.log("Code execution is NOT required. Proceeding with standard chat.");
      }
    } catch (checkError) {
      console.error("Error checking for code execution requirement:", checkError);
      // Default to not requiring execution on error
    }

    // Branch logic based on requiresCodeExecution
    if (requiresCodeExecution) {
      console.log("Calling E2B Service for code execution");
      const clientId = `client_${Date.now()}`;
      
      // In a real implementation, this would contain the actual code to execute
      // For our mock, we'll just use the message as the "code"
      const result = await this.e2bService.callExecuteStream({ 
        code: message,
        clientId 
      });
      
      return { 
        status: 200, 
        message: "This request requires code execution. WebSocket connection established.", 
        data: { 
          requiresE2B: true,
          clientId,
          wsUrl: result.data.wsUrl
        } 
      };
    } else {
      console.log("Proceeding with standard LLM chat response generation...");
      const executeThreadResult = await this.nlpService.executeThread();
      return { 
        status: 200, 
        message: executeThreadResult.message, 
        data: { requiresE2B: false } 
      };
    }
  }
}

describe('E2B Decision Logic (Mock)', () => {
  let job: ProcessMessageJob;
  
  beforeEach(() => {
    job = new ProcessMessageJob();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Should recognize requests needing code execution', async () => {
    const testCases = [
      {
        message: 'Can you run this Python code for me? print("Hello World")',
        shouldRequireE2B: true,
        description: 'Explicit code execution request'
      },
      {
        message: 'I need to modify my repository to implement a login page',
        shouldRequireE2B: true,
        description: 'Repository modification request'
      },
      {
        message: 'Please create a file to store user credentials',
        shouldRequireE2B: true,
        description: 'File system operation request'
      },
      {
        message: 'Run the npm install command in my project directory',
        shouldRequireE2B: true,
        description: 'Terminal command request'
      },
      {
        message: 'What is the weather like in New York?',
        shouldRequireE2B: false,
        description: 'Simple informational query'
      },
      {
        message: 'Tell me about the history of artificial intelligence',
        shouldRequireE2B: false,
        description: 'Knowledge-based query'
      },
      {
        message: 'What is your name?',
        shouldRequireE2B: false,
        description: 'Simple chat query'
      },
      {
        message: 'How do I bake a chocolate cake?',
        shouldRequireE2B: false,
        description: 'Instruction-based query'
      }
    ];
    
    for (const { message, shouldRequireE2B, description } of testCases) {
      console.log(`Testing: ${description}`);
      const result = await job.start(message);
      
      expect(result.data.requiresE2B).toBe(shouldRequireE2B);
      
      if (shouldRequireE2B) {
        expect(result.data.clientId).toBeDefined();
        expect(result.data.wsUrl).toBeDefined();
        expect(result.data.wsUrl).toContain(result.data.clientId);
      } else {
        expect(result.message).toBe('Standard chat response');
      }
    }
  });

  test('Should handle NLP service errors gracefully', async () => {
    // Mock NLP service to throw an error
    const mockNlpService = new MockNLPService();
    jest.spyOn(mockNlpService, 'execute').mockImplementation(() => {
      throw new Error('NLP service error');
    });
    
    // Replace the job's NLP service with our mocked one
    (job as any).nlpService = mockNlpService;
    
    const result = await job.start('Run this code please');
    
    // Should default to standard chat on error
    expect(result.data.requiresE2B).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  test('Should include proper WebSocket URL when E2B is required', async () => {
    const result = await job.start('Please execute this code in a terminal');
    
    expect(result.data.requiresE2B).toBe(true);
    expect(result.data.wsUrl).toBeDefined();
    expect(result.data.wsUrl).toContain('ws://');
    expect(result.data.wsUrl).toContain(result.data.clientId);
  });
}); 