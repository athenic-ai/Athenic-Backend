/**
 * Executor Agent
 * 
 * Responsible for implementing plans created by the planner agent.
 * Handles direct interaction with tools and external systems.
 */

import { MemoryManager } from '../memoryManager/index.ts';
import { ToolsManager, ToolExecutionResult } from '../toolsManager/index.ts';
import { ExecutionPlan, ExecutionContext, ExecutionStep } from '../orchestrator/index.ts';
import { SandboxEnvironment, SandboxSecurityPolicy } from '../sandboxEnvironment/index.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.14.0';

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

  constructor(options: any = {}) {
    console.log('ExecutorAgent initialized');
  }

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
  async executePlan(executionPlan: any, executionContext: any) {
    console.log('Executing plan:', executionPlan);
    
    // Mock execution result
    return {
      success: true,
      results: [
        { stepId: '1', status: 'completed', output: 'System initialized' },
        { stepId: '2', status: 'completed', output: 'Data processed' },
        { stepId: '3', status: 'completed', output: 'Task completed' }
      ],
      completedAt: new Date().toISOString()
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