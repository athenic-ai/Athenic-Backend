import { WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';
import { spawn, ChildProcess } from 'child_process';
import { AddressInfo } from 'net';
import http from 'http';

// Use a dynamic test port to avoid conflicts
function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => {
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

describe('WebSocket Server', () => {
  let serverProcess: ChildProcess;
  let TEST_PORT: number;
  let SERVER_URL: string;
  let WS_SERVER_URL: string;
  
  beforeAll(async () => {
    // Get available port
    TEST_PORT = await getAvailablePort();
    SERVER_URL = `http://localhost:${TEST_PORT}`;
    WS_SERVER_URL = `ws://localhost:${TEST_PORT}`;
    
    // Start the server with the dynamic port
    serverProcess = spawn('npx', ['ts-node', 'src/server.ts'], {
      env: {
        ...process.env,
        PORT: String(TEST_PORT)
      }
    });
    
    // Log server output for debugging
    serverProcess.stdout?.on('data', (data) => {
      console.log(`Server stdout: ${data}`);
    });
    
    serverProcess.stderr?.on('data', (data) => {
      console.error(`Server stderr: ${data}`);
    });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 5000));
  });
  
  afterAll(async () => {
    // Kill the server
    if (serverProcess) {
      serverProcess.kill();
    }
    
    // Wait for server to shut down
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('WebSocket connection should receive welcome message', async () => {
    return new Promise<void>((resolve, reject) => {
      const clientId = `client_${uuid()}`;
      const ws = new WebSocket(`${WS_SERVER_URL}?clientId=${clientId}`);
      
      ws.on('open', () => {
        console.log('WebSocket connection opened');
      });
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('Received message:', data);
          
          // Check welcome message
          expect(data.type).toBe('status');
          expect(data.status).toBe('connected');
          expect(data.message).toContain(`Connected as client ${clientId}`);
          
          ws.close();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });
      
      // Add timeout guard
      setTimeout(() => {
        reject(new Error('WebSocket connection test timed out'));
      }, 10000).unref();
    });
  }, 15000);
  
  test('Should stream outputs for multi-line Python code', async () => {
    return new Promise<void>(async (resolve, reject) => {
      const clientId = `client_${uuid()}`;
      const ws = new WebSocket(`${WS_SERVER_URL}?clientId=${clientId}`);
      
      const messages: any[] = [];
      let connected = false;
      
      ws.on('open', async () => {
        connected = true;
        console.log('WebSocket opened for multi-line test');
      });
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('WebSocket message received:', data);
          messages.push(data);
          
          // If we've received a welcome message, send the execute request
          if (data.type === 'status' && data.status === 'connected' && connected) {
            console.log('Sending execute-stream request for multi-line test');
            
            fetch(`${SERVER_URL}/execute-stream`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                code: 'for i in range(3):\n    print(f"Line {i}")\nresult = 10 * 5\nprint(f"Result: {result}")',
                clientId,
                timeout: 10000
              })
            }).catch(err => {
              console.error('Error sending execute request:', err);
              reject(err);
            });
          }
          
          // If we received a status message with 'complete', we're done
          if (data.type === 'status' && data.status === 'complete') {
            console.log('Received completion message, closing WebSocket');
            ws.close();
            
            // The stdout messages might be combined in a single message
            const stdoutMessages = messages.filter(m => m.type === 'stdout');
            
            // Check for the expected output patterns
            const stdoutContent = stdoutMessages.map(m => m.data).join('');
            expect(stdoutContent).toContain('Line 0');
            expect(stdoutContent).toContain('Line 1');
            expect(stdoutContent).toContain('Line 2');
            expect(stdoutContent).toContain('Result: 50');
            
            resolve();
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
          reject(err);
        }
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });
      
      ws.on('close', () => {
        console.log('WebSocket closed for multi-line test');
      });
      
      // Add timeout guard
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
          reject(new Error('Multi-line test timed out'));
        }
      }, 20000).unref();
    });
  }, 30000);
  
  test('Should handle errors in code execution', async () => {
    return new Promise<void>(async (resolve, reject) => {
      const clientId = `client_${uuid()}`;
      const ws = new WebSocket(`${WS_SERVER_URL}?clientId=${clientId}`);
      
      const messages: any[] = [];
      let connected = false;
      
      ws.on('open', async () => {
        connected = true;
        console.log('WebSocket opened for error test');
      });
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('WebSocket message received:', data);
          messages.push(data);
          
          // If we've received a welcome message, send the execute request with error code
          if (data.type === 'status' && data.status === 'connected' && connected) {
            console.log('Sending execute-stream request with error code');
            
            fetch(`${SERVER_URL}/execute-stream`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                code: 'print("Before error")\nx = undefined_variable\nprint("After error")',
                clientId,
                timeout: 10000
              })
            }).catch(err => {
              console.error('Error sending execute request:', err);
              reject(err);
            });
          }
          
          // Look for error status or result
          if (data.type === 'status' && (data.status === 'error' || data.status === 'complete')) {
            console.log('Received error or completion message, closing WebSocket');
            ws.close();
            
            // Check we received the expected outputs
            const stdoutMessages = messages.filter(m => m.type === 'stdout');
            const stdoutContent = stdoutMessages.map(m => m.data).join('');
            
            // Should have "Before error" in stdout
            expect(stdoutContent).toContain('Before error');
            
            // Check for error in the result message
            const resultMessages = messages.filter(m => m.type === 'result');
            expect(resultMessages.length).toBeGreaterThan(0);
            
            // Error could be in the result data.error field
            const hasError = resultMessages.some(m => 
              m.data && 
              m.data.error && 
              (JSON.stringify(m.data.error).includes('undefined_variable') || 
               (typeof m.data.error === 'string' && m.data.error.includes('undefined_variable')))
            );
            
            expect(hasError || data.status === 'error').toBe(true);
            
            resolve();
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
          reject(err);
        }
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });
      
      ws.on('close', () => {
        console.log('WebSocket closed for error test');
      });
      
      // Add timeout guard
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
          reject(new Error('Error test timed out'));
        }
      }, 20000).unref();
    });
  }, 30000);
}); 