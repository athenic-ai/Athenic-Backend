import express from "express";
import { serve } from "inngest/express";
import { fn, inngest, chatMessageFunction, handleDumpCreateRequested } from "./inngest.js";
import { Logger } from '../utils/logger';

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