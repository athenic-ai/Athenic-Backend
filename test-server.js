const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Health endpoint
app.get('/health', (req, res) => {
  console.log('Health endpoint called');
  res.json({ status: 'healthy' });
});

// Chat endpoint
app.post('/chat', (req, res) => {
  console.log('Chat endpoint called with body:', req.body);
  const clientId = 'test-' + Math.floor(Math.random() * 1000000);
  res.json({ 
    status: 'success', 
    clientId,
    message: 'Message received and is being processed'
  });
});

// Session endpoint
app.get('/chat/session/:clientId', (req, res) => {
  console.log('Session endpoint called for clientId:', req.params.clientId);
  res.json({
    clientId: req.params.clientId,
    lastResponse: 'This is a test response from the server!',
    processingState: 'completed',
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 8002;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Test health endpoint: http://localhost:${PORT}/health`);
}); 