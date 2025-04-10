/**
 * Tests for the Agent Orchestration Layer
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { AgentOrchestrator, TaskInterpretation, ExecutionPlan } from '../../supabase/functions/agents/orchestrator';

// Mock dependencies
jest.mock('../../supabase/functions/agents/executiveAgent');
jest.mock('../../supabase/functions/agents/knowledgeAgent');
jest.mock('../../supabase/functions/agents/plannerAgent');
jest.mock('../../supabase/functions/agents/executorAgent');
jest.mock('../../supabase/functions/agents/memoryManager');
jest.mock('../../supabase/functions/agents/toolsManager');

// Import mocked classes
import { ExecutiveAgent } from '../../supabase/functions/agents/executiveAgent';
import { KnowledgeAgent } from '../../supabase/functions/agents/knowledgeAgent';
import { PlannerAgent } from '../../supabase/functions/agents/plannerAgent';
import { ExecutorAgent } from '../../supabase/functions/agents/executorAgent';
import { MemoryManager } from '../../supabase/functions/agents/memoryManager';
import { ToolsManager } from '../../supabase/functions/agents/toolsManager';

// Mock model provider
const mockModelProvider = {
  generateText: jest.fn(),
  generateEmbedding: jest.fn()
};

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  single: jest.fn()
};

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock the implementations of agent methods
    const mockTaskInterpretation: TaskInterpretation = {
      taskDescription: 'Mock task description',
      requiredKnowledge: ['test_knowledge'],
      userIntent: 'test_intent'
    };
    
    (ExecutiveAgent.prototype.interpretTask as jest.Mock).mockResolvedValue(mockTaskInterpretation);
    (KnowledgeAgent.prototype.gatherKnowledge as jest.Mock).mockResolvedValue([]);
    
    const mockExecutionPlan: ExecutionPlan = {
      steps: [
        { 
          id: 'step1', 
          description: 'Test step',
          dependsOn: []
        }
      ],
      estimatedCompletion: new Date().toISOString(),
      requiredTools: []
    };
    
    (PlannerAgent.prototype.createPlan as jest.Mock).mockResolvedValue(mockExecutionPlan);
    (ExecutorAgent.prototype.executePlan as jest.Mock).mockResolvedValue({
      success: true,
      details: [],
      failedSteps: []
    });
    
    (ExecutiveAgent.prototype.synthesizeResults as jest.Mock).mockResolvedValue({
      summary: 'Test result'
    });
    
    // Create orchestrator instance
    orchestrator = new AgentOrchestrator(
      mockSupabaseClient as any,
      {
        modelProvider: mockModelProvider,
        organizationId: 'test-org'
      }
    );
  });
  
  test('handleUserRequest should process request through all agents', async () => {
    // Arrange
    const request = 'Test user request';
    
    // Act
    const result = await orchestrator.handleUserRequest(request);
    
    // Assert
    expect(ExecutiveAgent.prototype.interpretTask).toHaveBeenCalledWith(request);
    expect(KnowledgeAgent.prototype.gatherKnowledge).toHaveBeenCalled();
    expect(PlannerAgent.prototype.createPlan).toHaveBeenCalled();
    expect(ExecutorAgent.prototype.executePlan).toHaveBeenCalled();
    expect(ExecutiveAgent.prototype.synthesizeResults).toHaveBeenCalled();
    expect(result).toEqual({ summary: 'Test result' });
  });
  
  test('startAgenticLoop should initialize loop with provided jobs', async () => {
    // Arrange
    const initialJobs = [{ id: 'job1', title: 'Test job' }];
    
    // Mock console.log to verify output
    console.log = jest.fn();
    
    // Act
    await orchestrator.startAgenticLoop(initialJobs);
    
    // Assert
    expect(console.log).toHaveBeenCalledWith(
      'Starting agentic loop with initial jobs:',
      initialJobs.length
    );
  });
}); 