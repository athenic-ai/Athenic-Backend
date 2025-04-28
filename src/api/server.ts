import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import { v4 as uuid } from 'uuid';
import { inngest } from '../inngest/client';
import { createSupabaseClient } from './supabase';

console.log('Server module is being loaded');

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();
console.log('Environment variables loaded');

// Create Express app
const app = express();
console.log('Express app created');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev')); // Logging
console.log('Middleware configured');

// Store active client sessions
const clientSessions = new Map();

// Health check endpoint
app.get('/api/health', (req: any, res: any) => {
  console.log('Health check endpoint called');
  res.json({ status: 'healthy', service: 'backend-api' });
  console.log('Health check response sent');
});

// Chat endpoint - handles messages from the Flutter app
app.post('/api/chat', async (req: any, res: any) => {
  console.log('Chat endpoint called');
  try {
    const { message, userId, organisationId } = req.body;
    
    // Validate required parameters
    if (!message) {
      console.log('Missing message parameter');
      return res.status(400).json({ error: 'Missing required parameter: message' });
    }
    
    // Validate auth token if provided
    const authHeader = req.headers.authorization;
    if (authHeader) {
      console.log('Auth header found, validating token');
      // Extract the token
      const token = authHeader.split(' ')[1];
      
      // Initialize Supabase client
      const supabase = createSupabaseClient();
      
      // Verify the token
      console.log('Verifying token with Supabase');
      const { data, error } = await supabase.auth.getUser(token);
      
      if (error) {
        console.error('Auth error:', error);
        return res.status(401).json({ error: 'Invalid authentication token' });
      }
      
      console.log('Authenticated user:', data.user);
    }
    
    // Generate a unique client ID for this session
    const clientId = req.body.clientId || uuid();
    
    // Initialize or update client session
    clientSessions.set(clientId, {
      lastMessage: message,
      lastTimestamp: new Date().toISOString(),
      processingState: 'submitted'
    });
    
    // Log the incoming message
    console.log(`Received chat message from client ${clientId}:`, message.substring(0, 100) + (message.length > 100 ? '...' : ''));
    
    // Send the event to Inngest for processing
    console.log('Sending event to Inngest');
    await inngest.send({
      name: 'athenic/chat.message.received',
      data: {
        message,
        userId: userId || 'anonymous',
        organisationId: organisationId || 'default',
        clientId,
        timestamp: new Date().toISOString(),
      },
    });
    console.log('Inngest event sent successfully');
    
    // Immediately return 202 Accepted, indicating the request is being processed
    console.log('Returning 202 response');
    return res.status(202).json({
      status: 'processing',
      message: 'Message received and is being processed',
      clientId, // Return the clientId to the client for later use
    });
  } catch (error: any) {
    console.error('Error processing chat message:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Endpoint for Inngest to send responses back to the client (will be handled via WebSocket)
app.post('/api/chat/response', (req: any, res: any) => {
  console.log('Chat response endpoint called');
  const { clientId, response, requiresE2B, e2bResult } = req.body;
  
  if (!clientId || !response) {
    console.log('Missing required parameters');
    return res.status(400).json({ error: 'Missing required parameters: clientId, response' });
  }
  
  // Update client session with response
  if (clientSessions.has(clientId)) {
    const session = clientSessions.get(clientId);
    session.lastResponse = response;
    session.requiresE2B = requiresE2B;
    session.e2bResult = e2bResult;
    session.processingState = requiresE2B ? 'awaiting_e2b' : 'completed';
    session.responseTimestamp = new Date().toISOString();
    clientSessions.set(clientId, session);
  } else {
    clientSessions.set(clientId, {
      lastResponse: response,
      requiresE2B,
      e2bResult,
      processingState: requiresE2B ? 'awaiting_e2b' : 'completed',
      responseTimestamp: new Date().toISOString()
    });
  }
  
  // Normally in a WebSocket setup, we would push this response directly to the connected client
  // For now, we'll just log it and return a success response
  console.log(`Response for client ${clientId}:`, response.substring(0, 100) + (response.length > 100 ? '...' : ''));
  console.log(`Requires E2B execution: ${requiresE2B ? 'Yes' : 'No'}`);
  
  // In the future, this endpoint would trigger a WebSocket message to the client
  // or store the response for retrieval by a polling mechanism
  console.log('Returning success response');
  res.json({ status: 'success', message: 'Response received' });
});

// Endpoint for notifying that E2B code execution has started
app.post('/api/chat/execution-started', (req: any, res: any) => {
  console.log('E2B execution started endpoint called');
  const { clientId, sandboxId } = req.body;
  
  if (!clientId || !sandboxId) {
    console.log('Missing required parameters');
    return res.status(400).json({ error: 'Missing required parameters: clientId, sandboxId' });
  }
  
  // Update client session with E2B execution information
  if (clientSessions.has(clientId)) {
    const session = clientSessions.get(clientId);
    session.sandboxId = sandboxId;
    session.processingState = 'e2b_executing';
    session.executionStartTimestamp = new Date().toISOString();
    clientSessions.set(clientId, session);
  } else {
    clientSessions.set(clientId, {
      sandboxId,
      processingState: 'e2b_executing',
      executionStartTimestamp: new Date().toISOString()
    });
  }
  
  console.log(`E2B execution started for client ${clientId} with sandbox ${sandboxId}`);
  
  // In a WebSocket setup, we would push this notification to the client
  // to trigger the terminal view
  
  res.json({ 
    status: 'success', 
    message: 'E2B execution start notification received',
    sandboxId
  });
});

// Add endpoint to get latest session state for a client (polling fallback)
app.get('/api/chat/session/:clientId', (req: any, res: any) => {
  const { clientId } = req.params;
  
  if (clientSessions.has(clientId)) {
    res.json(clientSessions.get(clientId));
  } else {
    res.status(404).json({ error: 'No session found for this client ID' });
  }
});

// Export function to start the server
export function startApiServer(port: number = 3000): ReturnType<typeof app.listen> {
  console.log(`Starting API server on port ${port}`);
  const server = app.listen(port, () => {
    console.log(`Backend API server listening on port ${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
  });
  return server;
}

// Start server if this file is run directly
if (require.main === module) {
  console.log('Running server directly');
  const port = parseInt(process.env.API_SERVER_PORT || '3000', 10);
  startApiServer(port);
}

console.log('Server module fully loaded and exported');
export default app; 