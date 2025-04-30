import express from 'express';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import http, { Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Sandbox } from '@e2b/code-interpreter';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { parse } from 'url';
import { 
  ExecuteCodeRequest, 
  ExecuteCodeResponse, 
  ExecuteStreamRequest,
  WSMessage, 
  WSStatusMessage, 
  WSOutputMessage, 
  WSErrorMessage,
  WSResultMessage,
  OutputMessage,
  RunCodeOptions 
} from './types';
import * as e2bService from './e2b-service';

// Load environment variables
dotenv.config();

// Constants
const PORT = process.env.PORT || 8002;
const E2B_API_KEY = process.env.E2B_API_KEY;

// Setup Express app with CORS and JSON body parser
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Track active sandbox instances for cleanup
let activeSandboxes: { [key: string]: Sandbox } = {};
// Track client connections with their IDs
const clients = new Map<string, WebSocket>();
// Track active code executions by executionId
const activeExecutions = new Map<string, { sandboxId: string, clientId: string }>();
// Track pending messages for clients that are not connected
const pendingMessages = new Map<string, string[]>();

// Register clients map with e2b service
e2bService.registerClientsMap(clients);

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const { pathname, query } = parse(req.url || '', true);
  
  // Check for clientId in different formats:
  // 1. From query parameter (new approach): /ws?clientId=123
  // 2. From path segment (old approach): /ws/123
  let clientId = query.clientId as string;
  
  if (!clientId && pathname) {
    // Try to extract from path
    const pathSegments = pathname.split('/').filter(segment => segment);
    if (pathSegments.length > 1) {
      // Assume the last segment is the clientId in case of /ws/{clientId} format
      clientId = pathSegments[pathSegments.length - 1];
    }
  }
  
  // If still no clientId, generate a new one
  if (!clientId) {
    clientId = uuid();
    console.log(`No clientId provided, generated new ID: ${clientId}`);
  }
  
  console.log(`WebSocket connected: ${clientId}, URL: ${req.url}`);
  console.log(`Current active clients before adding: ${Array.from(clients.keys()).join(', ')}`);
  
  clients.set(clientId, ws);
  
  console.log(`Updated clients map, new size: ${clients.size}`);
  
  // Send welcome message
  const welcomeMsg: WSStatusMessage = {
    type: 'status',
    executionId: 'system',
    status: 'connected',
    message: `Connected as client ${clientId}`
  };
  
  try {
    ws.send(JSON.stringify(welcomeMsg));
    console.log(`Sent welcome message to client ${clientId}`);
  } catch (error) {
    console.error(`Error sending welcome message to client ${clientId}:`, error);
  }
  
  // Send any pending messages for this client
  if (pendingMessages.has(clientId)) {
    console.log(`Sending ${pendingMessages.get(clientId)?.length || 0} pending messages to client ${clientId}`);
    const messages = pendingMessages.get(clientId) || [];
    messages.forEach((message) => {
      ws.send(message as string | Buffer | ArrayBuffer | Buffer[]);
    });
    pendingMessages.delete(clientId);
  }
  
  // Handle messages from clients
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message:', data);
      // Handle client messages here if needed
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log(`WebSocket disconnected: ${clientId}`);
    clients.delete(clientId);
    
    // Cleanup any sandboxes associated with this client
    Object.entries(activeExecutions).forEach(([executionId, execution]) => {
      if (execution.clientId === clientId) {
        const sandboxId = execution.sandboxId;
        if (activeSandboxes[sandboxId]) {
          console.log(`Closing sandbox ${sandboxId} for disconnected client ${clientId}`);
          activeSandboxes[sandboxId].kill();
          delete activeSandboxes[sandboxId];
        }
        activeExecutions.delete(executionId);
      }
    });
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// NEW ENDPOINT: Analyze if a message requires code execution
app.post('/analyze-execution-needs', (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({
      error: 'Missing required parameter: message'
    });
  }
  
  console.log(`Analyzing message for execution needs: ${message.substring(0, 100)}...`);
  
  // Simple heuristic check for code execution markers
  // In production, this would be replaced by the LLM-based check already implemented in the Supabase function
  const codeKeywords = [
    'code', 'execute', 'run', 'python', 'javascript', 'node', 'npm', 'script',
    'terminal', 'command', 'shell', 'bash', 'function', 'algorithm',
    'compile', 'build', 'dev', 'program', 'repository', 'git', 'commit',
    'file system', 'read file', 'write file', 'modify file', 
    'debug', 'modify', 'create', 'help'
  ];
  
  const lowercaseMessage = message.toLowerCase();
  const requiresExecution = codeKeywords.some(keyword => lowercaseMessage.includes(keyword));
  
  res.json({
    requiresExecution,
    message: `Analysis complete. ${requiresExecution ? 'Code execution appears to be required.' : 'No code execution needed.'}`
  });
});

// Execute code synchronously and return result
app.post('/execute', async (req, res) => {
  const { code, language, timeout = 30000 } = req.body as ExecuteCodeRequest;
  const executionId = uuid();
  
  console.log(`Executing code (${executionId}): ${code.substring(0, 100)}...`);
  
  try {
    const startTime = Date.now();
    
    // Create sandbox using default template if language is not specified
    const sandbox = language 
      ? await Sandbox.create(language, { apiKey: E2B_API_KEY })
      : await Sandbox.create({ apiKey: E2B_API_KEY });
    
    const sandboxId = sandbox.sandboxId;
    activeSandboxes[sandboxId] = sandbox;
    
    // Execute code
    const execution = await sandbox.runCode(code, { 
      timeoutMs: timeout 
    });
    
    // Clean up sandbox
    await sandbox.kill();
    delete activeSandboxes[sandboxId];
    
    const duration = Date.now() - startTime;
    
    // Send response
    const response: ExecuteCodeResponse = {
      executionId,
      result: execution,
      error: execution.error ? String(execution.error) : undefined,
      // exitCode is not available in the Execution type from @e2b/code-interpreter
      duration
    };
    
    res.json(response);
  } catch (error: any) {
    console.error(`Error executing code (${executionId}):`, error);
    res.status(500).json({
      executionId,
      error: error.message,
      duration: 0
    });
  }
});

// DEPRECATED - Use e2b-service.runCodeAndStream instead
// This endpoint will be removed in a future version
app.post('/execute-stream', async (req, res) => {
  console.warn('DEPRECATED: /execute-stream endpoint is deprecated and will be removed. Use the e2b-service module instead.');
  
  const { code, language, timeout = 30000, clientId } = req.body as ExecuteStreamRequest;
  
  if (!clientId) {
    return res.status(400).json({
      error: 'Missing required parameter: clientId'
    });
  }
  
  try {
    let sandboxId: string;
    
    // Create sandbox
    sandboxId = await e2bService.createSandbox(language || 'code-interpreter-v1');
    
    // Send processing status to client
    res.status(202).json({
      message: 'Code execution started. Output is being streamed via WebSocket.',
      sandboxId
    });
    
    // Run code and stream output
    await e2bService.runCodeAndStream(sandboxId, code, clientId, timeout);
    
    // Clean up the sandbox after execution
    await e2bService.closeSandbox(sandboxId);
  } catch (error: any) {
    console.error('Error in /execute-stream:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Create sandbox endpoint
app.post('/create-sandbox', async (req, res) => {
  const { template = 'code-interpreter-v1' } = req.body;
  
  try {
    console.log(`Creating sandbox with template: ${template}`);
    const sandboxId = await e2bService.createSandbox(template);
    
    res.json({
      success: true,
      sandboxId,
      message: `Sandbox created with ID: ${sandboxId}`
    });
  } catch (error: any) {
    console.error('Error creating sandbox:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create sandbox'
    });
  }
});

// Close sandbox endpoint
app.post('/close-sandbox', async (req, res) => {
  const { sandboxId } = req.body;
  
  if (!sandboxId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: sandboxId'
    });
  }
  
  try {
    console.log(`Closing sandbox: ${sandboxId}`);
    await e2bService.closeSandbox(sandboxId);
    
    res.json({
      success: true,
      message: `Sandbox ${sandboxId} closed successfully`
    });
  } catch (error: any) {
    console.error(`Error closing sandbox ${sandboxId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to close sandbox'
    });
  }
});

// Get active sandboxes count endpoint
app.get('/active-sandboxes', (req, res) => {
  try {
    const count = e2bService.getActiveSandboxCount();
    
    res.json({
      success: true,
      count,
      message: `There are currently ${count} active sandbox instances`
    });
  } catch (error: any) {
    console.error('Error getting active sandboxes count:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get active sandboxes count'
    });
  }
});

// Cleanup all sandboxes endpoint
app.post('/cleanup-all-sandboxes', async (req, res) => {
  try {
    console.log('Cleaning up all sandbox instances');
    await e2bService.cleanupAllSandboxes();
    
    res.json({
      success: true,
      message: 'All sandbox instances have been cleaned up'
    });
  } catch (error: any) {
    console.error('Error cleaning up all sandboxes:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clean up all sandboxes'
    });
  }
});

// Test endpoint for direct code execution (for debugging)
app.post('/test-execute', async (req, res) => {
  try {
    console.log('Received test execute request');
    
    // Create sandbox
    const sandbox = await Sandbox.create('code-interpreter-v1', { apiKey: E2B_API_KEY });
    console.log(`Created test sandbox: ${sandbox.sandboxId}`);
    
    // Run simple echo command
    const stdoutOutput: string[] = [];
    const stderrOutput: string[] = [];
    
    console.log('Running test code: echo "hello"');
    
    const execResult = await sandbox.runCode(`
import subprocess
import sys

try:
    result = subprocess.run("echo hello", shell=True, capture_output=True, text=True)
    
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
`, {
      onStdout: (output) => {
        const text = typeof output === 'string' ? output : output.line || String(output);
        stdoutOutput.push(text);
        console.log(`Test stdout: ${text}`);
      },
      onStderr: (output) => {
        const text = typeof output === 'string' ? output : output.line || String(output);
        stderrOutput.push(text);
        console.log(`Test stderr: ${text}`);
      }
    });
    
    console.log('Test execution complete');
    
    // Close sandbox
    await sandbox.kill();
    
    // Send response
    res.json({
      success: true,
      stdout: stdoutOutput,
      stderr: stderrOutput,
      result: execResult
    });
  } catch (error: any) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Graceful shutdown handler
const gracefulShutdown = async () => {
  console.log('Shutting down server...');
  
  // Close all active sandboxes
  await e2bService.cleanupAllSandboxes();
  
  // Close the HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after timeout
  setTimeout(() => {
    console.log('Forcing exit after timeout');
    process.exit(1);
  }, 10000);
};

// Handle signals for graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server if this file is run directly
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`E2B Service running on port ${PORT}`);
  });
}

// Export server for testing and programmatic use
export function startServer(): Promise<Server> {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`E2B Service running on port ${PORT}`);
      resolve(server);
    });
  });
}

// Export e2b service functions to expose them to AgentKit tools
export {
  createSandbox,
  runCodeAndStream,
  closeSandbox,
  getActiveSandboxCount,
  cleanupAllSandboxes
} from './e2b-service'; 