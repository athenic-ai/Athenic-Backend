import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { Sandbox } from '@e2b/code-interpreter';
import bodyParser from 'body-parser';
import cors from 'cors';
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

// Load environment variables
dotenv.config();

// Constants
const PORT = process.env.PORT || 4000;
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

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const { query } = parse(req.url || '', true);
  const clientId = (query.clientId as string) || uuid();
  
  console.log(`WebSocket connected: ${clientId}`);
  clients.set(clientId, ws);
  
  // Send welcome message
  const welcomeMsg: WSStatusMessage = {
    type: 'status',
    executionId: 'system',
    status: 'connected',
    message: `Connected as client ${clientId}`
  };
  ws.send(JSON.stringify(welcomeMsg));
  
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

// Execute code with streaming output via WebSocket
app.post('/execute-stream', async (req, res) => {
  const { code, language, timeout = 30000, clientId } = req.body as ExecuteStreamRequest;
  const executionId = uuid();
  
  console.log(`Executing code with streaming (${executionId}) for client ${clientId}: ${code.substring(0, 100)}...`);
  
  // Check if client is connected
  if (!clients.has(clientId)) {
    return res.status(400).json({
      error: `Client ${clientId} is not connected via WebSocket`,
      executionId
    });
  }

  const clientWs = clients.get(clientId)!;
  
  // Broadcast status update
  const broadcastStatus = (status: string, message: string, sandboxId?: string, duration?: number) => {
    const statusMsg: WSStatusMessage = {
      type: 'status',
      executionId,
      status,
      message,
      sandboxId,
      duration
    };
    clientWs.send(JSON.stringify(statusMsg));
  };
  
  try {
    const startTime = Date.now();
    broadcastStatus('starting', 'Initializing sandbox...');
    
    // Create sandbox using default template if language is not specified
    const sandbox = language 
      ? await Sandbox.create(language, { apiKey: E2B_API_KEY })
      : await Sandbox.create({ apiKey: E2B_API_KEY });
    
    const sandboxId = sandbox.sandboxId;
    activeSandboxes[sandboxId] = sandbox;
    activeExecutions.set(executionId, { sandboxId, clientId });
    
    broadcastStatus('running', 'Executing code...', sandboxId);
    
    // Execute code with streaming output
    const execution = await sandbox.runCode(code, { 
      timeoutMs: timeout,
      onStdout: (output: OutputMessage) => {
        const outputMsg: WSOutputMessage = {
          type: 'stdout',
          executionId,
          data: output.line || output.text || String(output)
        };
        clientWs.send(JSON.stringify(outputMsg));
      },
      onStderr: (output: OutputMessage) => {
        const errorOutputMsg: WSOutputMessage = {
          type: 'stderr',
          executionId,
          data: output.line || output.text || String(output)
        };
        clientWs.send(JSON.stringify(errorOutputMsg));
      }
    });
    
    const duration = Date.now() - startTime;
    
    // Send final result
    const resultMsg: WSResultMessage = {
      type: 'result',
      executionId,
      data: execution,
      duration
    };
    clientWs.send(JSON.stringify(resultMsg));
    
    // Send status completion
    broadcastStatus(
      execution.error ? 'error' : 'complete', 
      execution.error ? `Error: ${execution.error}` : 'Execution completed successfully', 
      sandboxId, 
      duration
    );
    
    // Clean up
    await sandbox.kill();
    delete activeSandboxes[sandboxId];
    activeExecutions.delete(executionId);
    
    // Send response to HTTP request
    res.json({
      executionId,
      status: 'streaming',
      clientId
    });
  } catch (error: any) {
    console.error(`Error executing streaming code (${executionId}):`, error);
    
    // Send error message via WebSocket
    const errorMsg: WSErrorMessage = {
      type: 'error',
      executionId,
      error: error.message
    };
    clientWs.send(JSON.stringify(errorMsg));
    
    // Clean up any active resources
    const execution = activeExecutions.get(executionId);
    if (execution) {
      const sandboxId = execution.sandboxId;
      if (activeSandboxes[sandboxId]) {
        await activeSandboxes[sandboxId].kill();
        delete activeSandboxes[sandboxId];
      }
      activeExecutions.delete(executionId);
    }
    
    res.status(500).json({
      executionId,
      error: error.message,
      clientId
    });
  }
});

// Graceful shutdown to clean up sandboxes
const gracefulShutdown = async () => {
  console.log('Shutting down server and cleaning up resources...');
  
  // Close all active sandboxes
  const closingPromises = Object.values(activeSandboxes).map(sandbox => {
    console.log(`Closing sandbox ${sandbox.sandboxId}...`);
    return sandbox.kill().catch((err: Error) => {
      console.error(`Error closing sandbox ${sandbox.sandboxId}:`, err);
    });
  });
  
  try {
    await Promise.all(closingPromises);
    console.log('All sandboxes closed successfully');
  } catch (err) {
    console.error('Error during sandbox cleanup:', err);
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

// Handle termination signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start server
server.listen(PORT, () => {
  console.log(`E2B Sandbox service running on port ${PORT}`);
}); 