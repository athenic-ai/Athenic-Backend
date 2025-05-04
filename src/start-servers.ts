/**
 * Start script for Athenic Backend
 * This script starts both the Inngest server and the API server
 */

import { startInngestServer } from './inngest/server.js';
import { startApiServer } from './api/server.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get port configurations from environment variables or use defaults
const INNGEST_PORT = parseInt(process.env.INNGEST_SERVER_PORT || '8002', 10);
const API_PORT = parseInt(process.env.API_SERVER_PORT || '8001', 10);

// Make sure ports are different
if (INNGEST_PORT === API_PORT) {
  console.error(`ERROR: Inngest and API servers cannot use the same port (${INNGEST_PORT}). Setting API port to ${INNGEST_PORT + 1}`);
  process.env.API_SERVER_PORT = String(INNGEST_PORT + 1);
}

// Start the servers
console.log('Starting Athenic Backend services...');

// Start the Inngest server
console.log(`Starting Inngest server on port ${INNGEST_PORT}...`);
const inngestServer = startInngestServer(INNGEST_PORT);
console.log(`Inngest server started (or start function returned).`);

// Start the API server
console.log(`Attempting to call startApiServer for port ${API_PORT}...`);
const apiServer = startApiServer(API_PORT);
console.log(`Returned from startApiServer for port ${API_PORT}. Server instance: ${apiServer ? 'obtained' : 'null'}`);

// Handle process termination
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down servers...');
  inngestServer.close();
  apiServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down servers...');
  inngestServer.close();
  apiServer.close();
  process.exit(0);
});

console.log(`
===================================
🚀 Athenic Backend Services Running:
-----------------------------------
Inngest UI: http://localhost:${INNGEST_PORT}/api/inngest
API Server: http://localhost:${API_PORT}/api
===================================
`); 