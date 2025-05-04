// Using any types to avoid TypeScript issues

import { serve } from 'inngest/express';
import express from 'express';
import { inngest } from './client';
import { testFunction, complexTaskHandler, handleNewChatMessage } from './functions';
import Logger from '../utils/logger';
import ensureLogDirectories from '../utils/ensure-log-dirs';

// Ensure log directories exist
ensureLogDirectories();

// Create a logger specifically for the Inngest server
const logger = Logger.getLogger({
  component: 'InngestServer'
});

// Create express app for Inngest server
const app = express();

// Add middleware to parse JSON bodies
app.use(express.json());

// Register the Inngest functions
const inngestFunctions = [
  testFunction,
  complexTaskHandler,
  handleNewChatMessage,
  // Add more functions here as they are created
];

// Log function registrations more clearly
for (const fn of inngestFunctions) {
  if (fn) {
    logger.info(`Registering Inngest function: ${fn.id}`, { 
      functionId: fn.id,
      triggerEvent: fn.id || 'unknown'
    });
  } else {
    logger.warn('Found undefined function in registration list');
  }
}

logger.info(`Registering ${inngestFunctions.length} Inngest functions`);

// Create Inngest handler with signing disabled for local dev
const inngestHandler = serve({
  client: inngest,
  functions: inngestFunctions.filter(Boolean),
  signingKey: undefined, // Disable signing for local development
});

// Add Inngest handler to Express app
app.use('/api/inngest', inngestHandler);

// Add a health check endpoint
app.get('/health', (req, res) => {
  logger.debug('Health check endpoint called');
  res.json({ status: 'healthy', service: 'inngest-server' });
});

// Export server start function
export function startInngestServer(port: number = 8001): void {
  app.listen(port, () => {
    logger.info(`Inngest server listening on port ${port}`);
    logger.info(`Health check: http://localhost:${port}/health`);
    logger.info(`Inngest webhook URL: http://localhost:${port}/api/inngest`);
  });
}

// Start server if this file is run directly
if (require.main === module) {
  const port = parseInt(process.env.INNGEST_SERVER_PORT || '8001', 10);
  startInngestServer(port);
} 