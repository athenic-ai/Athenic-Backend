import { Sandbox } from '@e2b/code-interpreter';
import { v4 as uuid } from 'uuid';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { OutputMessage } from './types';

// Load environment variables
dotenv.config();

// Get E2B API key from environment
const E2B_API_KEY = process.env.E2B_API_KEY;

if (!E2B_API_KEY) {
  console.error('E2B_API_KEY environment variable is not set.');
}

// Map to store active sandboxes
const activeSandboxes = new Map<string, Sandbox>();

// Reference to WebSocket clients map from server.ts
// Will be set when the server initializes
let clientsMap: Map<string, WebSocket>;

/**
 * Register the WebSocket clients map from server.ts
 * @param clients Map of client IDs to WebSocket connections
 */
export function registerClientsMap(clients: Map<string, WebSocket>) {
  clientsMap = clients;
}

/**
 * Create a new E2B sandbox
 * @param template The E2B template to use (default: 'code-interpreter-v1')
 * @returns The sandbox ID
 */
export async function createSandbox(template = 'code-interpreter-v1'): Promise<string> {
  try {
    const sandbox = await Sandbox.create(template, { apiKey: E2B_API_KEY });
    const sandboxId = sandbox.sandboxId;
    
    activeSandboxes.set(sandboxId, sandbox);
    console.log(`Created sandbox ${sandboxId} with template ${template}`);
    
    return sandboxId;
  } catch (error: any) {
    console.error('Error creating sandbox:', error);
    throw new Error(`Failed to create sandbox: ${error.message}`);
  }
}

/**
 * Run code in a sandbox and stream output to a client via WebSocket
 * @param sandboxId The ID of the sandbox to use
 * @param code The code to execute
 * @param clientId The WebSocket client ID to stream output to
 * @param timeoutMs Timeout in milliseconds (default: 30000)
 * @returns A promise that resolves when execution completes
 */
export async function runCodeAndStream(
  sandboxId: string,
  code: string,
  clientId: string,
  timeoutMs = 30000
): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  
  if (!sandbox) {
    throw new Error(`Sandbox ${sandboxId} not found`);
  }
  
  if (!clientsMap) {
    throw new Error('WebSocket clients map not registered - call registerClientsMap first');
  }
  
  const client = clientsMap.get(clientId);
  
  if (!client || client.readyState !== WebSocket.OPEN) {
    console.warn(`Client ${clientId} not connected or ready, output will be lost`);
  }
  
  const executionId = uuid();
  
  // Helper to send messages to client
  const send = (message: any) => {
    const clientWs = clientsMap.get(clientId);
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(message));
    } else {
      console.warn(`Cannot send message to client ${clientId}, WebSocket not open`);
    }
  };
  
  // Send status updates
  const sendStatus = (status: string, message: string) => {
    send({
      type: 'status',
      executionId,
      status,
      message,
      sandboxId
    });
  };
  
  // Notify about execution start
  sendStatus('starting', 'Running code...');
  
  try {
    const startTime = Date.now();
    
    await sandbox.runCode(code, {
      timeoutMs,
      onStdout: (output: OutputMessage) => {
        // Extract text from output object - prefer line over text if available
        const text = typeof output === 'string' ? output : output.line || String(output);
        send({
          type: 'stdout',
          executionId,
          data: text
        });
      },
      onStderr: (output: OutputMessage) => {
        // Extract text from output object - prefer line over text if available
        const text = typeof output === 'string' ? output : output.line || String(output);
        send({
          type: 'stderr',
          executionId,
          data: text
        });
      }
    });
    
    const duration = Date.now() - startTime;
    
    // Notify about successful completion
    send({
      type: 'result',
      executionId,
      data: 'Execution completed successfully',
      duration
    });
    
    sendStatus('completed', `Execution completed in ${duration}ms`);
  } catch (error: any) {
    console.error(`Error running code in sandbox ${sandboxId}:`, error);
    
    // Notify about error
    send({
      type: 'error',
      executionId,
      error: error.message || 'Unknown error'
    });
    
    sendStatus('error', `Execution failed: ${error.message}`);
    
    throw error;
  }
}

/**
 * Close a sandbox and release resources
 * @param sandboxId The ID of the sandbox to close
 */
export async function closeSandbox(sandboxId: string): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  
  if (sandbox) {
    try {
      await sandbox.kill();
      activeSandboxes.delete(sandboxId);
      console.log(`Closed sandbox ${sandboxId}`);
    } catch (error: any) {
      console.error(`Error closing sandbox ${sandboxId}:`, error);
      throw new Error(`Failed to close sandbox: ${error.message}`);
    }
  } else {
    console.warn(`Sandbox ${sandboxId} not found, may have been closed already`);
  }
}

/**
 * Get the number of active sandboxes
 * @returns The count of active sandboxes
 */
export function getActiveSandboxCount(): number {
  return activeSandboxes.size;
}

/**
 * Clean up all active sandboxes
 */
export async function cleanupAllSandboxes(): Promise<void> {
  const promises: Promise<void>[] = [];
  
  for (const [sandboxId, sandbox] of activeSandboxes.entries()) {
    console.log(`Cleaning up sandbox ${sandboxId}`);
    promises.push(sandbox.kill());
  }
  
  await Promise.all(promises);
  activeSandboxes.clear();
  
  console.log('All sandboxes cleaned up');
} 