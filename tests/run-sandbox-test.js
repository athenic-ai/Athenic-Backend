#!/usr/bin/env node

/**
 * E2B Sandbox Test Launcher
 * 
 * This script helps launch the local API server and API client
 * for testing the E2B sandbox environment.
 */

const { spawn, execSync } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Constants
const SERVER_SCRIPT = path.join(__dirname, 'local-api-server.js');
const CLIENT_SCRIPT = path.join(__dirname, 'sandbox-api-client.js');
const REQUIRED_NODE_VERSION = 18;

// Check Node.js version and use nvm if needed
function checkNodeVersion() {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0], 10);
  
  console.log(`Current Node.js version: ${nodeVersion}`);
  
  if (majorVersion < REQUIRED_NODE_VERSION) {
    console.log(`⚠️ Node.js version ${nodeVersion} is below the recommended version ${REQUIRED_NODE_VERSION}`);
    console.log('Attempting to switch to Node.js 18 using nvm...');
    
    try {
      execSync('nvm use 18', { stdio: 'inherit' });
      console.log('✅ Successfully switched to Node.js 18');
    } catch (error) {
      console.log(`❌ Could not switch Node.js version: ${error.message}`);
      console.log('Please run "nvm use 18" manually before continuing.');
      
      const shouldContinue = readline.keyInYNStrict('Continue anyway?');
      if (!shouldContinue) {
        console.log('Exiting...');
        process.exit(1);
      }
    }
  } else {
    console.log(`✅ Node.js version ${nodeVersion} is compatible`);
  }
}

// Main function
async function main() {
  console.log('\n🚀 E2B Sandbox Test Launcher');
  console.log('===========================\n');
  
  // Check Node.js version
  checkNodeVersion();
  
  // Check if E2B_API_KEY is set
  if (!process.env.E2B_API_KEY) {
    console.log('⚠️  Warning: E2B_API_KEY environment variable is not set');
    console.log('You can set it with: export E2B_API_KEY=your_api_key\n');
    
    const setApiKey = await askQuestion('Would you like to set an API key now? (y/n): ');
    if (setApiKey.toLowerCase() === 'y') {
      const apiKey = await askQuestion('Enter your E2B API key: ');
      process.env.E2B_API_KEY = apiKey;
      console.log('API key set for this session\n');
    } else {
      console.log('Continuing without setting API key. Some features may not work correctly.\n');
    }
  } else {
    const maskedKey = maskApiKey(process.env.E2B_API_KEY);
    console.log(`✅ E2B_API_KEY is set: ${maskedKey}\n`);
  }
  
  console.log('Select an option:');
  console.log('1. Start local API server');
  console.log('2. Start sandbox API client');
  console.log('3. Start both server and client');
  console.log('4. Exit');
  
  const choice = await askQuestion('\nEnter choice (1-4): ');
  
  switch (choice) {
    case '1':
      await startServer();
      break;
    case '2':
      await startClient();
      break;
    case '3':
      await startBoth();
      break;
    case '4':
      console.log('Exiting...');
      rl.close();
      break;
    default:
      console.log('Invalid choice');
      rl.close();
  }
}

// Start local API server
async function startServer() {
  console.log('\n📡 Starting local API server...');
  
  // Ask for port
  const port = await askQuestion('Enter port (default: 3333): ') || '3333';
  process.env.PORT = port;
  
  const server = spawn('node', [SERVER_SCRIPT], {
    stdio: 'inherit',
    env: process.env
  });
  
  console.log(`\n✅ Server started on port ${port}`);
  console.log('Press Ctrl+C to stop the server');
  
  // Handle server exit
  server.on('exit', (code) => {
    console.log(`\nServer exited with code ${code}`);
    rl.close();
  });
}

// Start sandbox API client
async function startClient() {
  console.log('\n🖥️  Starting sandbox API client...');
  
  const client = spawn('node', [CLIENT_SCRIPT], {
    stdio: 'inherit',
    env: process.env
  });
  
  // Handle client exit
  client.on('exit', (code) => {
    console.log(`\nClient exited with code ${code}`);
    rl.close();
  });
}

// Start both server and client
async function startBoth() {
  console.log('\n🚀 Starting both server and client...');
  
  // Ask for port
  const port = await askQuestion('Enter server port (default: 3333): ') || '3333';
  process.env.PORT = port;
  
  console.log('\n📡 Starting local API server...');
  const server = spawn('node', [SERVER_SCRIPT], {
    detached: true,
    stdio: 'ignore',
    env: process.env
  });
  
  // Detach the server process so it runs in background
  server.unref();
  
  console.log(`✅ Server started on port ${port}`);
  console.log('Server is running in the background\n');
  
  // Give server a moment to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('🖥️  Starting sandbox API client...');
  const client = spawn('node', [CLIENT_SCRIPT], {
    stdio: 'inherit',
    env: process.env
  });
  
  // Handle client exit
  client.on('exit', (code) => {
    console.log(`\nClient exited with code ${code}`);
    console.log('Server is still running in the background');
    console.log('You may need to manually terminate it with: pkill -f local-api-server.js');
    rl.close();
  });
}

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Helper function to mask API key
function maskApiKey(apiKey) {
  if (!apiKey) return 'Not set';
  if (apiKey.length <= 8) return '********';
  
  const firstChars = apiKey.substring(0, 4);
  const lastChars = apiKey.substring(apiKey.length - 4);
  return `${firstChars}...${lastChars}`;
}

// Start the application
main().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
}); 