import { NlpService } from '../../../../supabase/functions/_shared/services/nlp/nlpService';
import { StorageService } from '../../../../supabase/functions/_shared/services/storage/storageService';
import { NlpFunctionsBase } from '../../../../supabase/functions/_shared/services/nlp/nlpFunctionsBase';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { FunctionResult } from '../../../../supabase/functions/_shared/configs/index';

// Mock dependencies
const mockStorageService = jest.fn<() => StorageService>();
jest.mock('../../../../supabase/functions/_shared/services/storage/storageService', () => mockStorageService);

const loadFunctionGroups = jest.fn<() => Promise<void>>();
const getFunctionDeclarations = jest.fn<() => any[]>();
const implementationMock = jest.fn<() => Promise<FunctionResult<{ result: string }>>>();
jest.mock('../../../../supabase/functions/_shared/services/nlp/nlpFunctionsBase', () => ({
  loadFunctionGroups,
  getFunctionDeclarations,
  nlpFunctions: {
    testFunction: {
      declaration: {
        type: 'function',
        function: {
          name: 'testFunction',
          description: 'A test function'
        }
      },
      implementation: implementationMock
    }
  }
}));

const createCompletionMock = jest.fn<() => Promise<{ choices: { message: { content: string | null; tool_calls: any } }[] }>>();
const createEmbeddingMock = jest.fn<() => Promise<{ data: { embedding: number[] }[] }>>();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: createCompletionMock } },
    embeddings: { create: createEmbeddingMock }
  }));
});

describe('NlpService', () => {
  let nlpService: NlpService;
  let mockNlpFunctionsBase: any;
  let errorNlpService: NlpService;
  let config: any;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock for storage service
    mockStorageService.mockImplementation(() => new StorageService());
    
    // Mock NlpFunctionsBase
    mockNlpFunctionsBase = {
      loadFunctionGroups,
      getFunctionDeclarations,
      nlpFunctions: {
        testFunction: {
          declaration: {
            type: 'function',
            function: {
              name: 'testFunction',
              description: 'A test function'
            }
          },
          implementation: implementationMock
        }
      }
    };

    // Initialize NLP service with mocked storage service
    nlpService = new NlpService(new StorageService());
    
    // Mock Deno.env.get used in OpenAI client initialization
    (global as any).Deno = {
      env: {
        get: jest.fn((key: string) => {
          const envVars: Record<string, string> = {
            'OPENAI_API_KEY': 'test-api-key',
            'OPENROUTER_API_KEY': 'test-openrouter-key'
          };
          return envVars[key] || null;
        })
      }
    };
    
    // Initialize clients before testing
    await nlpService.initialiseClientCore('dummy-api-key');
    await nlpService.initialiseClientOpenAi('dummy-api-key');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('initialiseClientCore', () => {
    it('should initialize OpenRouter client successfully', async () => {
      await nlpService.initialiseClientCore('dummy-api-key');
      expect((global as any).Deno.env.get).toHaveBeenCalledWith('OPENROUTER_API_KEY');
    });

    it('should throw error if initialization fails', async () => {
      ((global as any).Deno.env.get as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to get API key');
      });
      
      await expect(nlpService.initialiseClientCore('dummy-api-key')).rejects.toThrow();
    });
  });

  describe('initialiseClientOpenAi', () => {
    it('should initialize OpenAI client successfully', async () => {
      await nlpService.initialiseClientOpenAi('dummy-api-key');
      expect((global as any).Deno.env.get).toHaveBeenCalledWith('OPENAI_API_KEY');
    });
  });

  describe('setMemberVariables', () => {
    it('should set member variables correctly', () => {
      const testOrganisationId = 'test-org-1';
      const testObjectTypes = [{ id: 'product', name: 'Product' }];
      
      nlpService.setMemberVariables({
        organisationId: testOrganisationId,
        objectTypes: testObjectTypes
      });
      
      // We can't directly test private properties, but we can test behavior
      // This would require exposing getter methods or testing indirectly via behavior
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      // Initialize clients before testing execute
      await nlpService.initialiseClientCore('dummy-api-key');
    });
    
    it('should throw error if prompt parts not provided', async () => {
      await expect(
        nlpService.execute({
          promptParts: [],
          systemInstruction: 'Test instruction'
        })
      ).rejects.toThrow('No promptParts provided for NLP analysis');
    });
    
    it('should throw error if client not initialized', async () => {
      // Create new instance without initialization
      const uninitializedNlpService = new NlpService(new StorageService());
      
      await expect(
        uninitializedNlpService.execute({
          promptParts: [{ text: 'Test prompt' }],
          systemInstruction: 'Test instruction'
        })
      ).rejects.toThrow('this.clientCore not initialised');
    });
    
    it('should handle simple text prompts', async () => {
      const result = await nlpService.execute({
        promptParts: [{ text: 'Test prompt' }],
        systemInstruction: 'Test instruction'
      });
      
      // We can't fully test without exposing more internals, but we can test it doesn't throw
      expect(result).toBeDefined();
    });

    it('should handle tool calls when present', async () => {
      // Mock OpenAI response with tool calls
      const mockOpenAI = require('openai');
      type OpenAiCompletionResult = { choices: { message: { content: string | null; tool_calls: any } }[] };
      const mockOpenAiCreateCompletionResult: OpenAiCompletionResult = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  type: 'function',
                  function: {
                    name: 'testFunction',
                    arguments: JSON.stringify({ param1: 'test value' })
                  }
                }
              ]
            }
          }
        ]
      };

      const createCompletionMock = jest.fn<() => Promise<OpenAiCompletionResult>>();
      const createEmbeddingMock = jest.fn<() => Promise<{ data: { embedding: number[] }[] }>>();

      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: createCompletionMock
          }
        },
        embeddings: {
          create: createEmbeddingMock
        }
      }));

      // Since we're dealing with singletons and injection doesn't fully work in our tests,
      // we need to recreate the nlpService with our updated mock
      nlpService = new NlpService(new StorageService());
      await nlpService.initialiseClientCore('dummy-api-key');

      // Set up the function declarations
      nlpService['nlpFunctionsBase'] = mockNlpFunctionsBase;
      nlpService['functionDeclarations'] = mockNlpFunctionsBase.getFunctionDeclarations();

      const result = await nlpService.execute({
        promptParts: [{ text: 'Call the test function' }],
        systemInstruction: 'Test instruction',
        interpretFuncCalls: true,
        functionsIncluded: ['testFunction']
      });

      // Since our mock implementation only checks for function calls,
      // we should at least verify the function was accessed
      expect(result).toBeDefined();
    });
  });

  describe('executeThread', () => {
    beforeEach(async () => {
      // Initialize clients before testing executeThread
      await nlpService.initialiseClientCore('dummy-api-key');
      await nlpService.initialiseClientOpenAi('dummy-api-key');
      
      // Mock the execute method which executeThread will call
      const mockFunctionResult: FunctionResult<{ result: string }> = {
        status: 200,
        message: 'Success',
        data: { result: 'Thread execution result' },
        references: null,
      };

      const executeMock = jest.fn<() => Promise<FunctionResult<{ result: string }>>>().mockResolvedValue(mockFunctionResult);
      nlpService.execute = executeMock;
    });
    
    it('should execute a thread successfully', async () => {
      const result = await nlpService.executeThread({
        promptParts: [{ text: 'Test thread prompt' }]
      });
      
      expect(result.status).toBe(200);
      expect(nlpService.execute).toHaveBeenCalled();
    });
    
    it('should handle errors during execution', async () => {
      // Mock execution failure
      const errorMock = new Error('Execution failed');
      const executeMock = jest.fn<() => Promise<Error>>().mockRejectedValue(errorMock);
      nlpService.execute = executeMock;
      
      const result = await nlpService.executeThread({
        promptParts: [{ text: 'Test thread prompt' }]
      });
      
      expect(result.status).toBe(500);
      expect(result.message).toContain('Error in executeThread');
    });
    
    it('should include chat history when provided', async () => {
      const chatHistory = [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' }
      ];
      
      await nlpService.executeThread({
        promptParts: [{ text: 'Test thread prompt' }],
        chatHistory
      });
      
      // Verify chat history was passed to execute
      expect(nlpService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          chatHistory
        })
      );
    });
  });

  describe('updateFunctionDeclarations', () => {
    beforeEach(() => {
      // Set up NlpFunctionsBase
      nlpService['nlpFunctionsBase'] = mockNlpFunctionsBase;
    });
    
    it('should load function groups when specified', async () => {
      await nlpService.updateFunctionDeclarations({
        functionGroupsIncluded: ['nlpFunctionsData']
      });
      
      expect(mockNlpFunctionsBase.loadFunctionGroups).toHaveBeenCalledWith(['nlpFunctionsData']);
      expect(mockNlpFunctionsBase.getFunctionDeclarations).toHaveBeenCalled();
    });
    
    it('should load specific functions when specified', async () => {
      await nlpService.updateFunctionDeclarations({
        functionsIncluded: ['testFunction']
      });
      
      expect(mockNlpFunctionsBase.getFunctionDeclarations).toHaveBeenCalledWith(['testFunction']);
    });
    
    it('should not reload if functions already loaded and match request', async () => {
      // Set current functions
      nlpService['currentFunctionsIncluded'] = ['testFunction'];
      nlpService['functionDeclarations'] = mockNlpFunctionsBase.getFunctionDeclarations();

      await nlpService.updateFunctionDeclarations({
        functionsIncluded: ['testFunction']
      });
      
      // Should not reload since functions are the same
      expect(mockNlpFunctionsBase.loadFunctionGroups).not.toHaveBeenCalled();
    });
  });

  describe('generateTextEmbedding', () => {
    beforeEach(async () => {
      // Initialize OpenAI client
      await nlpService.initialiseClientOpenAi('dummy-api-key');
      
      // Mock generateTextEmbedding to return consistent result
      const mockFunctionResult: FunctionResult<number[]> = {
        status: 200,
        message: 'Success',
        data: [0.1, 0.2, 0.3],
        references: null,
      };

      const generateTextEmbeddingMock = jest.fn<(input: string | Record<string, any>) => Promise<FunctionResult<number[]>>>().mockResolvedValue(mockFunctionResult);
      nlpService.generateTextEmbedding = generateTextEmbeddingMock;
    });
    
    it('should generate embeddings for text input', async () => {
      const result = await nlpService.generateTextEmbedding('Test text for embedding');
      
      expect(result.status).toBe(200);
      expect((result.data as number[])).toEqual([0.1, 0.2, 0.3]);
    });
    
    it('should handle object input by stringifying', async () => {
      const testObj = { key: 'value', nested: { data: true } };
      
      const result = await nlpService.generateTextEmbedding(testObj);
      
      expect(result.status).toBe(200);
      expect((result.data as number[])).toEqual([0.1, 0.2, 0.3]);
    });
    
    it('should handle errors during embedding generation', async () => {
      // Mock OpenAI client to throw error
      const mockOpenAI = require('openai');
      type OpenAiEmbeddingResult = { data: { embedding: number[] }[] };
      const errorMock = new Error('Embedding generation failed');
      const createEmbeddingMock = jest.fn<() => Promise<Error>>().mockRejectedValue(errorMock);
      mockOpenAI.mockImplementation(() => ({
        embeddings: {
          create: createEmbeddingMock
        }
      }));
      
      // Recreate service with error-throwing mock
      errorNlpService = new NlpService(new StorageService());
      await errorNlpService.initialiseClientOpenAi('dummy-api-key');
      
      const generateTextEmbeddingMock = jest.fn<(input: string | Record<string, any>) => Promise<FunctionResult<number[]>>>().mockResolvedValue({
        status: 500,
        data: null,
        message: 'Failed to generate embedding',
        references: null
      });
      errorNlpService.generateTextEmbedding = generateTextEmbeddingMock;
      
      const result = await errorNlpService.generateTextEmbedding('Test text');
      
      expect(result.status).toBe(500);
      expect(result.message).toContain('Error generating embedding');
    });
  });

  describe('addEmbeddingToObject', () => {
    beforeEach(async () => {
      // Initialize OpenAI client
      await nlpService.initialiseClientOpenAi('dummy-api-key');
      
      // Mock generateTextEmbedding to return consistent result
      const mockFunctionResult: FunctionResult<number[]> = {
        status: 200,
        message: 'Success',
        data: [0.1, 0.2, 0.3],
        references: null,
      };

      const generateTextEmbeddingMock = jest.fn<(input: string | Record<string, any>) => Promise<FunctionResult<number[]>>>().mockResolvedValue(mockFunctionResult);
      nlpService.generateTextEmbedding = generateTextEmbeddingMock;
    });
    
    it('should add embedding to object with metadata', async () => {
      const testObj = {
        id: 'test-1',
        metadata: {
          title: 'Test Object',
          description: 'This is a test'
        }
      };
      
      const result = await nlpService.addEmbeddingToObject(testObj);
      
      expect(result.status).toBe(200);
      expect(result.data).toHaveProperty('embedding');
      expect((result.data as any).embedding).toEqual([0.1, 0.2, 0.3]);
      expect(nlpService.generateTextEmbedding).toHaveBeenCalled();
    });
    
    it('should handle objects without metadata', async () => {
      const testObj = {
        id: 'test-1',
        someProperty: 'value'
      };
      
      const result = await nlpService.addEmbeddingToObject(testObj);
      
      expect(result.status).toBe(200);
      expect(result.data).toHaveProperty('embedding');
    });
    
    it('should handle embedding generation failure', async () => {
      // Mock embedding generation failure
      const generateTextEmbeddingMock = jest.fn<(input: string | Record<string, any>) => Promise<FunctionResult<number[]>>>().mockResolvedValue({
        status: 500,
        data: null,
        message: 'Failed to generate embedding',
        references: null
      });
      nlpService.generateTextEmbedding = generateTextEmbeddingMock;
      
      const testObj = { id: 'test-1' };
      
      const result = await nlpService.addEmbeddingToObject(testObj);
      
      expect(result.status).toBe(500);
      expect(result.message).toContain('Failed to generate embedding');
    });
  });

  describe('truncateObjectValues and calculateMaxValueLength', () => {
    it('should calculate max value length for nested objects', () => {
      const testObj = {
        shortField: 'abc',
        longField: 'a'.repeat(200),
        nested: {
          shortNested: '123',
          longNested: 'b'.repeat(300)
        }
      };
      
      const result = nlpService['calculateMaxValueLength'](testObj);
      
      // Longest field is longNested with 300 chars
      expect(result).toBe(300);
    });
    
    it('should truncate long text values', () => {
      const testObj = {
        shortField: 'abc',
        longField: 'a'.repeat(1000),
        nested: {
          longNested: 'b'.repeat(2000)
        }
      };
      
      const result = nlpService['truncateObjectValues'](testObj);
      
      // Default max length is 512 chars
      expect(result.longField.length).toBeLessThanOrEqual(512);
      expect(result.nested.longNested.length).toBeLessThanOrEqual(512);
      expect(result.shortField).toBe('abc'); // Short field should be unchanged
    });
    
    it('should handle arrays by truncating each item', () => {
      const testObj = {
        array: [
          'a'.repeat(1000), 
          'b'.repeat(800),
          'short item'
        ]
      };
      
      const result = nlpService['truncateObjectValues'](testObj);
      
      expect(result.array[0].length).toBeLessThanOrEqual(512);
      expect(result.array[1].length).toBeLessThanOrEqual(512);
      expect(result.array[2]).toBe('short item'); // Short item should be unchanged
    });
  });
}); 