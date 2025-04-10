/**
 * Tests for the Knowledge Agent component
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { KnowledgeAgent, KnowledgeSource } from '../../supabase/functions/agents/knowledgeAgent';
import { MemoryManager } from '../../supabase/functions/agents/memoryManager';

// Mock dependencies
jest.mock('../../supabase/functions/agents/memoryManager');

describe('KnowledgeAgent', () => {
  // Mock model provider
  const mockModelProvider = {
    generateText: jest.fn(),
    generateEmbedding: jest.fn()
  };
  
  // Mock memory manager
  const mockMemoryManager = {
    searchLongTermMemory: jest.fn(),
    storeLongTermMemory: jest.fn(),
    storeWorkingMemory: jest.fn(),
    retrieveWorkingMemory: jest.fn(),
    storeExecution: jest.fn(),
    retrieveExecution: jest.fn()
  };
  
  let knowledgeAgent: KnowledgeAgent;
  const testOrgId = 'test-org-id';
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Initialize KnowledgeAgent with mocks
    knowledgeAgent = new KnowledgeAgent(
      mockModelProvider,
      mockMemoryManager as unknown as MemoryManager,
      testOrgId
    );
    
    // Default mock implementations
    mockMemoryManager.searchLongTermMemory.mockResolvedValue([]);
  });
  
  describe('Knowledge Gathering', () => {
    test('gatherKnowledge should retrieve memory items and convert to knowledge items', async () => {
      // Arrange
      const taskDescription = 'test task';
      const requiredKnowledge = ['user_preferences', 'domain_knowledge'];
      
      const mockMemoryResults = [
        { id: 'mem1', data: { topic: 'user_preferences' }, similarity: 0.9, created_at: '2023-01-01' },
        { id: 'mem2', data: { topic: 'domain_knowledge' }, similarity: 0.8, created_at: '2023-02-01' }
      ];
      
      mockMemoryManager.searchLongTermMemory.mockResolvedValue(mockMemoryResults);
      
      // Act
      const results = await knowledgeAgent.gatherKnowledge(taskDescription, requiredKnowledge);
      
      // Assert
      expect(mockMemoryManager.searchLongTermMemory).toHaveBeenCalledWith(taskDescription, 5);
      expect(results.length).toBe(2);
      expect(results[0].source).toBe(KnowledgeSource.MEMORY);
      expect(results[0].content).toEqual(mockMemoryResults[0].data);
      expect(results[0].relevance).toBe(mockMemoryResults[0].similarity);
      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({
          content: mockMemoryResults[0].data,
          source: KnowledgeSource.MEMORY,
          relevance: mockMemoryResults[0].similarity,
          metadata: expect.objectContaining({ memoryId: mockMemoryResults[0].id })
        }),
        expect.objectContaining({
          content: mockMemoryResults[1].data,
          source: KnowledgeSource.MEMORY,
          relevance: mockMemoryResults[1].similarity,
          metadata: expect.objectContaining({ memoryId: mockMemoryResults[1].id })
        })
      ]));
    });
    
    test('gatherKnowledge should return empty array when no memories found', async () => {
      // Arrange
      mockMemoryManager.searchLongTermMemory.mockResolvedValue([]);
      
      // Act
      const results = await knowledgeAgent.gatherKnowledge('test task', []);
      
      // Assert
      expect(results).toEqual([]);
    });
    
    test('gatherKnowledge should sort results by relevance', async () => {
      // Arrange
      const mockMemoryResults = [
        { id: 'mem1', data: { value: 'low relevance' }, similarity: 0.5, created_at: '2023-01-01' },
        { id: 'mem2', data: { value: 'high relevance' }, similarity: 0.9, created_at: '2023-02-01' },
        { id: 'mem3', data: { value: 'medium relevance' }, similarity: 0.7, created_at: '2023-03-01' }
      ];
      
      mockMemoryManager.searchLongTermMemory.mockResolvedValue(mockMemoryResults);
      
      // Act
      const results = await knowledgeAgent.gatherKnowledge('test task', []);
      
      // Assert
      expect(results.length).toBe(3);
      expect(results[0].content.value).toBe('high relevance');
      expect(results[1].content.value).toBe('medium relevance');
      expect(results[2].content.value).toBe('low relevance');
    });
  });
  
  describe('Object Analysis', () => {
    test('analyzeObject should generate cognitive analysis for objects', async () => {
      // Arrange
      const testObject = {
        type: 'test_type',
        created_at: '2023-04-01',
        related_ids: ['rel1', 'rel2']
      };
      
      // Act
      const analysis = await knowledgeAgent.analyzeObject(testObject);
      
      // Assert
      expect(analysis.type).toBe('basic_object_analysis');
      expect(analysis.key_insights).toContain(`Object is of type ${testObject.type}`);
      expect(analysis.key_insights).toContain(`Created on ${testObject.created_at}`);
      expect(analysis.connections.length).toBe(2);
      expect(analysis.connections[0].target).toBe('rel1');
      expect(analysis.connections[1].target).toBe('rel2');
      expect(analysis.confidence).toBeGreaterThan(0);
    });
    
    test('analyzeObject should handle objects without relationships', async () => {
      // Arrange
      const testObject = {
        type: 'test_type',
        created_at: '2023-04-01'
        // No related_ids
      };
      
      // Act
      const analysis = await knowledgeAgent.analyzeObject(testObject);
      
      // Assert
      expect(analysis.connections).toEqual([]);
    });
    
    test('analyzeObject should handle objects with missing fields', async () => {
      // Arrange
      const testObject = {
        // No type or created_at
      };
      
      // Act
      const analysis = await knowledgeAgent.analyzeObject(testObject);
      
      // Assert
      expect(analysis.key_insights).toContain('Object is of type unknown');
      expect(analysis.key_insights).toContain('Created on unknown date');
    });
  });
  
  describe('Knowledge Synthesis', () => {
    test('synthesizeKnowledge should format knowledge items into summary text', async () => {
      // Arrange
      const knowledgeItems = [
        {
          content: { topic: 'Topic 1', details: 'Details 1' },
          source: KnowledgeSource.MEMORY,
          relevance: 0.9,
          timestamp: new Date('2023-01-01')
        },
        {
          content: { topic: 'Topic 2', details: 'Details 2' },
          source: KnowledgeSource.DATABASE,
          relevance: 0.7,
          timestamp: new Date('2023-02-01')
        }
      ];
      
      // Act
      const summary = await knowledgeAgent.synthesizeKnowledge(knowledgeItems);
      
      // Assert
      expect(summary).toContain(`Synthesized knowledge from ${knowledgeItems.length} sources`);
      expect(summary).toContain('Topic 1');
      expect(summary).toContain('Topic 2');
      expect(summary).toContain('0.90'); // Formatted relevance
      expect(summary).toContain('0.70'); // Formatted relevance
    });
    
    test('synthesizeKnowledge should handle empty input', async () => {
      // Act
      const summary = await knowledgeAgent.synthesizeKnowledge([]);
      
      // Assert
      expect(summary).toContain('Synthesized knowledge from 0 sources');
    });
  });
}); 