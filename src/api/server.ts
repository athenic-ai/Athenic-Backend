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
    
    // Generate a unique client ID for this session if not provided
    const clientId = req.body.clientId || uuid();
    
    // Initialize or update client session
    const sessionData = {
      lastMessage: message,
      lastTimestamp: new Date().toISOString(),
      processingState: 'submitted',
      clientId // Make sure clientId is included in session data
    };
    
    clientSessions.set(clientId, sessionData);
    
    // Log the incoming message and session state
    logger.info(`Received chat message from client ${clientId}: ${message.substring(0, 100) + (message.length > 100 ? '...' : '')}`);
    logger.debug(`Client session initialized: ${JSON.stringify(sessionData)}`);
    
    // Send the event to Inngest for processing
    logger.debug('Sending event to Inngest');
    try {
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
    } catch (inngestError: any) {
      logger.error(`Error sending event to Inngest: ${inngestError.message}`, { 
        stack: inngestError.stack,
        cause: inngestError.cause ? JSON.stringify(inngestError.cause) : 'No cause provided'
      });
      
      // Update session with the error
      if (clientSessions.has(clientId)) {
        const session = clientSessions.get(clientId);
        session.error = `Failed to process message: ${inngestError.message}`;
        session.processingState = 'error';
        session.errorTimestamp = new Date().toISOString();
        
        // Force session update
        clientSessions.set(clientId, { ...session });
      }
      
      // Don't return an error to the client, allow them to poll for the response
    }
    
    // Immediately return 202 Accepted, indicating the request is being processed
    logger.debug('Returning 202 response with clientId');
    return res.status(202).json({
      status: 'processing',
      message: 'Message received and is being processed',
      clientId, // Return the clientId to the client for later use
    });
  } catch (error: any) {
    logger.error(`Error processing chat message: ${error.message}`, {
      stack: error.stack,
      cause: error.cause ? JSON.stringify(error.cause) : 'No cause provided'
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      detail: error.stack ? error.stack.split('\n')[0] : 'No stack trace available'
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
    
    // Force session update by creating new object
    clientSessions.set(clientId, { ...session });
    logger.debug(`Updated existing session for client ${clientId}`, { processingState: session.processingState });
  } else {
    const newSession = {
      lastResponse: response,
      requiresE2B,
      e2bResult,
      processingState: requiresE2B ? 'awaiting_e2b' : 'completed',
      responseTimestamp: new Date().toISOString()
    };
    clientSessions.set(clientId, newSession);
    logger.debug(`Created new session for client ${clientId}`, { processingState: newSession.processingState });
  }
  
  // Log the detailed response and session state
  logger.info(`Response for client ${clientId}: ${response.substring(0, 100) + (response.length > 100 ? '...' : '')}`);
  logger.debug(`Client session updated`, { 
    clientId, 
    requiresE2B: requiresE2B ? 'Yes' : 'No',
    processingState: clientSessions.get(clientId).processingState
  });
  
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
  
  logger.debug('Execution started payload', { clientId, sandboxId });
  
  // Update client session with E2B execution information
  if (clientSessions.has(clientId)) {
    const session = clientSessions.get(clientId);
    session.sandboxId = sandboxId;
    session.processingState = 'e2b_executing';
    session.executionStartTimestamp = new Date().toISOString();
    
    // Force session update
    clientSessions.set(clientId, { ...session });
    logger.debug(`Updated existing session for client ${clientId} with sandbox info`, { 
      sandboxId, 
      processingState: session.processingState
    });
  } else {
    // Check if we need to create a new session or if there's a session with the sandboxId as clientId
    if (clientSessions.has(sandboxId)) {
      // We found a session with sandboxId as the key, update that instead
      logger.info(`Found a session with sandboxId ${sandboxId} as key, updating that instead of creating new session`);
      const session = clientSessions.get(sandboxId);
      session.clientId = clientId; // Cross-reference the client ID
      session.sandboxId = sandboxId;
      session.processingState = 'e2b_executing';
      session.executionStartTimestamp = new Date().toISOString();
      
      // Force session update
      clientSessions.set(sandboxId, { ...session });
      // Also create a reference with the clientId for easier lookup
      clientSessions.set(clientId, { ...session });
      
      logger.debug(`Updated existing session for sandboxId ${sandboxId} and cross-referenced with clientId ${clientId}`, { 
        processingState: session.processingState
      });
    } else {
      // Create a new session
      const newSession = {
        clientId,
        sandboxId,
        processingState: 'e2b_executing',
        executionStartTimestamp: new Date().toISOString()
      };
      clientSessions.set(clientId, newSession);
      logger.debug(`Created new session for client ${clientId} with sandbox info`, { 
        sandboxId, 
        processingState: newSession.processingState
      });
    }
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
    const session = clientSessions.get(clientId);
    logger.debug(`Session state requested for client ${clientId}`, { 
      processingState: session.processingState,
      hasResponse: !!session.lastResponse,
      hasSandboxId: !!session.sandboxId,
      responseAge: session.responseTimestamp ? 
        Math.round((Date.now() - new Date(session.responseTimestamp).getTime()) / 1000) + 's ago' : 
        'N/A'
    });
    
    // Always make sure clientId is part of the response data
    const responseData = {
      ...session,
      clientId
    };
    
    return res.json(responseData);
  } else {
    logger.warn(`No session found for client ID: ${clientId}`);
    return res.status(404).json({ error: 'No session found for this client ID' });
  }
});

// Add new NLP service endpoint for handling regular chat messages
app.post('/api/nlp/chat', async (req, res) => {
  try {
    const { message, userId, organisationId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Missing message parameter' });
    }
    
    logger.info(`Processing text message via NLP service`, {
      messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      userId,
      organisationId
    });
    
    // Simple responses for demonstration purposes
    // In production, this would connect to OpenAI or another LLM service
    let response;
    
    // Handle some basic questions
    if (message.match(/what('s| is) (\d+)\s*\+\s*(\d+)/i)) {
      const matches = message.match(/what('s| is) (\d+)\s*\+\s*(\d+)/i);
      if (matches && matches.length >= 4) {
        const num1 = parseInt(matches[2]);
        const num2 = parseInt(matches[3]);
        response = `${num1 + num2}`;
      }
    } else if (message.match(/what('s| is) (\d+)\s*\*\s*(\d+)/i)) {
      const matches = message.match(/what('s| is) (\d+)\s*\*\s*(\d+)/i);
      if (matches && matches.length >= 4) {
        const num1 = parseInt(matches[2]);
        const num2 = parseInt(matches[3]);
        response = `${num1 * num2}`;
      }
    } else if (message.toLowerCase().includes('your name')) {
      response = "I'm Athenic, your agentic AI assistant.";
    } else if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
      response = "Hello! How can I assist you today?";
    } else if (message.toLowerCase().includes('thank')) {
      response = "You're welcome!";
    } else {
      // Default response
      response = "I understand your message, but I need to be integrated with a proper LLM to provide a more specific response. This is a placeholder response that would normally be generated by connecting to an LLM API.";
    }
    
    res.json({
      status: 200,
      message: response
    });
  } catch (error) {
    logger.error('Error in NLP service', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    res.status(500).json({
      status: 500,
      message: "I encountered an error processing your request."
    });
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

// Remove the logger shutdown calls that might be causing premature exit
// Just end with exporting the app
export default app; 