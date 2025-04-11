/**
 * Agent Orchestration Layer Entry Point
 * 
 * Exports all agent components for ease of use.
 */

// Agents
export * from './executiveAgent';
export * from './knowledgeAgent';
export * from './plannerAgent';
export * from './executorAgent';

// Core components
export * from './memoryManager';
export * from './toolsManager';
export * from './sandboxEnvironment';
export * from './orchestrator';

// API
export * from './agent-orchestrator-api';

/**
 * Initializes the agent system with default configuration.
 * This is a convenience function for simple use cases.
 * 
 * @param supabaseClient The Supabase client to use
 * @param organizationId The organization ID
 * @returns An initialized agent orchestrator
 */
export async function initializeAgentSystem(supabaseClient: any, organizationId: string) {
  // Create a simple model provider for testing
  const modelProvider = {
    generateText: async (prompt: string) => {
      return `Response to: ${prompt}`;
    },
    generateEmbedding: async (text: string) => {
      return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
    }
  };

  // Import the orchestrator
  const { AgentOrchestrator } = await import('./orchestrator');
  
  // Create and return the orchestrator
  return new AgentOrchestrator(supabaseClient, {
    modelProvider,
    organizationId
  });
} 