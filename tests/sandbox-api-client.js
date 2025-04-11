/**
 * Simple API Client for the E2B Sandbox API
 * 
 * This client allows users to test the sandbox API functionality without
 * needing to understand the internal architecture of Athenic.
 */

const readline = require('readline');
const axios = require('axios');

// Default API settings
const API_URL = process.env.ATHENIC_API_URL || 'http://localhost:54321/functions/v1/agent-orchestrator-api';
const ORGANIZATION_ID = process.env.ATHENIC_ORG_ID || 'test-organization';

// Create command line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Main function
async function main() {
  console.log('=== Athenic E2B Sandbox API Client ===');
  console.log(`API URL: ${API_URL}`);
  console.log(`Organization ID: ${ORGANIZATION_ID}`);
  console.log('Note: You can set ATHENIC_API_URL and ATHENIC_ORG_ID environment variables to customize\n');
  
  let running = true;
  
  while (running) {
    console.log('\nAvailable actions:');
    console.log('1. Execute shell command via API');
    console.log('2. Execute browser action via API');
    console.log('3. Execute file operation via API');
    console.log('4. Process natural language request');
    console.log('5. Exit');
    
    const answer = await askQuestion('Select an action (1-5): ');
    
    switch (answer) {
      case '1':
        await executeCommandAPI();
        break;
      case '2':
        await executeBrowserActionAPI();
        break;
      case '3':
        await executeFileOperationAPI();
        break;
      case '4':
        await processRequest();
        break;
      case '5':
        running = false;
        break;
      default:
        console.log('Invalid option, please try again.');
    }
  }
  
  rl.close();
}

// Helper function to ask a question
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Make an API request
async function callAPI(action, payload) {
  try {
    console.log(`\nSending API request...`);
    console.log('Action:', action);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const response = await axios.post(API_URL, {
      action,
      organizationId: ORGANIZATION_ID,
      payload
    });
    
    console.log('\nAPI Response:');
    console.log('Status:', response.status);
    console.log('Success:', response.data.success);
    
    if (response.data.data) {
      console.log('Data:', JSON.stringify(response.data.data, null, 2));
    }
    
    if (response.data.error) {
      console.log('Error:', response.data.error);
    }
    
    return response.data;
  } catch (error) {
    console.error('\nAPI Error:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    
    return { success: false, error: error.message };
  }
}

// Execute a shell command via API
async function executeCommandAPI() {
  const command = await askQuestion('Enter command to execute: ');
  
  return callAPI('execute-sandbox-command', {
    command
  });
}

// Execute a browser action via API
async function executeBrowserActionAPI() {
  console.log('\nBrowser Actions:');
  console.log('1. Navigate to URL');
  console.log('2. Click on element');
  console.log('3. Type text');
  console.log('4. Extract data');
  
  const actionChoice = await askQuestion('Select a browser action (1-4): ');
  
  let browserAction, parameters = {};
  
  switch (actionChoice) {
    case '1':
      browserAction = 'navigate';
      parameters.url = await askQuestion('Enter URL: ');
      break;
    case '2':
      browserAction = 'click';
      parameters.selector = await askQuestion('Enter CSS selector: ');
      break;
    case '3':
      browserAction = 'type';
      parameters.selector = await askQuestion('Enter CSS selector: ');
      parameters.text = await askQuestion('Enter text to type: ');
      break;
    case '4':
      browserAction = 'extract';
      parameters.script = await askQuestion('Enter JavaScript to execute: ');
      break;
    default:
      console.log('Invalid option, returning to main menu.');
      return;
  }
  
  return callAPI('execute-sandbox-command', {
    browserAction,
    parameters
  });
}

// Execute a file operation via API
async function executeFileOperationAPI() {
  console.log('\nFile Operations:');
  console.log('1. Write file');
  console.log('2. Read file');
  console.log('3. List directory');
  console.log('4. Remove file');
  
  const actionChoice = await askQuestion('Select a file operation (1-4): ');
  
  let fileAction, parameters = {};
  
  switch (actionChoice) {
    case '1':
      fileAction = 'write';
      parameters.path = await askQuestion('Enter file path: ');
      parameters.content = await askQuestion('Enter file content: ');
      break;
    case '2':
      fileAction = 'read';
      parameters.path = await askQuestion('Enter file path: ');
      break;
    case '3':
      fileAction = 'list';
      parameters.path = await askQuestion('Enter directory path: ');
      break;
    case '4':
      fileAction = 'remove';
      parameters.path = await askQuestion('Enter file path: ');
      break;
    default:
      console.log('Invalid option, returning to main menu.');
      return;
  }
  
  return callAPI('execute-sandbox-command', {
    fileAction,
    parameters
  });
}

// Process a natural language request
async function processRequest() {
  const request = await askQuestion('Enter your request: ');
  
  return callAPI('process-request', {
    request
  });
}

// Run the main function
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  callAPI,
  executeCommandAPI,
  executeBrowserActionAPI,
  executeFileOperationAPI,
  processRequest
}; 