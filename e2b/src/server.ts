import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import { Sandbox, OutputMessage } from '@e2b/code-interpreter';
import { ExecuteCodeRequest, ExecuteCodeResponse, WSMessage } from './types';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Port configuration - use 4000 port range
const PORT = process.env.PORT || 4000;
const E2B_API_KEY = process.env.E2B_API_KEY;

if (!E2B_API_KEY) {
  console.error('E2B_API_KEY is not set in the environment variables');
  process.exit(1);
}

// Map to store active sessions
const activeSessions = new Map<string, Sandbox>();

// Enable JSON parsing middleware
app.use(express.json());

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', (message) => {
    console.log(`Received: ${message}`);
    // Handle any client messages if needed
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Send WebSocket message to all connected clients
function broadcastMessage(message: WSMessage): void {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Execute code endpoint
app.post('/execute', async (req, res) => {
  try {
    const { code, language = 'python', timeout = 30000 }: ExecuteCodeRequest = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    console.log(`Executing ${language} code with timeout ${timeout}ms`);

    // Create a unique execution ID
    const executionId = Date.now().toString();

    // Broadcast starting status
    broadcastMessage({
      type: 'status',
      status: 'starting',
      message: 'Starting code execution',
      executionId
    });

    // Initialize the sandbox
    const sandbox = await Sandbox.create({
      apiKey: E2B_API_KEY
    });
    
    // Store the session
    activeSessions.set(executionId, sandbox);

    // Broadcast running status
    broadcastMessage({
      type: 'status',
      status: 'running',
      message: 'Code execution in progress',
      executionId
    });

    // Execute the code with timeout
    const startTime = Date.now();
    const execution = await Promise.race([
      sandbox.runCode(code, {
        language,
        timeoutMs: timeout,
        onStdout: (output: OutputMessage) => {
          broadcastMessage({
            type: 'stdout',
            data: output.line,
            executionId
          });
        },
        onStderr: (output: OutputMessage) => {
          broadcastMessage({
            type: 'stderr',
            data: output.line,
            executionId
          });
        }
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Execution timed out')), timeout)
      )
    ]);

    const duration = Date.now() - startTime;

    // Broadcast completion status
    broadcastMessage({
      type: 'status',
      status: 'completed',
      message: 'Code execution completed',
      executionId
    });

    // Clean up the session by killing the sandbox
    await sandbox.kill();
    activeSessions.delete(executionId);

    // Send response
    const response: ExecuteCodeResponse = {
      executionId,
      result: execution,
      duration
    };

    return res.json(response);
  } catch (error: any) {
    console.error('Error executing code:', error);

    // Broadcast error status if we have an executionId
    if (error.executionId) {
      broadcastMessage({
        type: 'error',
        error: error.message || 'Unknown error',
        executionId: error.executionId
      });

      // Clean up the session if it exists
      if (activeSessions.has(error.executionId)) {
        const sandbox = activeSessions.get(error.executionId);
        await sandbox?.kill();
        activeSessions.delete(error.executionId);
      }
    }

    return res.status(500).json({
      error: error.message || 'Unknown error occurred during code execution',
      executionId: error.executionId || 'unknown'
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close all active sessions
  for (const [id, sandbox] of activeSessions.entries()) {
    console.log(`Closing session ${id}`);
    await sandbox.kill();
  }
  
  // Close server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}`);
}); 