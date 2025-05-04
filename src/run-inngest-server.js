#!/usr/bin/env node

/**
 * Simple script to run the Inngest server directly
 * Uses ESM syntax for package.json type:module
 */

console.log('Starting Inngest server...');

// Run the Inngest server
import { spawn } from 'child_process';

// Start the server with tsx
const server = spawn('npx', ['tsx', 'src/inngest/server.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env } // Pass all environment variables
});

// Handle server exit
server.on('exit', (code) => {
  console.log(`Inngest server exited with code ${code}`);
});

// Handle signals to gracefully shutdown
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down Inngest server');
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down Inngest server');
  server.kill('SIGTERM');
}); 