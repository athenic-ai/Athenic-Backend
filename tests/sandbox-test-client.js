/**
 * Simple Test Client for the E2B Sandbox Environment
 * 
 * This test client allows users to test the sandbox functionality without
 * needing to understand the internal architecture of Athenic.
 */

const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

// Import the sandbox environment
const { SandboxEnvironment } = require('../supabase/functions/agents/sandboxEnvironment');

// Default security policy for the sandbox
const defaultSecurityPolicy = {
  allowedHosts: [
    'api.openai.com',
    'api.shopify.com',
    'supabase.co',
    'githubusercontent.com',
    'npmjs.org'
  ],
  allowedCommands: [
    'node',
    'npm',
    'npx',
    'curl',
    'wget',
    'git clone',
    'git checkout',
    'ls',
    'cat',
    'grep',
    'find',
    'echo',
    'mkdir',
    'cp',
    'mv'
  ],
  resourceLimits: {
    cpuLimit: 2,
    memoryMB: 2048,
    timeoutSec: 300
  }
};

// Mock E2B module for local testing
const mockE2B = {
  startSession: async (options) => {
    console.log(`Starting session with template: ${options.template}`);
    console.log(`Environment variables: ${JSON.stringify(options.envVars)}`);
    
    return {
      id: 'mock-session-' + Math.random().toString(36).substring(7),
      process: {
        start: async ({ cmd, onStdout, onStderr }) => {
          console.log(`Executing command: ${cmd}`);
          
          // Simulate command execution
          setTimeout(() => onStdout(`Output from ${cmd}`), 500);
          
          return {
            wait: async () => {
              return 0; // Successful exit code
            }
          };
        }
      },
      filesystem: {
        write: async (path, content) => {
          console.log(`Writing to ${path}: ${content.substring(0, 20)}...`);
          return true;
        },
        read: async (path) => {
          console.log(`Reading from ${path}`);
          return `Mock content from ${path}`;
        },
        list: async (path) => {
          console.log(`Listing contents of ${path}`);
          return ['file1.txt', 'file2.js', 'directory1/'];
        },
        remove: async (path) => {
          console.log(`Removing ${path}`);
          return true;
        }
      },
      browser: {
        launch: async () => {
          console.log('Launching browser');
        },
        goto: async (url) => {
          console.log(`Navigating to ${url}`);
          return { url, title: 'Mock Page Title' };
        },
        click: async (selector) => {
          console.log(`Clicking on ${selector}`);
          return { clicked: true, selector };
        },
        type: async (selector, text) => {
          console.log(`Typing '${text}' into ${selector}`);
          return { typed: true, selector, text };
        },
        evaluate: async (script) => {
          console.log(`Evaluating script: ${script}`);
          return { result: 'Mock script result' };
        },
        close: async () => {
          console.log('Closing browser');
        }
      },
      addFirewallRule: async (rule) => {
        console.log(`Adding firewall rule: ${JSON.stringify(rule)}`);
      },
      limitResources: async (limits) => {
        console.log(`Setting resource limits: ${JSON.stringify(limits)}`);
      },
      close: async () => {
        console.log('Closing session');
      }
    };
  }
};

// Mock Supabase client for local testing
const mockSupabaseClient = {
  from: (table) => ({
    insert: async (data) => {
      console.log(`Inserting into ${table}: ${JSON.stringify(data)}`);
      return { data: { id: 'mock-id-' + Math.random().toString(36).substring(7) }, error: null };
    },
    select: () => ({
      eq: () => ({
        single: async () => ({ data: {}, error: null })
      })
    })
  })
};

// Create command line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Main function
async function main() {
  console.log('=== Athenic E2B Sandbox Test Client ===');
  console.log('This client allows you to test the E2B sandbox functionality');
  console.log('Note: This is using a mock implementation for local testing\n');
  
  // Initialize sandbox
  console.log('Initializing sandbox environment...');
  
  const sandbox = new SandboxEnvironment(
    mockSupabaseClient,
    'test-organization',
    defaultSecurityPolicy
  );
  
  // Override the E2B module with our mock
  sandbox._E2B = mockE2B;
  
  try {
    await sandbox.initialize();
    console.log('Sandbox initialized successfully!\n');
    
    let running = true;
    
    while (running) {
      console.log('\nAvailable actions:');
      console.log('1. Execute shell command');
      console.log('2. Execute browser action');
      console.log('3. Execute file operation');
      console.log('4. View execution history');
      console.log('5. Exit');
      
      const answer = await askQuestion('Select an action (1-5): ');
      
      switch (answer) {
        case '1':
          await executeCommand(sandbox);
          break;
        case '2':
          await executeBrowserAction(sandbox);
          break;
        case '3':
          await executeFileOperation(sandbox);
          break;
        case '4':
          displayExecutionHistory(sandbox);
          break;
        case '5':
          running = false;
          break;
        default:
          console.log('Invalid option, please try again.');
      }
    }
    
    console.log('Cleaning up sandbox...');
    await sandbox.cleanup();
    console.log('Sandbox cleaned up successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    rl.close();
  }
}

// Helper function to ask a question
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Execute a shell command
async function executeCommand(sandbox) {
  const command = await askQuestion('Enter command to execute: ');
  
  console.log(`\nExecuting command: ${command}`);
  const result = await sandbox.executeCommand(command);
  
  console.log('\nResult:');
  console.log('Success:', result.success);
  
  if (result.output) {
    console.log('Output:', result.output);
  }
  
  if (result.error) {
    console.log('Error:', result.error);
  }
  
  console.log('Exit Code:', result.exitCode);
}

// Execute a browser action
async function executeBrowserAction(sandbox) {
  console.log('\nBrowser Actions:');
  console.log('1. Navigate to URL');
  console.log('2. Click on element');
  console.log('3. Type text');
  console.log('4. Extract data');
  
  const actionChoice = await askQuestion('Select a browser action (1-4): ');
  
  let action, params = {};
  
  switch (actionChoice) {
    case '1':
      action = 'navigate';
      params.url = await askQuestion('Enter URL: ');
      break;
    case '2':
      action = 'click';
      params.selector = await askQuestion('Enter CSS selector: ');
      break;
    case '3':
      action = 'type';
      params.selector = await askQuestion('Enter CSS selector: ');
      params.text = await askQuestion('Enter text to type: ');
      break;
    case '4':
      action = 'extract';
      params.script = await askQuestion('Enter JavaScript to execute: ');
      break;
    default:
      console.log('Invalid option, returning to main menu.');
      return;
  }
  
  console.log(`\nExecuting browser action: ${action}`);
  const result = await sandbox.executeBrowserAction(action, params);
  
  console.log('\nResult:');
  console.log('Success:', result.success);
  
  if (result.output) {
    console.log('Output:', result.output);
  }
  
  if (result.error) {
    console.log('Error:', result.error);
  }
}

// Execute a file operation
async function executeFileOperation(sandbox) {
  console.log('\nFile Operations:');
  console.log('1. Write file');
  console.log('2. Read file');
  console.log('3. List directory');
  console.log('4. Remove file');
  
  const actionChoice = await askQuestion('Select a file operation (1-4): ');
  
  let action, params = {};
  
  switch (actionChoice) {
    case '1':
      action = 'write';
      params.path = await askQuestion('Enter file path: ');
      params.content = await askQuestion('Enter file content: ');
      break;
    case '2':
      action = 'read';
      params.path = await askQuestion('Enter file path: ');
      break;
    case '3':
      action = 'list';
      params.path = await askQuestion('Enter directory path: ');
      break;
    case '4':
      action = 'remove';
      params.path = await askQuestion('Enter file path: ');
      break;
    default:
      console.log('Invalid option, returning to main menu.');
      return;
  }
  
  console.log(`\nExecuting file operation: ${action}`);
  const result = await sandbox.executeFileOperation(action, params);
  
  console.log('\nResult:');
  console.log('Success:', result.success);
  
  if (result.output) {
    console.log('Output:', result.output);
  }
  
  if (result.error) {
    console.log('Error:', result.error);
  }
}

// Display execution history
function displayExecutionHistory(sandbox) {
  const history = sandbox.getExecutionHistory();
  
  console.log('\nExecution History:');
  
  if (history.length === 0) {
    console.log('No executions recorded yet.');
    return;
  }
  
  history.forEach((entry, index) => {
    console.log(`\n--- Execution ${index + 1} ---`);
    console.log('Command:', entry.command);
    console.log('Timestamp:', entry.timestamp);
    console.log('Success:', entry.result.success);
    
    if (entry.result.output) {
      console.log('Output:', entry.result.output);
    }
    
    if (entry.result.error) {
      console.log('Error:', entry.result.error);
    }
  });
}

// Run the main function
main().catch(console.error); 