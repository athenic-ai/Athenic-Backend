import express from "express";
import { serve } from "inngest/express";
import { fn, inngest, chatMessageFunction } from "./inngest.js";
import { dumpNetwork } from './networks/dumpNetwork.js';
import { createState } from '@inngest/agent-kit';
import { Logger } from '../utils/logger.js';

const logger = Logger.getLogger({
  component: 'InngestServer'
});

// Create the dump creation function directly here to avoid circular dependency
const handleDumpCreateRequested = inngest.createFunction(
  { id: 'handle-dump-create-request', name: 'Handle Dump Creation Request' },
  { event: 'dump/create.requested' },
  async ({ event, step }) => {
    const { userId, accountId, inputText, clientId } = event.data;
    logger.info(`Processing dump creation request for user ${userId}`, { clientId, inputText });

    // Create initial state for the agent network
    const initialState = createState({
      userId,
      accountId,
      inputText,
    });

    try {
      // Process the dump with the dumpNetwork
      const result = await step.run('process-dump-with-agent', async () => {
        return await dumpNetwork.run(inputText, {
          state: initialState,
        });
      });

      logger.info('Dump processed successfully', { 
        userId, 
        result: result ? 'Success' : 'No result'
      });

      return { success: true, result };
    } catch (error) {
      logger.error('Error processing dump', { 
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
);

/**
 * Creates and configures an Express server for Inngest
 * @param {number} port - The port to listen on (default: 3001)
 * @returns {express.Application} The configured Express app
 */
export function createInngestServer(port: number = 3001) {
  const app = express();

  // Important: ensure you add JSON middleware to process incoming JSON POST payloads.
  app.use(express.json({ limit: "50mb" }));

  app.use(
    // Expose the middleware on our recommended path at `/api/inngest`.
    "/api/inngest",
    serve({
      client: inngest,
      functions: [fn, chatMessageFunction, handleDumpCreateRequested],
    })
  );

  return app;
}

/**
 * Starts the Inngest server
 * @param {number} port - The port to listen on (default: from env or 3001)
 */
export function startInngestServer(port?: number) {
  const serverPort = port || parseInt(process.env.INNGEST_SERVER_PORT || "3001", 10);
  const app = createInngestServer(serverPort);
  
  const server = app.listen(serverPort, () => {
    console.log(`Inngest server listening on port ${serverPort}`);
    console.log(`Inngest UI available at: http://localhost:${serverPort}/api/inngest`);
  });
  
  // Setup graceful shutdown
  process.on('SIGINT', () => {
    console.log('SIGINT received, gracefully shutting down Inngest server');
    server.close(() => {
      console.log('Inngest server closed');
    });
  });
  
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, gracefully shutting down Inngest server');
    server.close(() => {
      console.log('Inngest server closed');
    });
  });
  
  return server;
}

// If this file is executed directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  startInngestServer();
} 