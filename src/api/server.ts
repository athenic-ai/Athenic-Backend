import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import { v4 as uuid } from 'uuid';
import { inngest } from '../inngest/client';
import { createSupabaseClient } from './supabase';
import Logger from '../utils/logger';
import ensureLogDirectories from '../utils/ensure-log-dirs';
import fs from 'fs';
import path from 'path';

// Ensure log directories exist
ensureLogDirectories();

// Create a logger specifically for the API server
const logger = Logger.getLogger({
  component: 'ApiServer'
});

logger.info('Server module is being loaded');

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();
logger.info('Environment variables loaded');

// Create Express app
const app = express();
logger.info('Express app created');

// Set up API access log file
const logsDir = path.join(process.cwd(), 'logs');
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, `api-access-${new Date().toISOString().split('T')[0]}.log`), 
  { flags: 'a' }
);

// Use morgan for request logging to our file
app.use(morgan('combined', { 
  stream: accessLogStream
}));

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev')); // Console logging
logger.info('Middleware configured');

// Store active client sessions
const clientSessions = new Map();

// Health check endpoint
app.get('/api/health', (req: any, res: any) => {
  logger.debug('Health check endpoint called');
  res.json({ status: 'healthy', service: 'backend-api' });
});

// Chat endpoint - handles messages from the Flutter app
app.post('/api/chat', async (req: any, res: any) => {
  logger.info('Chat endpoint called');
  try {
    const { message, userId, organisationId } = req.body;
    
    // Validate required parameters
    if (!message) {
      logger.warn('Missing message parameter');
      return res.status(400).json({ error: 'Missing required parameter: message' });
    }
    
    // Validate auth token if provided
    const authHeader = req.headers.authorization;
    if (authHeader) {
      logger.debug('Auth header found, validating token');
      // Extract the token
      const token = authHeader.split(' ')[1];
      
      // Initialize Supabase client
      const supabase = createSupabaseClient();
      
      // Verify the token
      logger.debug('Verifying token with Supabase');
      const { data, error } = await supabase.auth.getUser(token);
      
      if (error) {
        logger.warn(`Auth error: ${error.message}`);
        return res.status(401).json({ error: 'Invalid authentication token' });
      }
      
      logger.info(`Authenticated user: ${data.user.id}`);
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
    logger.info(`Received chat message from client ${clientId}: ${message.substring(0, 100) + (message.length > 100 ? '...' : '')}`);
    
    // Send the event to Inngest for processing
    logger.debug('Sending event to Inngest');
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
    logger.info('Inngest event sent successfully');
    
    // Immediately return 202 Accepted, indicating the request is being processed
    logger.debug('Returning 202 response');
    return res.status(202).json({
      status: 'processing',
      message: 'Message received and is being processed',
      clientId, // Return the clientId to the client for later use
    });
  } catch (error: any) {
    logger.error(`Error processing chat message: ${error.message}`, error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Endpoint for Inngest to send responses back to the client (will be handled via WebSocket)
app.post('/api/chat/response', (req: any, res: any) => {
  logger.info('Chat response endpoint called');
  const { clientId, response, requiresE2B, e2bResult } = req.body;
  
  if (!clientId || !response) {
    logger.warn('Missing required parameters');
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
  logger.info(`Response for client ${clientId}: ${response.substring(0, 100) + (response.length > 100 ? '...' : '')}`);
  logger.debug(`Requires E2B execution: ${requiresE2B ? 'Yes' : 'No'}`);
  
  // In the future, this endpoint would trigger a WebSocket message to the client
  // or store the response for retrieval by a polling mechanism
  logger.debug('Returning success response');
  res.json({ status: 'success', message: 'Response received' });
});

// Endpoint for notifying that E2B code execution has started
app.post('/api/chat/execution-started', (req: any, res: any) => {
  logger.info('E2B execution started endpoint called');
  const { clientId, sandboxId } = req.body;
  
  if (!clientId || !sandboxId) {
    logger.warn('Missing required parameters');
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
  
  logger.info(`E2B execution started for client ${clientId} with sandbox ${sandboxId}`);
  
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
    logger.debug(`Session state requested for client ${clientId}`);
    res.json(clientSessions.get(clientId));
  } else {
    logger.warn(`No session found for client ID: ${clientId}`);
    res.status(404).json({ error: 'No session found for this client ID' });
  }
});

// Export function to start the server
export function startApiServer(port: number = 3000): ReturnType<typeof app.listen> {
  logger.info(`Starting API server on port ${port}`);
  const server = app.listen(port, () => {
    logger.info(`Backend API server listening on port ${port}`);
    logger.info(`Health check: http://localhost:${port}/api/health`);
  });
  
  // Setup graceful shutdown
  process.on('SIGINT', () => {
    logger.info('SIGINT received, gracefully shutting down API server');
    accessLogStream.end();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, gracefully shutting down API server');
    accessLogStream.end();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
  
  return server;
}

// If this file is executed directly, start the server
if (require.main === module) {
  const port = parseInt(process.env.API_SERVER_PORT || '3000', 10);
  startApiServer(port);
}

logger.info('Server module fully loaded and exported');
export default app; 