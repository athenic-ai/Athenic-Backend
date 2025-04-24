import { Server } from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Sandbox } from '@e2b/code-interpreter';

// Map to store active clients
const clients = new Map<string, any>();

/**
 * Creates a test server with both HTTP and WebSocket endpoints for testing
 */
export async function createServer(): Promise<{ server: Server; app: express.Express }> {
  const app = express();
  app.use(express.json());
  
  const server = new Server(app);
  
  // Create WebSocket server
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws, req) => {
    const clientId = req.url?.split('clientId=')[1] || `client_${Date.now()}`;
    clients.set(clientId, ws);
    
    ws.on('message', (message) => {
      console.log(`Test server received message from ${clientId}: ${message}`);
    });
    
    ws.on('close', () => {
      clients.delete(clientId);
    });
    
    ws.send(JSON.stringify({ type: 'system', message: `Connected to Test E2B Service as ${clientId}` }));
  });
  
  // Add execute-stream endpoint
  app.post('/execute-stream', async (req, res) => {
    const { code, template = 'code-interpreter-v1', clientId } = req.body;
    
    if (!code) return res.status(400).json({ error: 'Missing code parameter' });
    if (!clientId) return res.status(400).json({ error: 'Missing clientId parameter' });
    if (!process.env.E2B_API_KEY) {
      console.error('E2B_API_KEY is not set.');
      return res.status(500).json({ error: 'Server configuration error: E2B API Key missing.' });
    }
    
    const clientWs = clients.get(clientId);
    if (!clientWs) {
      return res.status(404).json({ error: `Client ${clientId} not found or not connected via WebSocket.` });
    }
    
    // Respond immediately to indicate process started
    res.status(202).json({ message: 'Execution started. Updates will be sent via WebSocket.' });
    
    let sandbox: Sandbox | null = null;
    try {
      // Send status updates
      clientWs.send(JSON.stringify({ type: 'status', message: 'Creating sandbox...' }));
      sandbox = await Sandbox.create({
        apiKey: process.env.E2B_API_KEY,
        // The Sandbox.create method varies between E2B versions, so we need to be flexible
        // This works with the current @e2b/code-interpreter package
      });

      clientWs.send(JSON.stringify({ 
        type: 'status', 
        message: `Sandbox created.` 
      }));
      
      clientWs.send(JSON.stringify({ type: 'status', message: 'Executing code...' }));
      
      // Define callbacks for stdout and stderr
      const stdoutHandler = (output: any) => {
        clientWs.send(JSON.stringify({ 
          type: 'stdout', 
          data: typeof output === 'string' ? output : output.text || JSON.stringify(output) 
        }));
      };
      
      const stderrHandler = (output: any) => {
        clientWs.send(JSON.stringify({ 
          type: 'stderr', 
          data: typeof output === 'string' ? output : output.text || JSON.stringify(output) 
        }));
      };

      // Execute code
      const execution = await sandbox.runCode(code, {
        onStdout: stdoutHandler,
        onStderr: stderrHandler
      });
      
      clientWs.send(JSON.stringify({
        type: 'result',
        results: execution.results,
        error: execution.error,
        message: 'Execution finished.'
      }));
    } catch (error: any) {
      console.error(`Error executing code in E2B:`, error);
      clientWs.send(JSON.stringify({ type: 'error', message: `E2B execution failed: ${error.message}` }));
    } finally {
      if (sandbox) {
        clientWs.send(JSON.stringify({ type: 'status', message: 'Closing sandbox...' }));
        try {
          // Different versions of E2B SDK have different ways to close sandboxes
          if (typeof sandbox.close === 'function') {
            await sandbox.close();
          } else if (typeof (sandbox as any).dispose === 'function') {
            await (sandbox as any).dispose();
          }
          clientWs.send(JSON.stringify({ type: 'status', message: 'Sandbox closed.' }));
        } catch (closeError) {
          console.error('Error closing sandbox:', closeError);
          clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to close sandbox properly.' }));
        }
      }
    }
  });
  
  // Start server on a random available port
  await new Promise<void>((resolve) => {
    server.listen(0, 'localhost', () => {
      resolve();
    });
  });
  
  // Return the server and app instances
  return { server, app };
} 