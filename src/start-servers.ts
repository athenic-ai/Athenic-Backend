/**
 * Start script for Athenic Backend
 * This script starts the Inngest server only
 */

import { startInngestServer } from './inngest/server.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get port configurations from environment variables or use defaults
const INNGEST_PORT = parseInt(process.env.INNGEST_SERVER_PORT || '3001', 10);

// Start the servers
console.log('Starting Athenic Backend Inngest service...');

// Start the Inngest server
console.log(`Starting Inngest server on port ${INNGEST_PORT}...`);
const inngestServer = startInngestServer(INNGEST_PORT);

// Handle process termination
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down servers...');
  inngestServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down servers...');
  inngestServer.close();
  process.exit(0);
});

console.log(`
===================================
🚀 Athenic Backend Services Running:
-----------------------------------
Inngest UI: http://localhost:${INNGEST_PORT}/api/inngest
===================================
`); 