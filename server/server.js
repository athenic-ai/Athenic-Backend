/**
 * Athenic Backend Server
 * 
 * Main server entry point for the Athenic backend.
 */

// Add polyfills for fetch API in Node.js
global.fetch = require('node-fetch');
global.Request = require('node-fetch').Request;
global.Response = require('node-fetch').Response;
global.Headers = require('node-fetch').Headers;

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');

// Import routes
const sandboxRoutes = require('./routes/sandbox');

// Create Express app
const app = express();
const port = process.env.PORT || 3333;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev'));

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/sandbox', sandboxRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// Start server
app.listen(port, () => {
  console.log(`⚡ Athenic Backend Server running on port ${port}`);
  console.log(`🚀 E2B API Key: ${process.env.E2B_API_KEY ? 'Configured ✅' : 'Not configured ❌'}`);
  
  if (!process.env.E2B_API_KEY) {
    console.log(`💡 Run 'source ./scripts/setup-e2b-env.sh' to configure your E2B API key`);
  }
});

module.exports = app; 