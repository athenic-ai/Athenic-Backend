// ESM-style imports
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Health endpoint
app.get('/health', (req, res) => {
  console.log('Health endpoint called');
  res.json({ status: 'healthy' });
});

// Chat endpoint
app.post('/chat', (req, res) => {
  console.log('Chat endpoint called with body:', req.body);
  const clientId = 'test-' + Math.floor(Math.random() * 1000000);
  
  // Store the message for future session polling
  sessions.set(clientId, {
    lastMessage: req.body.message,
    lastResponse: "This is a test response from the server!",
    processingState: 'completed',
    timestamp: new Date().toISOString()
  });
  
  res.status(202).json({ 
    status: 'processing', 
    clientId,
    message: 'Message received and is being processed'
  });
});

// Session tracking
const sessions = new Map();

// Session endpoint
app.get('/chat/session/:clientId', (req, res) => {
  const { clientId } = req.params;
  console.log('Session endpoint called for clientId:', clientId);
  
  if (sessions.has(clientId)) {
    res.json(sessions.get(clientId));
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Test ESM server running on port ${PORT}`);
  console.log(`Test health endpoint: http://localhost:${PORT}/health`);
  console.log(`Test chat endpoint: http://localhost:${PORT}/chat`);
}); 