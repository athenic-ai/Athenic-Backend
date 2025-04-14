/**
 * E2B Sandbox API Client
 * 
 * This client allows testing of the E2B sandbox environment through
 * either the local API server or the Supabase Edge Function.
 */

// Import required modules
const axios = require('axios');
const readline = require('readline');

// API endpoints
const LOCAL_API_URL = 'http://localhost:3333/api';
const SUPABASE_API_URL = 'http://localhost:54321/functions/v1/agent-orchestrator-api';
const DEFAULT_ORG_ID = 'test-organization';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Main function to select API endpoint
async function main() {
  console.log('\n🚀 E2B Sandbox API Client');
  console.log('=========================\n');
  
  // Let user select which API to use
  console.log('Select API endpoint:');
  console.log('1. Local API Server (http://localhost:3333/api)');
  console.log('2. Supabase Edge Function (http://localhost:54321/functions/v1/agent-orchestrator-api)');
  console.log('3. Custom URL');
  
  const choice = await askQuestion('Enter choice (1-3): ');
  
  let apiUrl;
  switch (choice) {
    case '1':
      apiUrl = LOCAL_API_URL;
      break;
    case '2':
      apiUrl = SUPABASE_API_URL;
      break;
    case '3':
      apiUrl = await askQuestion('Enter custom API URL: ');
      break;
    default:
      console.log('Invalid choice, using Local API Server as default');
      apiUrl = LOCAL_API_URL;
  }
  
  console.log(`\nUsing API URL: ${apiUrl}`);
  console.log(`Organization ID: ${DEFAULT_ORG_ID}\n`);
  
  // Main menu loop
  await showMainMenu(apiUrl);
}

// Show main menu and handle user actions
async function showMainMenu(apiUrl) {
  let running = true;
  
  while (running) {
    console.log('\n📋 Available actions:');
    console.log('1. Execute shell command');
    console.log('2. Execute browser action');
    console.log('3. Execute file operation');
    console.log('4. Process natural language request');
    console.log('5. Exit');
    
    const choice = await askQuestion('\nEnter choice (1-5): ');
    
    try {
      switch (choice) {
        case '1':
          await executeShellCommand(apiUrl);
          break;
        case '2':
          await executeBrowserAction(apiUrl);
          break;
        case '3':
          await executeFileOperation(apiUrl);
          break;
        case '4':
          await processNaturalLanguageRequest(apiUrl);
          break;
        case '5':
          console.log('Exiting...');
          running = false;
          break;
        default:
          console.log('Invalid choice, please try again');
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      if (error.response) {
        console.error('API Response:', error.response.data);
      }
    }
  }
  
  rl.close();
}

// Execute a shell command in the sandbox
async function executeShellCommand(apiUrl) {
  const command = await askQuestion('\nEnter shell command to execute: ');
  
  console.log(`\nExecuting command: ${command}`);
  
  try {
    const response = await axios.post(apiUrl, {
      action: 'execute-sandbox-command',
      organizationId: DEFAULT_ORG_ID,
      payload: { command }
    });
    
    if (response.data.success) {
      const { exitCode, stdout, stderr } = response.data.data;
      
      console.log('\n=== Command Output ===');
      if (stdout) console.log(stdout);
      if (stderr) console.log('\nStderr:', stderr);
      console.log(`\nExit code: ${exitCode}`);
    } else {
      console.error(`❌ API Error: ${response.data.error}`);
    }
  } catch (error) {
    handleApiError(error);
  }
}

// Execute a browser action in the sandbox
async function executeBrowserAction(apiUrl) {
  console.log('\n🌐 Browser Actions:');
  console.log('1. Navigate to URL');
  console.log('2. Click element');
  console.log('3. Type text');
  console.log('4. Extract data');
  
  const actionChoice = await askQuestion('\nSelect browser action (1-4): ');
  
  try {
    let browserAction, parameters;
    
    switch (actionChoice) {
      case '1':
        browserAction = 'navigate';
        const url = await askQuestion('Enter URL to navigate to: ');
        parameters = { url };
        break;
      case '2':
        browserAction = 'click';
        const selector = await askQuestion('Enter element selector to click: ');
        parameters = { selector };
        break;
      case '3':
        browserAction = 'type';
        const inputSelector = await askQuestion('Enter input selector: ');
        const text = await askQuestion('Enter text to type: ');
        parameters = { selector: inputSelector, text };
        break;
      case '4':
        browserAction = 'extract';
        const script = await askQuestion('Enter JavaScript to evaluate: ');
        parameters = { script };
        break;
      default:
        console.log('Invalid choice');
        return;
    }
    
    console.log(`\nExecuting browser action: ${browserAction}`);
    
    const response = await axios.post(apiUrl, {
      action: 'execute-sandbox-command',
      organizationId: DEFAULT_ORG_ID,
      payload: { browserAction, parameters }
    });
    
    if (response.data.success) {
      console.log('\n=== Result ===');
      console.log(JSON.stringify(response.data.data, null, 2));
    } else {
      console.error(`❌ API Error: ${response.data.error}`);
    }
  } catch (error) {
    handleApiError(error);
  }
}

// Execute a file operation in the sandbox
async function executeFileOperation(apiUrl) {
  console.log('\n📂 File Operations:');
  console.log('1. Write file');
  console.log('2. Read file');
  console.log('3. List directory');
  console.log('4. Remove file/directory');
  
  const actionChoice = await askQuestion('\nSelect file operation (1-4): ');
  
  try {
    let fileAction, parameters;
    
    switch (actionChoice) {
      case '1':
        fileAction = 'write';
        const writePath = await askQuestion('Enter file path to write: ');
        const content = await askQuestion('Enter content to write: ');
        parameters = { path: writePath, content };
        break;
      case '2':
        fileAction = 'read';
        const readPath = await askQuestion('Enter file path to read: ');
        parameters = { path: readPath };
        break;
      case '3':
        fileAction = 'list';
        const listPath = await askQuestion('Enter directory path to list: ');
        parameters = { path: listPath };
        break;
      case '4':
        fileAction = 'remove';
        const removePath = await askQuestion('Enter path to remove: ');
        parameters = { path: removePath };
        break;
      default:
        console.log('Invalid choice');
        return;
    }
    
    console.log(`\nExecuting file operation: ${fileAction}`);
    
    const response = await axios.post(apiUrl, {
      action: 'execute-sandbox-command',
      organizationId: DEFAULT_ORG_ID,
      payload: { fileAction, parameters }
    });
    
    if (response.data.success) {
      console.log('\n=== Result ===');
      console.log(JSON.stringify(response.data.data, null, 2));
    } else {
      console.error(`❌ API Error: ${response.data.error}`);
    }
  } catch (error) {
    handleApiError(error);
  }
}

// Process a natural language request
async function processNaturalLanguageRequest(apiUrl) {
  const request = await askQuestion('\nEnter request to process: ');
  
  console.log(`\nProcessing request: ${request}`);
  
  try {
    const response = await axios.post(apiUrl, {
      action: 'process-request',
      organizationId: DEFAULT_ORG_ID,
      payload: { request }
    });
    
    if (response.data.success) {
      console.log('\n=== Response ===');
      console.log(JSON.stringify(response.data.data, null, 2));
    } else {
      console.error(`❌ API Error: ${response.data.error}`);
    }
  } catch (error) {
    handleApiError(error);
  }
}

// Helper function to handle API errors
function handleApiError(error) {
  console.error('❌ API Request Failed');
  
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.error(`Status: ${error.response.status}`);
    console.error('Response:', error.response.data);
  } else if (error.request) {
    // The request was made but no response was received
    console.error('No response received from server');
    console.error('Are you sure the API server is running?');
  } else {
    // Something happened in setting up the request that triggered an Error
    console.error('Error setting up request:', error.message);
  }
}

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Start the application
main().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
}); 