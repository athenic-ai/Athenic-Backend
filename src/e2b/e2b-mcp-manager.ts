/**
 * E2B MCP Manager
 * 
 * This service handles interactions with E2B to run MCP servers in sandboxes.
 * It provides methods to deploy, manage, and stop MCP servers.
 */

import { Sandbox } from '@e2b/code-interpreter';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get E2B API key from environment
const E2B_API_KEY = process.env.E2B_API_KEY;

if (!E2B_API_KEY) {
  console.error('E2B_API_KEY environment variable is not set.');
}

// Track active MCP sandboxes for cleanup and management
const activeMcpSandboxes = new Map<string, Sandbox>();

// Define custom Sandbox type that includes the properties we're using
interface ExtendedSandbox extends Sandbox {
  network: {
    startProxy(options: { port: number; hostname: string; protocol: string }): Promise<string>;
  };
  process: {
    startAndWait(options: { cmd: string }): Promise<any>;
    start(options: { 
      cmd: string; 
      onStdout?: (data: string) => void; 
      onStderr?: (data: string) => void;
    }): Promise<any>;
  };
  setTimeout(timeoutMs: number): Promise<void>;
  isRunning(): Promise<boolean>;
}

// Extend the Sandbox type to include the static reconnect method
interface SandboxStatic {
  create(options: any): Promise<ExtendedSandbox>;
  reconnect(sandboxId: string, options: { apiKey: string }): Promise<ExtendedSandbox>;
}

// Cast the Sandbox class to our extended type
const ExtendedSandbox = Sandbox as unknown as SandboxStatic;

/**
 * Wait for the MCP server to become ready by polling the URL
 */
async function waitForMcpServerReady(serverUrl: string, maxAttempts = 10, intervalMs = 2000): Promise<boolean> {
  console.log(`Waiting for MCP server at ${serverUrl} to become ready...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(serverUrl);
      
      // Check if the server is responding properly
      if (response.status === 200) {
        console.log(`MCP server at ${serverUrl} is ready (attempt ${attempt})`);
        return true;
      }
      
      console.log(`MCP server not ready yet (attempt ${attempt}), status: ${response.status}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`Connection to MCP server failed (attempt ${attempt}): ${errorMessage}`);
    }
    
    // Wait before the next attempt
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  console.error(`MCP server failed to become ready after ${maxAttempts} attempts`);
  return false;
}

/**
 * Deploy a new MCP server in an E2B sandbox
 * 
 * @param mcpServerObject The MCP server configuration object from the database
 * @param userProvidedEnvs Environment variables provided by the user (e.g., API keys)
 * @param accountId The account ID this server is associated with
 * @returns Information about the deployed server
 */
export async function deployMcpServer(
  mcpServerObject: any,
  userProvidedEnvs: Record<string, string>,
  accountId: string
): Promise<{ sandboxId: string; serverUrl: string; sandbox: ExtendedSandbox }> {
  try {
    if (!E2B_API_KEY) {
      throw new Error('E2B API key is not set - set the E2B_API_KEY environment variable');
    }
    
    console.log(`Deploying MCP server "${mcpServerObject.metadata.title}" for account ${accountId}`);
    
    // Create an E2B sandbox
    const sandbox = await ExtendedSandbox.create({
      apiKey: E2B_API_KEY,
      // Use default timeout from the MCP server object, or default to 30 minutes
      timeoutMs: mcpServerObject.metadata.default_timeout || 30 * 60 * 1000,
    });
    
    const sandboxId = sandbox.sandboxId;
    console.log(`Created E2B sandbox with ID: ${sandboxId}`);
    
    // Store the sandbox for future reference
    activeMcpSandboxes.set(sandboxId, sandbox);
    
    // Extract the start command from the MCP server object
    const startCommand = mcpServerObject.metadata.start_command;
    if (!startCommand) {
      throw new Error('MCP server object is missing the start_command in metadata');
    }
    
    // Set up port forwarding for the MCP server
    // MCP servers typically listen on port 3000 by default
    const port = 3000;
    const serverUrl = await sandbox.network.startProxy({
      port: port,
      hostname: '0.0.0.0', // Listen on all interfaces inside the sandbox
      protocol: 'http',
    });
    
    console.log(`MCP server URL: ${serverUrl}`);
    
    // Execute the command to start the MCP server in the sandbox
    // First, let's install supergateway (used to convert stdio-based MCP servers to HTTP/SSE)
    await sandbox.process.startAndWait({
      cmd: 'npm install -g supergateway',
    });
    
    // Add an environment variable to direct the MCP server to use supergateway
    const envVars = {
      ...userProvidedEnvs,
      // Use the supergateway to make MCP servers accessible via SSE
      MCP_SUPERGATEWAY: 'true',
      // Make the server listen on all interfaces (0.0.0.0) inside the sandbox
      MCP_HOST: '0.0.0.0',
      MCP_PORT: port.toString(),
    };
    
    // Format environment variables for the command
    const envVarsString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    
    // Start the MCP server with the environment variables
    const process = await sandbox.process.start({
      cmd: `${envVarsString} ${startCommand}`,
      onStdout: (data: string) => console.log(`[MCP Server Stdout]: ${data}`),
      onStderr: (data: string) => console.error(`[MCP Server Stderr]: ${data}`),
    });
    
    // Wait for the MCP server to become ready
    const isReady = await waitForMcpServerReady(serverUrl);
    if (!isReady) {
      // If the server doesn't become ready, we should clean up
      await sandbox.kill();
      activeMcpSandboxes.delete(sandboxId);
      throw new Error('MCP server failed to start properly');
    }
    
    console.log(`MCP server "${mcpServerObject.metadata.title || 'Unnamed'}" deployed successfully`);
    
    return {
      sandboxId,
      serverUrl,
      sandbox,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error deploying MCP server:', error);
    throw new Error(`Failed to deploy MCP server: ${errorMessage}`);
  }
}

/**
 * Get the status of an MCP server
 * 
 * @param sandboxId The ID of the E2B sandbox running the MCP server
 * @returns The status of the MCP server
 */
export async function getMcpServerStatus(
  sandboxId: string
): Promise<'mcpRunning' | 'mcpStopped' | 'mcpError'> {
  try {
    const sandbox = activeMcpSandboxes.get(sandboxId) as ExtendedSandbox | undefined;
    
    if (!sandbox) {
      // If we can't find the sandbox in our map, check if it exists in E2B
      try {
        // Try to reconnect to the sandbox
        const reconnectedSandbox = await ExtendedSandbox.reconnect(sandboxId, { apiKey: E2B_API_KEY || '' });
        activeMcpSandboxes.set(sandboxId, reconnectedSandbox);
        
        // Check if it's still running
        const isRunning = await reconnectedSandbox.isRunning();
        return isRunning ? 'mcpRunning' : 'mcpStopped';
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error reconnecting to sandbox ${sandboxId}:`, errorMessage);
        return 'mcpError';
      }
    }
    
    // Check if the sandbox is running
    const isRunning = await sandbox.isRunning();
    return isRunning ? 'mcpRunning' : 'mcpStopped';
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error checking status of MCP server in sandbox ${sandboxId}:`, errorMessage);
    return 'mcpError';
  }
}

/**
 * Stop an MCP server and kill its sandbox
 * 
 * @param sandboxId The ID of the E2B sandbox running the MCP server
 */
export async function stopMcpServer(sandboxId: string): Promise<void> {
  try {
    const sandbox = activeMcpSandboxes.get(sandboxId) as ExtendedSandbox | undefined;
    
    if (!sandbox) {
      // If we can't find the sandbox in our map, check if it exists in E2B
      try {
        // Try to reconnect to the sandbox and then kill it
        const reconnectedSandbox = await ExtendedSandbox.reconnect(sandboxId, { apiKey: E2B_API_KEY || '' });
        await reconnectedSandbox.kill();
        console.log(`Killed reconnected sandbox ${sandboxId}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error reconnecting to sandbox ${sandboxId} for cleanup:`, errorMessage);
        // Not much we can do if we can't reconnect
      }
      return;
    }
    
    // Kill the sandbox
    await sandbox.kill();
    console.log(`Killed sandbox ${sandboxId}`);
    
    // Remove from our active sandboxes map
    activeMcpSandboxes.delete(sandboxId);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error stopping MCP server in sandbox ${sandboxId}:`, errorMessage);
    throw new Error(`Failed to stop MCP server: ${errorMessage}`);
  }
}

/**
 * Extend the timeout for an MCP server's sandbox
 * 
 * @param sandboxId The ID of the E2B sandbox running the MCP server
 * @param timeoutMs New timeout in milliseconds
 */
export async function extendMcpServerTimeout(sandboxId: string, timeoutMs: number): Promise<void> {
  try {
    const sandbox = activeMcpSandboxes.get(sandboxId) as ExtendedSandbox | undefined;
    
    if (!sandbox) {
      // If we can't find the sandbox in our map, check if it exists in E2B
      try {
        // Try to reconnect to the sandbox
        const reconnectedSandbox = await ExtendedSandbox.reconnect(sandboxId, { apiKey: E2B_API_KEY || '' });
        activeMcpSandboxes.set(sandboxId, reconnectedSandbox);
        
        // Extend the timeout
        await reconnectedSandbox.setTimeout(timeoutMs);
        console.log(`Extended timeout for reconnected sandbox ${sandboxId} to ${timeoutMs}ms`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error reconnecting to sandbox ${sandboxId} for timeout extension:`, errorMessage);
        throw new Error(`Could not extend timeout: ${errorMessage}`);
      }
      return;
    }
    
    // Extend the timeout
    await sandbox.setTimeout(timeoutMs);
    console.log(`Extended timeout for sandbox ${sandboxId} to ${timeoutMs}ms`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error extending timeout for MCP server in sandbox ${sandboxId}:`, errorMessage);
    throw new Error(`Failed to extend MCP server timeout: ${errorMessage}`);
  }
}

/**
 * Clean up all active MCP sandboxes (useful for server shutdown)
 */
export async function cleanupAllMcpSandboxes(): Promise<void> {
  const cleanupPromises: Promise<void>[] = [];
  
  for (const [sandboxId, sandbox] of activeMcpSandboxes.entries()) {
    console.log(`Cleaning up sandbox ${sandboxId}`);
    cleanupPromises.push(
      sandbox.kill().catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error killing sandbox ${sandboxId}:`, errorMessage);
      })
    );
  }
  
  await Promise.allSettled(cleanupPromises);
  activeMcpSandboxes.clear();
}

/**
 * Get the number of active MCP sandboxes
 */
export function getActiveMcpSandboxCount(): number {
  return activeMcpSandboxes.size;
} 