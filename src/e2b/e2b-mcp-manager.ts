/**
 * E2B MCP Manager
 * 
 * This service handles interactions with E2B to run MCP servers in sandboxes.
 * It provides methods to deploy, manage, and stop MCP servers.
 */

import { Sandbox } from '@e2b/code-interpreter';
import { AxiosError } from 'axios';
import { decryptCredential, encryptCredential } from '../utils/credentials.js';

// Define a simple logger interface to avoid dependencies
interface ILogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  error(message: string, error?: unknown): void;
}

// Basic logger implementation
class DefaultLogger implements ILogger {
  private prefix: string;
  
  constructor(prefix: string) {
    this.prefix = prefix;
  }
  
  debug(message: string, ...args: any[]): void {
    console.debug(`[${this.prefix}] ${message}`, ...args);
  }
  
  info(message: string, ...args: any[]): void {
    console.info(`[${this.prefix}] ${message}`, ...args);
  }
  
  error(message: string, error?: unknown): void {
    console.error(`[${this.prefix}] ${message}`, error || '');
  }
}

// Define error types
export class E2BMcpConnectionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'E2BMcpConnectionError';
  }
}

export class E2BMcpCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'E2BMcpCredentialError';
  }
}

export class E2BMcpTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'E2BMcpTimeoutError';
  }
}

// MCP Server Status enum
export enum McpServerStatus {
  STARTING = 'mcpStarting',
  RUNNING = 'mcpRunning',
  STOPPED = 'mcpStopped',
  ERROR = 'mcpError',
}

// Connection configuration type
export type McpServerConfig = {
  command: string;
  envVars?: Record<string, string>;
};

// Define a type for the E2B sandbox
interface E2BSandbox {
  sandboxId: string;
  network: {
    startProxy(options: { port: number; hostname: string; protocol: string }): Promise<string>;
  };
  process: {
    startAndWait(options: { cmd: string; env?: Record<string, string> }): Promise<any>;
    start(options: { cmd: string; env?: Record<string, string>; onStdout?: (data: string) => void; onStderr?: (data: string) => void }): Promise<any>;
  };
  setTimeout(timeoutMs: number): Promise<void>;
  kill(): Promise<void>;
  isRunning(): Promise<boolean>;
}

// Default timeout settings
const DEFAULT_STARTUP_TIMEOUT_MS = 60000; // 1 minute
const DEFAULT_OPERATION_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_SANDBOX_TIMEOUT_MS = 300000; // 5 minutes (initial timeout)
const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 240000; // 4 minutes (keep alive interval)
const MAX_SANDBOX_TIMEOUT_MS = 3600000; // 1 hour (maximum timeout)
const MCP_SERVER_PORT = 3000; // Default port for MCP servers

// Active sandboxes record - used for global resource tracking
const activeSandboxes = new Map<string, { 
  sandbox: E2BSandbox;
  keepAliveInterval?: NodeJS.Timeout;
  lastUsed: Date;
}>();

/**
 * Manager for E2B-hosted MCP servers.
 * Handles creating, managing, and cleaning up MCP server sandboxes.
 */
export class E2BMcpManager {
  private sandbox?: E2BSandbox;
  private sandboxId?: string;
  private keepAliveInterval?: NodeJS.Timeout;
  private serverUrl?: string;
  private status: McpServerStatus = McpServerStatus.STOPPED;
  private logger: ILogger;
  private apiKey: string;

  /**
   * Creates a new E2BMcpManager.
   * 
   * @param apiKey E2B API key (will be decrypted if encrypted)
   * @param logger Optional logger instance
   */
  constructor(apiKey: string, logger?: ILogger) {
    this.logger = logger || new DefaultLogger('E2BMcpManager');
    
    try {
      // Check if the API key is encrypted and decrypt if needed
      this.apiKey = this.processApiKey(apiKey);
    } catch (error) {
      throw new E2BMcpCredentialError('Failed to initialize E2B client with the provided API key');
    }
  }

  /**
   * Process the API key - decrypt if needed
   */
  private processApiKey(apiKey: string): string {
    if (apiKey.startsWith('enc:')) {
      try {
        return decryptCredential(apiKey);
      } catch (error) {
        this.logger.error('Failed to decrypt E2B API key', error);
        throw new E2BMcpCredentialError('Invalid encrypted E2B API key');
      }
    }
    return apiKey;
  }

  /**
   * Create a new MCP server in an E2B sandbox
   * 
   * @param config MCP server configuration
   * @param startupTimeoutMs Timeout for server startup in milliseconds
   * @returns The MCP server URL
   */
  async createMcpServer(
    config: McpServerConfig,
    startupTimeoutMs: number = DEFAULT_STARTUP_TIMEOUT_MS
  ): Promise<string> {
    try {
      this.status = McpServerStatus.STARTING;
      
      // Process environment variables - decrypt any encrypted credentials
      const processedEnvVars = this.processEnvironmentVariables(config.envVars || {});
      
      // Start the sandbox with a secure timeout
      this.sandbox = await Sandbox.create({
        apiKey: this.apiKey,
        timeoutMs: DEFAULT_SANDBOX_TIMEOUT_MS,
      }) as unknown as E2BSandbox;
      
      this.sandboxId = this.sandbox.sandboxId;
      
      // Register sandbox for tracking and cleanup
      this.trackSandbox();
      
      // Handle startup timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new E2BMcpTimeoutError(`MCP server startup timed out after ${startupTimeoutMs}ms`));
        }, startupTimeoutMs);
      });
      
      // Install supergateway (used to convert stdio-based MCP servers to HTTP/SSE)
      await this.sandbox.process.startAndWait({
        cmd: 'npm install -g supergateway',
      });
      
      // Set up port forwarding for the MCP server
      this.serverUrl = await this.sandbox.network.startProxy({
        port: MCP_SERVER_PORT,
        hostname: '0.0.0.0', // Listen on all interfaces inside the sandbox
        protocol: 'http',
      });
      
      // Add extra environment variables for the MCP server
      const envVars = {
        ...processedEnvVars,
        // Use the supergateway to make MCP servers accessible via SSE
        MCP_SUPERGATEWAY: 'true',
        // Make the server listen on all interfaces (0.0.0.0) inside the sandbox
        MCP_HOST: '0.0.0.0',
        MCP_PORT: MCP_SERVER_PORT.toString(),
      };
      
      // Format environment variables for the command
      const envVarsString = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      
      // Start the MCP server with the environment variables
      const startPromise = this.sandbox.process.start({
        cmd: `${envVarsString} ${config.command}`,
        onStdout: (data: string) => {
          this.logger.debug(`MCP server stdout: ${data}`);
        },
        onStderr: (data: string) => {
          this.logger.debug(`MCP server stderr: ${data}`);
        },
      });
      
      // Race the startup process against the timeout
      await Promise.race([startPromise, timeoutPromise]);
      
      // Check if server is responsive
      await this.waitForServerReady(startupTimeoutMs);
      
      // Start the keepalive interval to extend sandbox timeout periodically
      this.setupKeepAlive();
      
      this.status = McpServerStatus.RUNNING;
      
      return this.serverUrl;
    } catch (error: unknown) {
      this.status = McpServerStatus.ERROR;
      
      // Cleanup on error
      await this.cleanupSandbox();
      
      if (error instanceof E2BMcpTimeoutError) {
        throw error;
      }
      
      throw new E2BMcpConnectionError(
        'Failed to create MCP server in E2B sandbox',
        error
      );
    }
  }

  /**
   * Process environment variables, decrypting any encrypted values
   */
  private processEnvironmentVariables(envVars: Record<string, string>): Record<string, string> {
    const processedVars: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(envVars)) {
      try {
        // Decrypt if the value is encrypted
        if (value.startsWith('enc:')) {
          processedVars[key] = decryptCredential(value);
        } else {
          processedVars[key] = value;
        }
      } catch (error) {
        this.logger.error(`Failed to decrypt environment variable: ${key}`, error);
        throw new E2BMcpCredentialError(`Invalid encrypted value for environment variable: ${key}`);
      }
    }
    
    return processedVars;
  }

  /**
   * Wait for the server to be ready by polling the health endpoint
   */
  private async waitForServerReady(timeoutMs: number): Promise<void> {
    if (!this.serverUrl) {
      throw new E2BMcpConnectionError('Server URL not available');
    }
    
    const startTime = Date.now();
    const maxAttempts = 5;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (Date.now() - startTime > timeoutMs) {
        throw new E2BMcpTimeoutError('Timeout waiting for MCP server to be ready');
      }
      
      try {
        // Make a request to the server health endpoint
        const response = await fetch(this.serverUrl);
        
        if (response.status === 200) {
          this.logger.debug(`MCP server ready after ${attempt + 1} attempts`);
          return;
        }
        
        this.logger.debug(`Server not ready (attempt ${attempt + 1}), status: ${response.status}`);
      } catch (error) {
        this.logger.debug(`Server connection failed (attempt ${attempt + 1})`);
      }
      
      // Wait 5 seconds between attempts
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new E2BMcpConnectionError('MCP server is not responding after maximum attempts');
  }

  /**
   * Track sandbox for resource management
   */
  private trackSandbox(): void {
    if (!this.sandbox || !this.sandboxId) return;
    
    // Store the sandbox for global tracking
    activeSandboxes.set(this.sandboxId, {
      sandbox: this.sandbox,
      lastUsed: new Date()
    });
  }

  /**
   * Setup keep-alive interval to extend sandbox timeout
   */
  private setupKeepAlive(): void {
    // Clear any existing interval
    this.clearKeepAliveInterval();
    
    // Setup new interval
    this.keepAliveInterval = setInterval(async () => {
      try {
        await this.extendTimeout();
      } catch (error) {
        this.logger.error('Failed to extend sandbox timeout', error);
      }
    }, DEFAULT_KEEP_ALIVE_INTERVAL_MS);
    
    // Update in global tracking
    if (this.sandboxId) {
      const tracked = activeSandboxes.get(this.sandboxId);
      if (tracked) {
        tracked.keepAliveInterval = this.keepAliveInterval;
        activeSandboxes.set(this.sandboxId, tracked);
      }
    }
  }

  /**
   * Clear the keep-alive interval
   */
  private clearKeepAliveInterval(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = undefined;
    }
  }

  /**
   * Get the current status of the MCP server
   * 
   * @returns The current status
   */
  getStatus(): McpServerStatus {
    return this.status;
  }

  /**
   * Get the MCP server URL
   * 
   * @returns The server URL
   */
  getServerUrl(): string | undefined {
    return this.serverUrl;
  }

  /**
   * Get the sandbox ID
   * 
   * @returns The sandbox ID
   */
  getSandboxId(): string | undefined {
    return this.sandboxId;
  }

  /**
   * Extend the sandbox timeout
   * 
   * @param timeoutMs New timeout in milliseconds
   */
  async extendTimeout(timeoutMs: number = DEFAULT_SANDBOX_TIMEOUT_MS): Promise<void> {
    try {
      if (!this.sandbox) {
        throw new E2BMcpConnectionError('Sandbox not initialized');
      }
      
      // Check if sandbox is still running
      const isRunning = await this.sandbox.isRunning();
      if (!isRunning) {
        this.status = McpServerStatus.STOPPED;
        throw new E2BMcpConnectionError('Sandbox is not running');
      }
      
      // Enforce maximum timeout
      const actualTimeout = Math.min(timeoutMs, MAX_SANDBOX_TIMEOUT_MS);
      
      // Extend the timeout
      await this.sandbox.setTimeout(actualTimeout);
      
      // Update last used timestamp
      if (this.sandboxId) {
        const tracked = activeSandboxes.get(this.sandboxId);
        if (tracked) {
          tracked.lastUsed = new Date();
          activeSandboxes.set(this.sandboxId, tracked);
        }
      }
      
      this.logger.debug(`Extended sandbox timeout to ${actualTimeout}ms`);
    } catch (error: unknown) {
      if (error instanceof E2BMcpConnectionError) {
        throw error;
      }
      
      throw new E2BMcpConnectionError('Failed to extend sandbox timeout', error);
    }
  }

  /**
   * Check if the MCP server is still running
   * 
   * @returns True if the server is running
   */
  async isRunning(): Promise<boolean> {
    try {
      if (!this.sandbox) {
        return false;
      }
      
      const isRunning = await this.sandbox.isRunning();
      
      // Update status if needed
      if (!isRunning && this.status === McpServerStatus.RUNNING) {
        this.status = McpServerStatus.STOPPED;
      }
      
      return isRunning;
    } catch (error) {
      this.logger.error('Error checking if sandbox is running', error);
      return false;
    }
  }

  /**
   * Shutdown the MCP server and cleanup resources
   */
  async shutdown(timeoutMs: number = DEFAULT_OPERATION_TIMEOUT_MS): Promise<void> {
    try {
      await Promise.race([
        this.cleanupSandbox(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new E2BMcpTimeoutError(`Shutdown timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof E2BMcpTimeoutError) {
        this.logger.error('Shutdown timed out, forcing cleanup', error);
      } else {
        this.logger.error('Error during shutdown', error);
      }
      
      // Force cleanup even on error
      await this.forceCleanup();
    } finally {
      this.status = McpServerStatus.STOPPED;
    }
  }

  /**
   * Clean up the sandbox gracefully
   */
  private async cleanupSandbox(): Promise<void> {
    // Clear the keep-alive interval
    this.clearKeepAliveInterval();
    
    if (this.sandbox) {
      try {
        // Try to kill the sandbox gracefully
        await this.sandbox.kill();
      } catch (error) {
        this.logger.error('Error closing sandbox gracefully', error);
        throw error;
      } finally {
        // Remove from global tracking
        if (this.sandboxId) {
          activeSandboxes.delete(this.sandboxId);
        }
        
        // Clean up instance properties
        this.sandbox = undefined;
        this.serverUrl = undefined;
        this.sandboxId = undefined;
      }
    }
  }

  /**
   * Force cleanup - to be used when graceful cleanup fails
   */
  private async forceCleanup(): Promise<void> {
    this.clearKeepAliveInterval();
    
    if (this.sandboxId) {
      activeSandboxes.delete(this.sandboxId);
    }
    
    this.sandbox = undefined;
    this.serverUrl = undefined;
    this.sandboxId = undefined;
  }

  /**
   * Utility method to encrypt an API key or credential
   * 
   * @param value The value to encrypt
   * @returns The encrypted value
   */
  static encryptCredential(value: string): string {
    return encryptCredential(value);
  }

  /**
   * Close idle sandboxes across all instances
   * Safe to call periodically to clean up resources
   * 
   * @param maxIdleTimeMs Maximum idle time in milliseconds before cleanup
   */
  static async closeIdleSandboxes(maxIdleTimeMs: number = 1800000): Promise<void> {
    const now = new Date();
    const logger = new DefaultLogger('E2BMcpManager');
    
    for (const [id, tracked] of activeSandboxes.entries()) {
      const idleTime = now.getTime() - tracked.lastUsed.getTime();
      
      if (idleTime > maxIdleTimeMs) {
        logger.info(`Closing idle sandbox ${id} (idle for ${Math.round(idleTime / 1000)}s)`);
        
        try {
          // Clear any keep-alive interval
          if (tracked.keepAliveInterval) {
            clearInterval(tracked.keepAliveInterval);
          }
          
          // Close the sandbox
          await tracked.sandbox.kill();
        } catch (error) {
          logger.error(`Error closing idle sandbox ${id}`, error);
        } finally {
          // Remove from tracking regardless of success
          activeSandboxes.delete(id);
        }
      }
    }
  }

  /**
   * Get the number of currently active sandboxes
   */
  static getActiveSandboxCount(): number {
    return activeSandboxes.size;
  }
} 