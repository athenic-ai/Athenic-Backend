const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create express app for API server
const app = express();

// Add middleware
app.use(cors());
app.use(bodyParser.json());

// Map to store client-specific data
const clientSessions = new Map();

// Add a health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'api-server' });
});

// Add an endpoint for chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Generate or retrieve client ID from request
    let clientId = req.headers['x-client-id'];
    if (!clientId) {
      clientId = uuidv4();
      // In a real app, you might store this in a cookie or return it to the client
    }
    
    console.log(`Received chat message from client ${clientId}:`, message);
    
    // Call the mock chat handler in the Inngest server
    const inngestPort = process.env.INNGEST_SERVER_PORT || '8001';
    const inngestUrl = `http://localhost:${inngestPort}/api/mock-chat-handler`;
    
    // Send acknowledgment response first
    res.json({
      success: true,
      message: 'Chat message received and is being processed',
      clientId
    });
    
    // Then process the message asynchronously
    console.log(`Forwarding message to Inngest server at ${inngestUrl}`);
    const inngestResponse = await axios.post(inngestUrl, {
      message,
      clientId
    });
    
    const chatResponse = inngestResponse.data;
    console.log('Received response from Inngest:', chatResponse);
    
    // Store response for later retrieval if needed
    clientSessions.set(clientId, {
      lastMessage: message,
      lastResponse: chatResponse,
      requiresE2B: chatResponse.requiresE2B,
      timestamp: new Date().toISOString()
    });
    
    // In a real implementation, we would use WebSockets or SSE to push this response to the client
    console.log(`Chat response for client ${clientId} is ready`);
    
  } catch (error) {
    console.error('Error processing chat message:', error);
    // We've already sent a response, so we just log the error
  }
});

// Add endpoint to get latest response for a client (polling fallback)
app.get('/api/chat/response/:clientId', (req, res) => {
  const { clientId } = req.params;
  
  if (clientSessions.has(clientId)) {
    res.json(clientSessions.get(clientId));
  } else {
    res.status(404).json({ error: 'No session found for this client ID' });
  }
});

// Start server
let server = null;

// Export function to start the server
function startServer() {
  const port = parseInt(process.env.API_SERVER_PORT || '3000', 10);
  server = app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
  });
  
  return server;
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down API server...');
  if (server) {
    server.close(() => {
      console.log('API server closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer }; 