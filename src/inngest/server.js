const { serve } = require('inngest/express');
const express = require('express');
const bodyParser = require('body-parser');
const { inngest } = require('./client');
// Import the functions from TypeScript file (transpiled at runtime)
const functions = require('./functions');

// Create express app for Inngest server
const app = express();

// Add middleware for parsing request body
app.use(bodyParser.json());

// Register all Inngest functions
// Filter out any undefined functions to prevent errors
const inngestFunctions = [
  functions.testFunction,
  functions.chatMessageHandler,
  functions.complexTaskHandler,
  // Add more functions here as they are created
].filter(Boolean);

// Create Inngest handler
const inngestHandler = serve({
  client: inngest,
  functions: inngestFunctions,
});

// Add Inngest handler to Express app
app.use('/api/inngest', inngestHandler);

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'inngest-server' });
});

// Export server start function
function startInngestServer(port = 8001) {
  app.listen(port, () => {
    console.log(`Inngest server listening on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`Inngest webhook URL: http://localhost:${port}/api/inngest`);
  });
}

// Start server if this file is run directly
if (require.main === module) {
  const port = parseInt(process.env.INNGEST_SERVER_PORT || '8001', 10);
  startInngestServer(port);
}

module.exports = { startInngestServer }; 