/**
 * Executor Agent
 * 
 * Responsible for implementing plans created by the planner agent.
 * Handles direct interaction with tools and external systems.
 */

import { MemoryManager } from '../memoryManager';
import { ToolsManager, ToolExecutionResult } from '../toolsManager';
import { ExecutionPlan, ExecutionContext, ExecutionStep } from '../orchestrator';
import { SandboxEnvironment, SandboxSecurityPolicy } from '../sandboxEnvironment';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Execution result
 */
export interface ExecutionResult {
  success: boolean;
  details: Record<string, any>[];
  failedSteps: string[];
  nextSteps?: string[];
}

/**
 * ExecutorAgent class
 * 
 * Executes planned steps, interacts with tools, and manages execution state.
 */
export class ExecutorAgent {
  private sandboxEnvironment: SandboxEnvironment | null = null;

  constructor(
    private modelProvider: any, // AI model provider
    private memoryManager: MemoryManager,
    private toolsManager: ToolsManager,
    private organizationId: string,
    private supabaseClient: SupabaseClient
  ) {}

  /**
   * Initialize the executor agent with its dependencies
   */
  async initialize(): Promise<void> {
    // Define security policy for the sandbox
    const securityPolicy: SandboxSecurityPolicy = {
      allowedHosts: [
        'api.openai.com',
        'api.shopify.com',
        'supabase.co',
        'githubusercontent.com',
        'npmjs.org'
      ],
      allowedCommands: [
        'node',
        'npm',
        'npx',
        'curl',
        'wget',
        'git clone',
        'git checkout',
        'ls',
        'cat',
        'grep',
        'find',
        'echo',
        'mkdir',
        'cp',
        'mv'
      ],
      resourceLimits: {
        cpuLimit: 2,
        memoryMB: 2048,
        timeoutSec: 300
      }
    };

    // Initialize the sandbox environment
    this.sandboxEnvironment = new SandboxEnvironment(
      this.supabaseClient,
      this.organizationId,
      securityPolicy
    );

    await this.sandboxEnvironment.initialize();
  }

  /**
   * Execute a plan created by the planner agent
   * 
   * @param plan The execution plan to implement
   * @param context Execution context for tracking progress
   * @returns Results of the execution
   */
  async executePlan(plan: ExecutionPlan, context: ExecutionContext): Promise<ExecutionResult> {
    // Make sure the sandbox is initialized
    if (!this.sandboxEnvironment) {
      await this.initialize();
    }

    // Update context to running
    context.status = 'running';
    
    // Track execution details and failed steps
    const details: Record<string, any>[] = [];
    const failedSteps: string[] = [];
    
    // Create a map of steps by ID for easy lookup
    const stepsById = new Map<string, ExecutionStep>();
    plan.steps.forEach(step => stepsById.set(step.id, step));
    
    // Track which steps are ready to execute
    const readySteps = new Set<string>();
    const completedSteps = new Set<string>();
    
    // Find initial steps (those with no dependencies)
    plan.steps.forEach(step => {
      if (step.dependsOn.length === 0) {
        readySteps.add(step.id);
      }
    });
    
    // Continue until all steps are complete or we encounter a failure
    while (readySteps.size > 0) {
      // Get the next ready step
      const stepId = readySteps.values().next().value as string;
      readySteps.delete(stepId);
      
      const step = stepsById.get(stepId);
      
      // Skip if step not found (shouldn't happen, but just in case)
      if (!step) {
        console.error(`Step not found: ${stepId}`);
        continue;
      }
      
      // Ensure the step has an entry in the context
      if (!context.steps[stepId]) {
        context.steps[stepId] = {
          status: 'pending'
        };
      }
      
      // Update step status in context
      context.steps[stepId].status = 'running';
      context.steps[stepId].startTime = new Date();
      
      try {
        // Execute the step
        const result = await this.executeStep(step);
        
        // Update step status in context
        context.steps[stepId].status = 'completed';
        context.steps[stepId].endTime = new Date();
        context.steps[stepId].result = result;
        
        // Add to completed steps
        completedSteps.add(stepId);
        
        // Add execution details
        details.push({
          stepId,
          description: step.description,
          success: true,
          result
        });
        
        // Find steps that are now ready (all dependencies completed)
        plan.steps.forEach(nextStep => {
          if (!completedSteps.has(nextStep.id) && !readySteps.has(nextStep.id)) {
            // Check if all dependencies are satisfied
            const allDependenciesMet = nextStep.dependsOn.every(depId => completedSteps.has(depId));
            
            if (allDependenciesMet) {
              readySteps.add(nextStep.id);
            }
          }
        });
      } catch (error) {
        // Update step status in context
        context.steps[stepId].status = 'failed';
        context.steps[stepId].endTime = new Date();
        context.steps[stepId].error = error instanceof Error ? error.message : String(error);
        
        // Add to failed steps
        failedSteps.push(stepId);
        
        // Add execution details
        details.push({
          stepId,
          description: step.description,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Don't continue executing dependent steps
        break;
      }
    }
    
    // Update context status
    context.status = failedSteps.length > 0 ? 'failed' : 'completed';
    
    // Store execution context in memory
    await this.memoryManager.storeExecution(context);
    
    // Return execution result
    return {
      success: failedSteps.length === 0,
      details,
      failedSteps,
      nextSteps: this.determineNextSteps(plan, completedSteps, failedSteps)
    };
  }

  /**
   * Execute a single step in the plan
   * 
   * @param step The step to execute
   * @returns Result of the step execution
   */
  private async executeStep(step: ExecutionStep): Promise<any> {
    // If the sandbox is not initialized, initialize it
    if (!this.sandboxEnvironment) {
      await this.initialize();
    }

    // If the step has a specific tool, use that
    if (step.toolId) {
      // Check if the tool can be executed in the sandbox
      if (this.isSandboxableTool(step.toolId)) {
        return this.executeSandboxedTool(step.toolId, step.parameters || {});
      } else {
        // Use the tool manager for non-sandboxed tools
        const result = await this.toolsManager.executeTool(step.toolId, step.parameters || {});
        
        if (!result.success) {
          throw new Error(`Tool execution failed: ${result.error}`);
        }
        
        return result.result;
      }
    }
    
    // If no specific tool is specified, use the AI model to determine
    // what action to take based on the step description
    // In a full implementation, this would use the LLM to decide
    
    // For now, return a placeholder result
    return {
      message: `Executed step: ${step.description}`
    };
  }

  /**
   * Determine if a tool should be executed in the sandbox
   * 
   * @param toolId The ID of the tool
   * @returns Whether the tool should be executed in the sandbox
   */
  private isSandboxableTool(toolId: string): boolean {
    // List of tools that should be executed in the sandbox
    const sandboxedTools = [
      'browser_automation',
      'file_operations',
      'code_execution',
      'shell_command'
    ];
    
    return sandboxedTools.some(tool => toolId.includes(tool));
  }

  /**
   * Execute a tool in the sandbox environment
   * 
   * @param toolId The ID of the tool to execute
   * @param parameters Parameters for the tool
   * @returns Result of the tool execution
   */
  private async executeSandboxedTool(toolId: string, parameters: any): Promise<any> {
    if (!this.sandboxEnvironment) {
      throw new Error('Sandbox environment not initialized');
    }
    
    // Execute the tool in the sandbox based on the tool type
    if (toolId.includes('browser')) {
      // For browser automation tools
      const action = parameters.action || 'navigate';
      const result = await this.sandboxEnvironment.executeBrowserAction(action, parameters);
      
      if (!result.success) {
        throw new Error(`Browser action failed: ${result.error}`);
      }
      
      return JSON.parse(result.output || '{}');
    } else if (toolId.includes('file')) {
      // For file operation tools
      const action = parameters.action || 'read';
      const result = await this.sandboxEnvironment.executeFileOperation(action, parameters);
      
      if (!result.success) {
        throw new Error(`File operation failed: ${result.error}`);
      }
      
      return JSON.parse(result.output || '{}');
    } else if (toolId.includes('shell') || toolId.includes('code')) {
      // For shell commands or code execution
      const command = parameters.command || parameters.code || '';
      
      if (!command) {
        throw new Error('No command specified');
      }
      
      const result = await this.sandboxEnvironment.executeCommand(command);
      
      if (!result.success) {
        throw new Error(`Command execution failed: ${result.error}`);
      }
      
      return { output: result.output };
    }
    
    throw new Error(`Unsupported sandboxed tool: ${toolId}`);
  }

  /**
   * Determine next steps based on execution results
   * 
   * @param plan The original execution plan
   * @param completedSteps IDs of completed steps
   * @param failedSteps IDs of failed steps
   * @returns Array of recommended next steps
   */
  private determineNextSteps(
    plan: ExecutionPlan,
    completedSteps: Set<string>,
    failedSteps: string[]
  ): string[] {
    // In a full implementation, this would use the LLM to analyze the execution
    // results and suggest appropriate next actions
    
    // For now, implement simple logic
    if (failedSteps.length > 0) {
      return ['Retry failed steps with modified parameters'];
    }
    
    if (completedSteps.size === plan.steps.length) {
      return ['Task completed successfully'];
    }
    
    return ['Continue with remaining steps'];
  }

  /**
   * Handles recovery from a failed step
   * 
   * @param context Execution context with failure information
   * @returns Updated execution plan for recovery
   */
  async recoverFromFailure(context: ExecutionContext): Promise<ExecutionPlan> {
    // Find failed steps
    const failedStepIds = Object.entries(context.steps)
      .filter(([_, status]) => status.status === 'failed')
      .map(([id, _]) => id);
    
    // In a full implementation, this would use the LLM to analyze failures
    // and create appropriate recovery plans
    
    // For now, create a simple recovery plan that retries failed steps
    const recoverySteps: ExecutionStep[] = [];
    
    // Add a recovery step for each failed step
    failedStepIds.forEach(failedId => {
      recoverySteps.push({
        id: crypto.randomUUID(),
        description: `Recovery for failed step ${failedId}`,
        dependsOn: [],
        // We would determine appropriate tools and parameters based on the failure
      });
    });
    
    return {
      steps: recoverySteps,
      estimatedCompletion: new Date(Date.now() + 1000 * 60 * 5).toISOString(), // 5 minutes from now
      requiredTools: []
    };
  }

  /**
   * Clean up resources used by the executor agent
   */
  async cleanup(): Promise<void> {
    // Clean up the sandbox environment
    if (this.sandboxEnvironment) {
      await this.sandboxEnvironment.cleanup();
      this.sandboxEnvironment = null;
    }
  }
} 