/**
 * Agent Orchestration Layer Entry Point
 * 
 * Exports all agent components for ease of use.
 */
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts';
import { ExecutiveAgent } from './executiveAgent/index.ts';
import { KnowledgeAgent } from './knowledgeAgent/index.ts';
import { PlannerAgent } from './plannerAgent/index.ts';
import { ExecutorAgent } from './executorAgent/index.ts';
import { MemoryManager } from './memoryManager/index.ts';
import { ToolsManager } from './toolsManager/index.ts';
import { SandboxEnvironment } from './sandboxEnvironment/index.ts';
import { AgentOrchestrator } from './orchestrator/index.ts';
import * as ApiFunctions from './agent-orchestrator-api/index.ts';

// Export all components
export { 
  ExecutiveAgent,
  KnowledgeAgent,
  PlannerAgent,
  ExecutorAgent,
  MemoryManager,
  ToolsManager,
  SandboxEnvironment,
  AgentOrchestrator
};

// Export API functions
export const API = ApiFunctions;

/**
 * Initializes the agent system with default configuration.
 * This is a convenience function for simple use cases.
 */
export function initializeAgentSystem(options: any = {}) {
  console.log('Initializing agent system with options:', options);
  
  // Create core components
  const memoryManager = new MemoryManager();
  const toolsManager = new ToolsManager();
  
  // Create agent components
  const executiveAgent = new ExecutiveAgent();
  const knowledgeAgent = new KnowledgeAgent();
  const plannerAgent = new PlannerAgent();
  const executorAgent = new ExecutorAgent();
  
  // Create and return orchestrator
  return new AgentOrchestrator();
}

// Edge function handler
serve(async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type'
        }
      });
    }

    // Handle different API endpoints
    if (req.method === 'POST') {
      const body = await req.json();
      
      switch (path) {
        case 'initialize':
          return new Response(
            JSON.stringify(ApiFunctions.initializeAgentSystem(body)),
            { headers: { 'Content-Type': 'application/json' } }
          );
          
        case 'process':
          const result = await ApiFunctions.processRequest(body.request, body.context);
          return new Response(
            JSON.stringify(result),
            { headers: { 'Content-Type': 'application/json' } }
          );
          
        case 'jobs':
          if (body.action === 'create') {
            const job = await ApiFunctions.createJob(body.jobDetails);
            return new Response(
              JSON.stringify(job),
              { headers: { 'Content-Type': 'application/json' } }
            );
          } else if (body.action === 'status') {
            const status = await ApiFunctions.getJobStatus(body.jobId);
            return new Response(
              JSON.stringify(status),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }
          break;
          
        default:
          break;
      }
    }
    
    // Default response for unsupported methods or paths
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        message: 'Not found or method not allowed' 
      }),
      { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        message: error.message || 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}); 