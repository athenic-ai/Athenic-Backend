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

// Active sandboxes map to track all created sandboxes
const activeSandboxes = new Map<string, Sandbox>();

// Track template types for active sandboxes
const activeSandboxTemplates = new Map<string, string>();

// Map of WebSocket clients by client ID
let clientsMap: Map<string, WebSocket> | null = null;

/**
 * Register the WebSocket clients map
 * @param clients Map of WebSocket clients by client ID
 */
export function registerClientsMap(clients: Map<string, WebSocket>) {
  clientsMap = clients;
}

/**
 * Create a new sandbox with the specified template
 * @param template The sandbox template to use
 * @returns A promise that resolves to the sandbox ID
 */
export async function createSandbox(template = 'code-interpreter-v1'): Promise<string> {
  try {
    if (!E2B_API_KEY) {
      throw new Error('E2B API key is not set - set the E2B_API_KEY environment variable');
    }
    
    const sandbox = await Sandbox.create(template, { apiKey: E2B_API_KEY });
    const sandboxId = sandbox.sandboxId;
    
    activeSandboxes.set(sandboxId, sandbox);
    // Store the template type for later reference
    activeSandboxTemplates.set(sandboxId, template);
    
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
  
  // IMPORTANT: Check for both the provided clientId and the sandboxId itself as client ids
  // Since we're now using sandboxId as clientId in some places for consistency
  const client = clientsMap.get(clientId) || (clientId !== sandboxId ? clientsMap.get(sandboxId) : undefined);
  
  console.log(`[DEBUG] runCodeAndStream for client ${clientId}, found client connection: ${!!client}, readyState: ${client?.readyState}`);
  console.log(`[DEBUG] Also checked for sandboxId ${sandboxId} as clientId: ${!!clientsMap.get(sandboxId)}`);
  console.log(`[DEBUG] WebSocket.OPEN=${WebSocket.OPEN}, clients map size: ${clientsMap.size}`);
  console.log(`[DEBUG] All connected clients: ${Array.from(clientsMap.keys()).join(', ')}`);
  
  if (!client || client.readyState !== WebSocket.OPEN) {
    console.warn(`Client ${clientId} not connected or ready, checking alternative connections...`);
    
    // If the specific client is not available, try to find any client that might be waiting
    if (clientsMap.size > 0) {
      // Find the most recent connection that is OPEN
      for (const [id, ws] of clientsMap.entries()) {
        if (ws.readyState === WebSocket.OPEN) {
          console.log(`[INFO] Found alternative open connection with client ID: ${id}. Using this instead.`);
          clientId = id;
          break;
        }
      }
    }
  }
  
  const executionId = uuid();
  
  // Helper to send messages to client
  const send = (message: any) => {
    if (!clientsMap) {
      console.warn('No WebSocket clients map registered');
      return;
    }
    
    // IMPORTANT: Try both the provided clientId and the sandboxId as client IDs
    let clientWs = clientsMap.get(clientId);
    if (!clientWs || clientWs.readyState !== WebSocket.OPEN) {
      // Try the sandboxId as an alternate clientId if different
      if (clientId !== sandboxId) {
        clientWs = clientsMap.get(sandboxId);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          console.log(`[INFO] Using sandboxId ${sandboxId} as clientId for WebSocket communication`);
        }
      }
    }
    
    console.log(`[DEBUG] send(): Client ${clientId} connection: ${!!clientWs}, readyState: ${clientWs?.readyState}`);
    
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      const messageStr = JSON.stringify(message);
      console.log(`[DEBUG] Sending message type ${message.type} to client ${clientId}`);
      clientWs.send(messageStr);
    } else {
      console.warn(`Cannot send message to client ${clientId} or sandbox ${sandboxId}, WebSocket not open (readyState: ${clientWs?.readyState})`);
      
      // Last resort - try to find ANY open connection
      if (clientsMap.size > 0) {
        for (const [connId, conn] of clientsMap.entries()) {
          if (conn.readyState === WebSocket.OPEN) {
            console.log(`[INFO] Sending message to alternative client ${connId} as fallback`);
            conn.send(JSON.stringify(message));
            return;
          }
        }
      }
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
  
  // Check if this is a shell command (starts with $, or contains common shell patterns)
  const shellCommandRegex = /^\s*\$?\s*(ls|cd|mkdir|rm|cp|mv|cat|grep|find|echo|curl|wget|git)\s/;
  const isShellCommand = /^\s*\$\s/.test(code) || 
                         shellCommandRegex.test(code) || 
                         /run\s+(the\s+)?command\s+[`'"'](.+?)[`'"']/i.test(code);
  
  // Extract the actual command (remove the $ if present)
  const actualCommand = code.replace(/^\s*\$\s/, '').trim();
  
  if (isShellCommand) {
    // Get template type from sandboxId or use default
    // The sandbox might not have a template property directly accessible
    const templateInfo = activeSandboxTemplates.get(sandboxId) || 'code-interpreter-v1';
    
    // For Python-based templates
    if (templateInfo.includes('python') || templateInfo === 'code-interpreter-v1') {
      // Format as Python subprocess call
      code = `
import subprocess
import sys

try:
    # Execute the shell command
    result = subprocess.run(${JSON.stringify(actualCommand)}, shell=True, capture_output=True, text=True)
    
    # Print stdout
    if result.stdout:
        print(result.stdout)
    
    # Print stderr if any
    if result.stderr:
        print("Error output:", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
    
    # Print return code
    print(f"Command completed with exit code: {result.returncode}")
except Exception as e:
    print(f"Failed to execute command: {str(e)}", file=sys.stderr)
`;
    } 
    // For Node.js based templates
    else if (templateInfo.includes('node') || templateInfo === 'nodejs-v1') {
      // Format as Node.js child_process call
      code = `
const { execSync } = require('child_process');

try {
  const command = ${JSON.stringify(actualCommand)};
  console.log(\`Executing command: \${command}\`);
  
  const output = execSync(command, { 
    encoding: 'utf8',
    shell: true,
    stdio: 'pipe'
  });
  
  console.log(output);
  console.log('Command completed successfully');
} catch (error) {
  console.error('Error output:');
  if (error.stderr) console.error(error.stderr);
  console.error(\`Command failed with exit code: \${error.status || 'unknown'}\`);
  console.error(error.message);
}
`;
    } else {
      // For other templates, use a minimal shell wrapper appropriate for the environment
      // This is a fallback that might not work in all templates
      code = actualCommand;
    }
    
    sendStatus('preparing', 'Formatting shell command for execution...');
  }
  
  // Notify about execution start
  sendStatus('starting', 'Running code...');
  
  try {
    const startTime = Date.now();
    
    console.log(`[DEBUG] Running code in sandbox ${sandboxId} for client ${clientId}`);
    
    await sandbox.runCode(code, {
      timeoutMs,
      onStdout: (output: OutputMessage) => {
        // Extract text from output object - prefer line over text if available
        const text = typeof output === 'string' ? output : output.line || String(output);
        console.log(`[DEBUG] Stdout from sandbox: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        send({
          type: 'stdout',
          executionId,
          data: text
        });
      },
      onStderr: (output: OutputMessage) => {
        // Extract text from output object - prefer line over text if available
        const text = typeof output === 'string' ? output : output.line || String(output);
        console.log(`[DEBUG] Stderr from sandbox: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        send({
          type: 'stderr',
          executionId,
          data: text
        });
      }
    });
    
    const duration = Date.now() - startTime;
    console.log(`[DEBUG] Code execution complete for client ${clientId}, duration: ${duration}ms`);
    
    // Notify about successful completion
    send({
      type: 'result',
      executionId,
      data: { message: 'Execution completed successfully', duration },
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
      // Also remove from templates tracking
      activeSandboxTemplates.delete(sandboxId);
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
  // Also clear templates tracking
  activeSandboxTemplates.clear();
  
  console.log('All sandboxes cleaned up');
} 