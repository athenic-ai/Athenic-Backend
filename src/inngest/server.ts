import { serve } from 'inngest/express';
import express from 'express';
import { inngest } from './client';
import { testFunction } from './functions';

// Create express app for Inngest server
const app = express();

// Register all Inngest functions
const inngestFunctions = [
  testFunction,
  // Add more functions here as they are created
];

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
export function startInngestServer(port: number = 8000): void {
  app.listen(port, () => {
    console.log(`Inngest server listening on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`Inngest webhook URL: http://localhost:${port}/api/inngest`);
  });
}

// Start server if this file is run directly
if (require.main === module) {
  const port = parseInt(process.env.INNGEST_SERVER_PORT || '8000', 10);
  startInngestServer(port);
} 