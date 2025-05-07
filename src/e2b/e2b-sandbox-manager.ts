/**
 * E2B Sandbox Resource Manager
 * 
 * This utility provides global tracking and management of E2B sandboxes,
 * including automatic cleanup of idle resources.
 */

import { Sandbox } from '@e2b/code-interpreter';
import { Logger, LogLevel } from '../utils/logger.js';
import path from 'path';

// Type definition for a tracked sandbox
interface TrackedSandbox {
  sandboxId: string;
  instance: any; // E2B sandbox instance
  lastUsed: Date;
  purpose: string;
  status: 'running' | 'stopped' | 'error';
  keepAliveInterval?: NodeJS.Timeout;
}

// Configuration for the sandbox manager
interface SandboxManagerConfig {
  // Maximum idle time before cleanup (default 30 minutes)
  maxIdleTimeMs?: number;
  // Cleanup interval (default 5 minutes)
  cleanupIntervalMs?: number;
  // Default timeout for sandboxes (default 30 minutes)
  defaultTimeoutMs?: number;
  // Whether to automatically start the cleanup interval (default true)
  autoStartCleanup?: boolean;
  // Minimum log level (default DEBUG)
  logLevel?: LogLevel;
}

// Default configuration values
const DEFAULT_MAX_IDLE_TIME_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_SANDBOX_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Singleton manager for E2B sandboxes.
 * Tracks all active sandboxes and periodically cleans up idle resources.
 */
export class E2BSandboxManager {
  private static instance: E2BSandboxManager;
  private sandboxes: Map<string, TrackedSandbox> = new Map();
  private cleanupInterval?: NodeJS.Timeout;
  private maxIdleTimeMs: number;
  private cleanupIntervalMs: number;
  private defaultTimeoutMs: number;
  private logger: Logger;

  /**
   * Private constructor for singleton pattern.
   * Use getInstance() to get the manager instance.
   */
  private constructor(config: SandboxManagerConfig = {}) {
    this.maxIdleTimeMs = config.maxIdleTimeMs ?? DEFAULT_MAX_IDLE_TIME_MS;
    this.cleanupIntervalMs = config.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS;
    
    // Create a logger using the proper getLogger method
    this.logger = Logger.getLogger({
      component: 'E2BSandboxManager',
      minLevel: config.logLevel || LogLevel.DEBUG,
      logFile: path.join(process.cwd(), 'logs', 'e2b-sandbox-manager.log')
    });
    
    if (config.autoStartCleanup !== false) {
      this.startCleanupInterval();
    }
    
    // Ensure cleanup on process exit
    process.on('exit', () => {
      this.cleanupAllSandboxes();
    });
    
    // Handle termination signals
    process.on('SIGINT', () => {
      this.logger.info('Received SIGINT, cleaning up sandboxes before exit');
      this.cleanupAllSandboxes()
        .catch(err => this.logger.error('Error during cleanup', err))
        .finally(() => process.exit(0));
    });
    
    process.on('SIGTERM', () => {
      this.logger.info('Received SIGTERM, cleaning up sandboxes before exit');
      this.cleanupAllSandboxes()
        .catch(err => this.logger.error('Error during cleanup', err))
        .finally(() => process.exit(0));
    });
  }

  /**
   * Get the singleton instance of the sandbox manager.
   */
  public static getInstance(config?: SandboxManagerConfig): E2BSandboxManager {
    if (!E2BSandboxManager.instance) {
      E2BSandboxManager.instance = new E2BSandboxManager(config);
    }
    return E2BSandboxManager.instance;
  }

  /**
   * Track a new sandbox in the manager.
   * 
   * @param sandboxId The sandbox ID
   * @param instance The sandbox instance
   * @param purpose Description of what the sandbox is used for
   * @returns The tracked sandbox
   */
  public trackSandbox(sandboxId: string, instance: any, purpose: string): TrackedSandbox {
    const trackedSandbox: TrackedSandbox = {
      sandboxId,
      instance,
      lastUsed: new Date(),
      purpose,
      status: 'running'
    };
    
    this.sandboxes.set(sandboxId, trackedSandbox);
    this.logger.debug(`Tracking new sandbox ${sandboxId} for ${purpose}`);
    
    return trackedSandbox;
  }

  /**
   * Create and track a new E2B sandbox.
   * 
   * @param apiKey E2B API key
   * @param purpose Description of what the sandbox is used for
   * @param timeoutMs Optional timeout in milliseconds
   * @returns The sandbox instance and ID
   */
  public async createSandbox(
    apiKey: string,
    purpose: string,
    timeoutMs: number = this.defaultTimeoutMs
  ): Promise<{ sandbox: any; sandboxId: string }> {
    try {
      this.logger.debug(`Creating new sandbox for ${purpose}`);
      
      const sandbox = await Sandbox.create({
        apiKey,
        timeoutMs
      });
      
      const sandboxId = sandbox.sandboxId;
      
      this.trackSandbox(sandboxId, sandbox, purpose);
      
      return { sandbox, sandboxId };
    } catch (error) {
      this.logger.error(`Failed to create sandbox for ${purpose}`, error);
      throw error;
    }
  }

  /**
   * Update the last used timestamp for a sandbox.
   * Call this whenever a sandbox is used to prevent premature cleanup.
   * 
   * @param sandboxId The sandbox ID
   */
  public updateLastUsed(sandboxId: string): void {
    const trackedSandbox = this.sandboxes.get(sandboxId);
    if (trackedSandbox) {
      trackedSandbox.lastUsed = new Date();
      this.logger.debug(`Updated last used timestamp for sandbox ${sandboxId}`);
    }
  }

  /**
   * Check if a sandbox is available and running.
   * 
   * @param sandboxId The sandbox ID
   * @returns True if the sandbox is available and running
   */
  public async isSandboxRunning(sandboxId: string): Promise<boolean> {
    const trackedSandbox = this.sandboxes.get(sandboxId);
    if (!trackedSandbox) {
      return false;
    }
    
    try {
      const isRunning = await trackedSandbox.instance.isRunning();
      
      // Update status if it changed
      if (!isRunning && trackedSandbox.status === 'running') {
        trackedSandbox.status = 'stopped';
      }
      
      return isRunning;
    } catch (error) {
      this.logger.error(`Error checking if sandbox ${sandboxId} is running`, error);
      trackedSandbox.status = 'error';
      return false;
    }
  }

  /**
   * Get a tracked sandbox by ID.
   * 
   * @param sandboxId The sandbox ID
   * @returns The tracked sandbox or undefined if not found
   */
  public getSandbox(sandboxId: string): TrackedSandbox | undefined {
    return this.sandboxes.get(sandboxId);
  }

  /**
   * Release a sandbox when it's no longer needed.
   * This will kill the sandbox and remove it from tracking.
   * 
   * @param sandboxId The sandbox ID
   */
  public async releaseSandbox(sandboxId: string): Promise<void> {
    const trackedSandbox = this.sandboxes.get(sandboxId);
    if (!trackedSandbox) {
      this.logger.debug(`Sandbox ${sandboxId} not found for release`);
      return;
    }
    
    try {
      this.logger.debug(`Releasing sandbox ${sandboxId}`);
      
      // Clear any keep-alive interval
      if (trackedSandbox.keepAliveInterval) {
        clearInterval(trackedSandbox.keepAliveInterval);
      }
      
      // Kill the sandbox
      await trackedSandbox.instance.kill();
      
      // Remove from tracking
      this.sandboxes.delete(sandboxId);
      
      this.logger.debug(`Successfully released sandbox ${sandboxId}`);
    } catch (error) {
      this.logger.error(`Error releasing sandbox ${sandboxId}`, error);
      
      // Remove from tracking even if there was an error
      this.sandboxes.delete(sandboxId);
    }
  }

  /**
   * Setup a keep-alive interval for a sandbox.
   * This will periodically extend the sandbox timeout to keep it alive.
   * 
   * @param sandboxId The sandbox ID
   * @param intervalMs The interval in milliseconds
   * @param timeoutMs The timeout to set in milliseconds
   */
  public setupKeepAlive(
    sandboxId: string,
    intervalMs: number = 4 * 60 * 1000, // 4 minutes
    timeoutMs: number = this.defaultTimeoutMs
  ): void {
    const trackedSandbox = this.sandboxes.get(sandboxId);
    if (!trackedSandbox) {
      this.logger.warn(`Cannot setup keep-alive for unknown sandbox ${sandboxId}`);
      return;
    }
    
    // Clear any existing interval
    if (trackedSandbox.keepAliveInterval) {
      clearInterval(trackedSandbox.keepAliveInterval);
    }
    
    // Setup new interval
    trackedSandbox.keepAliveInterval = setInterval(async () => {
      try {
        const isRunning = await this.isSandboxRunning(sandboxId);
        if (!isRunning) {
          this.logger.warn(`Sandbox ${sandboxId} is no longer running, clearing keep-alive`);
          if (trackedSandbox.keepAliveInterval) {
            clearInterval(trackedSandbox.keepAliveInterval);
            trackedSandbox.keepAliveInterval = undefined;
          }
          return;
        }
        
        await trackedSandbox.instance.setTimeout(timeoutMs);
        this.updateLastUsed(sandboxId);
        this.logger.debug(`Extended timeout for sandbox ${sandboxId}`);
      } catch (error) {
        this.logger.error(`Failed to extend timeout for sandbox ${sandboxId}`, error);
      }
    }, intervalMs);
    
    this.logger.debug(`Setup keep-alive for sandbox ${sandboxId} at ${intervalMs}ms intervals`);
  }

  /**
   * Start the cleanup interval to periodically check for idle sandboxes.
   */
  public startCleanupInterval(): void {
    if (this.cleanupInterval) {
      this.logger.debug('Cleanup interval already running');
      return;
    }
    
    this.logger.info(
      `Starting cleanup interval (${this.cleanupIntervalMs}ms) ` +
      `with max idle time of ${this.maxIdleTimeMs}ms`
    );
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSandboxes()
        .catch(err => this.logger.error('Error during idle sandbox cleanup', err));
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop the cleanup interval.
   */
  public stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      this.logger.debug('Stopped cleanup interval');
    }
  }

  /**
   * Cleanup idle sandboxes that haven't been used for a while.
   */
  public async cleanupIdleSandboxes(): Promise<void> {
    const now = new Date();
    const idsToCleanup: string[] = [];
    
    // Find idle sandboxes
    for (const [id, sandbox] of this.sandboxes.entries()) {
      const idleTime = now.getTime() - sandbox.lastUsed.getTime();
      
      if (idleTime > this.maxIdleTimeMs) {
        idsToCleanup.push(id);
      }
    }
    
    if (idsToCleanup.length === 0) {
      return;
    }
    
    this.logger.info(`Cleaning up ${idsToCleanup.length} idle sandboxes`);
    
    // Release each idle sandbox
    const cleanupPromises = idsToCleanup.map(id => 
      this.releaseSandbox(id)
        .catch(err => this.logger.error(`Error releasing sandbox ${id}`, err))
    );
    
    await Promise.allSettled(cleanupPromises);
  }

  /**
   * Cleanup all sandboxes, regardless of idle time.
   * Useful during shutdown or for periodic full cleanup.
   */
  public async cleanupAllSandboxes(): Promise<void> {
    const idsToCleanup = Array.from(this.sandboxes.keys());
    
    if (idsToCleanup.length === 0) {
      return;
    }
    
    this.logger.info(`Cleaning up all ${idsToCleanup.length} sandboxes`);
    
    // Stop cleanup interval if running
    this.stopCleanupInterval();
    
    // Release each sandbox
    const cleanupPromises = idsToCleanup.map(id => 
      this.releaseSandbox(id)
        .catch(err => this.logger.error(`Error releasing sandbox ${id}`, err))
    );
    
    await Promise.allSettled(cleanupPromises);
  }

  /**
   * Get statistics about the currently tracked sandboxes.
   */
  public getStats(): {
    totalSandboxes: number;
    running: number;
    stopped: number;
    error: number;
    byPurpose: Record<string, number>;
  } {
    let running = 0;
    let stopped = 0;
    let error = 0;
    const byPurpose: Record<string, number> = {};
    
    for (const sandbox of this.sandboxes.values()) {
      // Count by status
      if (sandbox.status === 'running') running++;
      else if (sandbox.status === 'stopped') stopped++;
      else if (sandbox.status === 'error') error++;
      
      // Count by purpose
      const purpose = sandbox.purpose || 'unknown';
      byPurpose[purpose] = (byPurpose[purpose] || 0) + 1;
    }
    
    return {
      totalSandboxes: this.sandboxes.size,
      running,
      stopped,
      error,
      byPurpose,
    };
  }
} 