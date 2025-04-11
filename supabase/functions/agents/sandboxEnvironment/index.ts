/**
 * Sandbox Environment
 * 
 * Provides a secure, isolated execution environment for running agent operations
 * using E2B's MicroVMs.
 */

import { E2BModule, E2BTypes } from './types';
import { SupabaseClient } from '@supabase/supabase-js';

// Use the custom E2B type instead of importing directly
// This allows us to use the custom type definitions
const E2B: E2BModule = require('e2b');

export interface SandboxSecurityPolicy {
  allowedHosts: string[];
  allowedCommands: string[];
  resourceLimits: {
    cpuLimit: number;
    memoryMB: number;
    timeoutSec: number;
  };
}

export interface SandboxExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}

export class SandboxEnvironment {
  private sessionId: string | null = null;
  private session: E2BTypes.Session | null = null;
  private executionHistory: Array<{
    command: string;
    timestamp: Date;
    result: SandboxExecutionResult;
  }> = [];

  constructor(
    private readonly supabaseClient: SupabaseClient,
    private readonly organizationId: string,
    private readonly securityPolicy: SandboxSecurityPolicy
  ) {}

  /**
   * Initialize the sandbox environment
   */
  async initialize(): Promise<void> {
    try {
      // Create a new E2B session
      this.session = await E2B.startSession({
        template: 'athenic-agent', // This should match a template configured in E2B
        envVars: {
          ORGANIZATION_ID: this.organizationId,
          SESSION_ID: this.sessionId || crypto.randomUUID()
        }
      });
      
      this.sessionId = this.session.id;
      
      // Configure firewall rules based on security policy
      if (this.securityPolicy.allowedHosts.length > 0) {
        await this.session.addFirewallRule({
          direction: 'egress',
          protocol: 'tcp',
          port: 443,
          allowedHosts: this.securityPolicy.allowedHosts
        });
      }
      
      // Apply resource limits
      await this.session.limitResources({
        cpuCores: this.securityPolicy.resourceLimits.cpuLimit,
        memoryMB: this.securityPolicy.resourceLimits.memoryMB,
        timeoutSec: this.securityPolicy.resourceLimits.timeoutSec
      });
      
      // Set up basic tools and utilities
      await this.setupEnvironment();
      
      // Log initialization
      await this.logOperation('initialize', true, 'Sandbox environment initialized');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logOperation('initialize', false, `Initialization failed: ${errorMessage}`);
      throw new Error(`Failed to initialize sandbox: ${errorMessage}`);
    }
  }

  /**
   * Execute a command in the sandbox
   * 
   * @param command The command to execute
   * @returns Execution result
   */
  async executeCommand(command: string): Promise<SandboxExecutionResult> {
    if (!this.session) {
      throw new Error('Sandbox not initialized. Call initialize() first.');
    }

    // Validate command against allowed list
    if (!this.isCommandAllowed(command)) {
      const errorMessage = `Command not allowed: ${command}`;
      await this.logOperation(command, false, errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }

    try {
      // Capture output streams
      let stdout = '';
      let stderr = '';

      // Execute the command
      const process = await this.session.process.start({
        cmd: command,
        onStdout: (data: string) => {
          stdout += data;
          // Stream to Supabase Realtime if needed
          this.streamToRealtimeChannel(data);
        },
        onStderr: (data: string) => {
          stderr += data;
          // Stream to Supabase Realtime if needed
          this.streamToRealtimeChannel(data, true);
        }
      });

      // Wait for the process to complete
      const exitCode = await process.wait();

      const result: SandboxExecutionResult = {
        success: exitCode === 0,
        output: stdout,
        error: stderr,
        exitCode
      };

      // Record the execution
      this.executionHistory.push({
        command,
        timestamp: new Date(),
        result
      });

      await this.logOperation(command, result.success, result.error || result.output || '');
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logOperation(command, false, errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Execute a browser automation task
   * 
   * @param action The browser action to perform
   * @param params Parameters for the action
   * @returns Execution result
   */
  async executeBrowserAction(action: string, params: any): Promise<SandboxExecutionResult> {
    if (!this.session) {
      throw new Error('Sandbox not initialized. Call initialize() first.');
    }

    try {
      // Initialize browser if not already done
      if (!this.session.browser) {
        await this.session.browser.launch();
      }

      let result;
      switch (action) {
        case 'navigate':
          result = await this.session.browser.goto(params.url);
          break;
        case 'click':
          result = await this.session.browser.click(params.selector);
          break;
        case 'type':
          result = await this.session.browser.type(params.selector, params.text);
          break;
        case 'extract':
          result = await this.session.browser.evaluate(params.script);
          break;
        default:
          throw new Error(`Unsupported browser action: ${action}`);
      }

      await this.logOperation(`browser.${action}`, true, JSON.stringify(result));
      return {
        success: true,
        output: JSON.stringify(result)
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logOperation(`browser.${action}`, false, errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Execute a file system operation
   * 
   * @param action The file system action to perform
   * @param params Parameters for the action
   * @returns Execution result
   */
  async executeFileOperation(action: string, params: any): Promise<SandboxExecutionResult> {
    if (!this.session) {
      throw new Error('Sandbox not initialized. Call initialize() first.');
    }

    try {
      let result;
      switch (action) {
        case 'write':
          result = await this.session.filesystem.write(params.path, params.content);
          break;
        case 'read':
          result = await this.session.filesystem.read(params.path);
          break;
        case 'list':
          result = await this.session.filesystem.list(params.path);
          break;
        case 'remove':
          result = await this.session.filesystem.remove(params.path);
          break;
        default:
          throw new Error(`Unsupported file operation: ${action}`);
      }

      await this.logOperation(`filesystem.${action}`, true, JSON.stringify(result));
      return {
        success: true,
        output: JSON.stringify(result)
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logOperation(`filesystem.${action}`, false, errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Clean up and close the sandbox
   */
  async cleanup(): Promise<void> {
    if (this.session) {
      try {
        await this.session.close();
        await this.logOperation('cleanup', true, 'Sandbox environment closed');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.logOperation('cleanup', false, `Cleanup failed: ${errorMessage}`);
      } finally {
        this.session = null;
        this.sessionId = null;
      }
    }
  }

  /**
   * Check if a command is allowed by the security policy
   * 
   * @param command The command to check
   * @returns Whether the command is allowed
   */
  private isCommandAllowed(command: string): boolean {
    // If no allowed commands specified, deny all
    if (!this.securityPolicy.allowedCommands || this.securityPolicy.allowedCommands.length === 0) {
      return false;
    }

    // Check if the command or its prefix is in the allowed list
    return this.securityPolicy.allowedCommands.some(allowed => {
      // Exact match
      if (allowed === command) return true;
      
      // Prefix match with wildcard (e.g., "git *")
      if (allowed.endsWith(' *') && command.startsWith(allowed.slice(0, -2))) return true;
      
      return false;
    });
  }

  /**
   * Set up the basic environment in the sandbox
   */
  private async setupEnvironment(): Promise<void> {
    // Install basic tools and utilities
    const setupCommands = [
      'mkdir -p /workspace/data',
      'mkdir -p /workspace/tools',
      'echo "Athenic Agent Sandbox" > /workspace/README.md'
    ];

    for (const cmd of setupCommands) {
      await this.executeCommand(cmd);
    }
  }

  /**
   * Log an operation to Supabase for audit purposes
   * 
   * @param operation The operation that was performed
   * @param success Whether the operation was successful
   * @param details Details about the operation
   */
  private async logOperation(operation: string, success: boolean, details: string): Promise<void> {
    try {
      await this.supabaseClient.from('objects').insert({
        related_object_type_id: 'agent_execution',
        owner_organisation_id: this.organizationId,
        metadata: {
          title: `Sandbox operation: ${operation}`,
          created_at: new Date().toISOString(),
          execution_id: this.sessionId,
          context: {
            operation,
            sessionId: this.sessionId
          },
          status: success ? 'success' : 'failed',
          details
        }
      });
    } catch (error: unknown) {
      console.error('Failed to log sandbox operation:', error);
    }
  }

  /**
   * Stream data to a Supabase Realtime channel
   * 
   * @param data The data to stream
   * @param isError Whether the data is an error
   */
  private streamToRealtimeChannel(data: string, isError: boolean = false): void {
    // Implementation would depend on Supabase Realtime configuration
    // This is a placeholder for now
    console.log(`[${isError ? 'ERROR' : 'OUTPUT'}] ${data}`);
  }

  /**
   * Get the execution history
   * 
   * @returns Array of execution history entries
   */
  getExecutionHistory(): Array<{
    command: string;
    timestamp: Date;
    result: SandboxExecutionResult;
  }> {
    return [...this.executionHistory];
  }
} 