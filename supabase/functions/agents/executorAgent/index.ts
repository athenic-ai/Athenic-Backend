/**
 * Executor Agent
 * 
 * Responsible for implementing plans created by the planner agent.
 * Handles direct interaction with tools and external systems.
 */

import { MemoryManager } from '../memoryManager';
import { ToolsManager, ToolExecutionResult } from '../toolsManager';
import { ExecutionPlan, ExecutionContext, ExecutionStep } from '../orchestrator';

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
  constructor(
    private modelProvider: any, // AI model provider
    private memoryManager: MemoryManager,
    private toolsManager: ToolsManager,
    private organizationId: string
  ) {}

  /**
   * Execute a plan created by the planner agent
   * 
   * @param plan The execution plan to implement
   * @param context Execution context for tracking progress
   * @returns Results of the execution
   */
  async executePlan(plan: ExecutionPlan, context: ExecutionContext): Promise<ExecutionResult> {
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
    // If the step has a specific tool, use that
    if (step.toolId) {
      const result = await this.toolsManager.executeTool(step.toolId, step.parameters || {});
      
      if (!result.success) {
        throw new Error(`Tool execution failed: ${result.error}`);
      }
      
      return result.result;
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
} 