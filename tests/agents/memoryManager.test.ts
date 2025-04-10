/**
 * Tests for the Memory Manager component
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { MemoryManager } from '../../supabase/functions/agents/memoryManager';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn(),
  rpc: jest.fn()
};

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  const testOrgId = 'test-org-id';
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Initialize MemoryManager with mock Supabase client
    memoryManager = new MemoryManager(
      mockSupabaseClient as any,
      testOrgId
    );
    
    // Mock implementation for single to return expected data
    mockSupabaseClient.single.mockImplementation(() => ({ data: null, error: null }));
    
    // Mock implementation for rpc to return expected data
    mockSupabaseClient.rpc.mockImplementation(() => ({ data: [], error: null }));
  });
  
  describe('Working Memory Operations', () => {
    test('storeWorkingMemory should insert memory object with correct structure', async () => {
      // Arrange
      const testKey = 'test-key';
      const testData = { value: 'test-value' };
      const mockResponse = { data: { id: 'test-id' }, error: null };
      mockSupabaseClient.upsert.mockResolvedValue(mockResponse);
      
      // Act
      await memoryManager.storeWorkingMemory(testKey, testData);
      
      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('objects');
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(expect.objectContaining({
        related_object_type_id: 'agent_working_memory',
        owner_organisation_id: testOrgId,
        metadata: expect.objectContaining({
          key: testKey,
          data: testData
        })
      }));
    });
    
    test('storeWorkingMemory should include expiration when ttl is provided', async () => {
      // Arrange
      const testKey = 'test-key';
      const testData = { value: 'test-value' };
      const ttl = 60000; // 1 minute
      const now = Date.now();
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      
      // Act
      await memoryManager.storeWorkingMemory(testKey, testData, ttl);
      
      // Assert
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({
          expires_at: expect.any(String)
        })
      }));
      
      // Verify the provided metadata contains an expiration timestamp
      const callArg = mockSupabaseClient.upsert.mock.calls[0][0];
      const expirationDate = new Date(callArg.metadata.expires_at).getTime();
      expect(expirationDate).toBeGreaterThan(now);
      expect(expirationDate).toBeLessThanOrEqual(now + ttl + 100); // Allow small timing differences
    });
    
    test('retrieveWorkingMemory should return data when found', async () => {
      // Arrange
      const testKey = 'test-key';
      const testData = { value: 'test-value' };
      mockSupabaseClient.single.mockResolvedValue({
        data: { metadata: { data: testData } },
        error: null
      });
      
      // Act
      const result = await memoryManager.retrieveWorkingMemory(testKey);
      
      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('objects');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('metadata');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('related_object_type_id', 'agent_working_memory');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('owner_organisation_id', testOrgId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('metadata->key', testKey);
      expect(result).toEqual(testData);
    });
    
    test('retrieveWorkingMemory should return null when not found', async () => {
      // Arrange
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });
      
      // Act
      const result = await memoryManager.retrieveWorkingMemory('nonexistent-key');
      
      // Assert
      expect(result).toBeNull();
    });
  });
  
  describe('Long-term Memory Operations', () => {
    test('storeLongTermMemory should store memory with embedding', async () => {
      // Arrange
      const testConcept = 'test-concept';
      const testData = { value: 'test-value' };
      
      // Act
      await memoryManager.storeLongTermMemory(testConcept, testData);
      
      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('objects');
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(expect.objectContaining({
        related_object_type_id: 'agent_long_term_memory',
        owner_organisation_id: testOrgId,
        metadata: expect.objectContaining({
          concept: testConcept,
          data: testData,
          embedding: expect.any(Array)
        }),
        embedding: expect.any(Array)
      }));
    });
    
    test('searchLongTermMemory should use RPC for vector search', async () => {
      // Arrange
      const testQuery = 'test query';
      const testResults = [
        { id: 'id1', concept: 'concept1', data: { value: 'value1' }, similarity: 0.9 },
        { id: 'id2', concept: 'concept2', data: { value: 'value2' }, similarity: 0.8 }
      ];
      mockSupabaseClient.rpc.mockResolvedValue({
        data: testResults,
        error: null
      });
      
      // Act
      const results = await memoryManager.searchLongTermMemory(testQuery);
      
      // Assert
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'match_agent_memories',
        expect.objectContaining({
          match_threshold: 0.7,
          match_count: 5,
          p_organization_id: testOrgId,
          query_embedding: expect.any(Array)
        })
      );
      expect(results).toEqual(testResults);
    });
    
    test('searchLongTermMemory should return empty array on error', async () => {
      // Arrange
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });
      
      // Act
      const results = await memoryManager.searchLongTermMemory('query');
      
      // Assert
      expect(results).toEqual([]);
    });
  });
  
  describe('Execution History Operations', () => {
    test('storeExecution should store execution context correctly', async () => {
      // Arrange
      const testContext = {
        id: 'test-execution-id',
        organizationId: testOrgId,
        startTime: new Date(),
        status: 'completed',
        steps: {
          step1: { status: 'completed', result: 'test result' }
        }
      };
      
      // Act
      await memoryManager.storeExecution(testContext);
      
      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('objects');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.objectContaining({
        related_object_type_id: 'agent_execution',
        owner_organisation_id: testOrgId,
        metadata: expect.objectContaining({
          execution_id: testContext.id,
          context: testContext,
          status: testContext.status
        })
      }));
    });
    
    test('retrieveExecution should return execution context when found', async () => {
      // Arrange
      const testExecutionId = 'test-execution-id';
      const testContext = {
        id: testExecutionId,
        status: 'completed',
        steps: {}
      };
      
      mockSupabaseClient.single.mockResolvedValue({
        data: { metadata: { context: testContext } },
        error: null
      });
      
      // Act
      const result = await memoryManager.retrieveExecution(testExecutionId);
      
      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('objects');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('metadata');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('related_object_type_id', 'agent_execution');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('metadata->execution_id', testExecutionId);
      expect(result).toEqual(testContext);
    });
    
    test('retrieveExecution should return null when not found', async () => {
      // Arrange
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });
      
      // Act
      const result = await memoryManager.retrieveExecution('nonexistent-id');
      
      // Assert
      expect(result).toBeNull();
    });
  });
}); 