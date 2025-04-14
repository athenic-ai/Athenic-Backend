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

// Create command line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask a question
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Create a mock Supabase client for testing
const mockSupabaseClient = {
  from: (table) => ({
    insert: (data) => {
      console.log(`[Mock Supabase] Inserting into ${table}:`, data);
      return Promise.resolve({ data: null, error: null });
    },
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
        gt: () => Promise.resolve({ data: null, error: null })
      })
    }),
    update: (data) => {
      console.log(`[Mock Supabase] Updating ${table}:`, data);
      return Promise.resolve({ data: null, error: null });
    }
  }),
  rpc: (proc, params) => {
    console.log(`[Mock Supabase] Calling RPC ${proc}:`, params);
    return Promise.resolve({ data: [], error: null });
  }
};

// Create a mock E2B module for testing without actual E2B API calls
const mockE2B = {
  startSession: async ({ template, envVars }) => {
    console.log(`[Mock E2B] Starting session with template: ${template}, env vars:`, envVars);
    
    return {
      id: `mock-session-${Date.now()}`,
      close: async () => console.log('[Mock E2B] Session closed'),
      
      process: {
        start: async ({ cmd, onStdout, onStderr, env, cwd }) => {
          console.log(`[Mock E2B] Running command: ${cmd}`);
          console.log(`[Mock E2B] Environment: ${JSON.stringify(env || {})}`);
          console.log(`[Mock E2B] Working directory: ${cwd || '/home/user'}`);
          
          // Simulate stdout/stderr based on the command
          setTimeout(() => {
            if (onStdout) onStdout(`Output from: ${cmd}\n`);
            
            // Simulate different commands
            if (cmd.startsWith('ls')) {
              onStdout('documents\ndownloads\nprojects\n');
            } else if (cmd.startsWith('cat')) {
              onStdout('This is the content of the file.\n');
            } else if (cmd.startsWith('echo')) {
              onStdout(`${cmd.substring(5)}\n`);
            } else if (cmd.includes('error')) {
              if (onStderr) onStderr(`Error: Command failed: ${cmd}\n`);
            }
          }, 100);
          
          return {
            id: `process-${Date.now()}`,
            wait: async () => {
              console.log('[Mock E2B] Waiting for process completion');
              return cmd.includes('error') ? 1 : 0;
            },
            kill: async () => console.log('[Mock E2B] Process killed')
          };
        },
        run: async ({ cmd, onStdout, onStderr, env, cwd }) => {
          console.log(`[Mock E2B] Running command: ${cmd}`);
          
          // Simulate stdout/stderr based on the command
          if (onStdout) onStdout(`Output from: ${cmd}\n`);
          
          let stdout = '';
          let stderr = '';
          
          // Simulate different commands
          if (cmd.startsWith('ls')) {
            stdout = 'documents\ndownloads\nprojects\n';
            if (onStdout) onStdout(stdout);
          } else if (cmd.startsWith('cat')) {
            stdout = 'This is the content of the file.\n';
            if (onStdout) onStdout(stdout);
          } else if (cmd.startsWith('echo')) {
            stdout = `${cmd.substring(5)}\n`;
            if (onStdout) onStdout(stdout);
          } else if (cmd.includes('error')) {
            stderr = `Error: Command failed: ${cmd}\n`;
            if (onStderr) onStderr(stderr);
          }
          
          return {
            exitCode: cmd.includes('error') ? 1 : 0,
            stdout,
            stderr
          };
        }
      },
      
      filesystem: {
        write: async (path, content) => {
          console.log(`[Mock E2B] Writing file: ${path}`);
          console.log(`[Mock E2B] Content: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
        },
        read: async (path) => {
          console.log(`[Mock E2B] Reading file: ${path}`);
          return `Mock content of ${path}`;
        },
        list: async (path) => {
          console.log(`[Mock E2B] Listing directory: ${path}`);
          return ['file1.txt', 'file2.md', 'directory1', 'directory2'];
        },
        remove: async (path) => {
          console.log(`[Mock E2B] Removing file/directory: ${path}`);
        }
      },
      
      browser: null,
      
      addFirewallRule: async (rule) => {
        console.log(`[Mock E2B] Adding firewall rule:`, rule);
      },
      
      limitResources: async (limits) => {
        console.log(`[Mock E2B] Setting resource limits:`, limits);
      }
    };
  }
};

// Execute a shell command using the sandbox
async function executeCommand(sandbox) {
  const command = await askQuestion('\nEnter command to execute: ');
  
  console.log(`\nExecuting command: ${command}`);
  const result = await sandbox.executeCommand(command);
  
  console.log('\nExecution Result:');
  console.log(`Success: ${result.success}`);
  
  if (result.output) {
    console.log('\nOutput:');
    console.log(result.output);
  }
  
  if (result.error) {
    console.log('\nError:');
    console.log(result.error);
  }
  
  console.log(`Exit code: ${result.exitCode || 'unknown'}`);
}

// Execute a browser action using the sandbox
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
  
  console.log('\nExecution Result:');
  console.log(`Success: ${result.success}`);
  
  if (result.output) {
    console.log('\nOutput:');
    console.log(result.output);
  }
  
  if (result.error) {
    console.log('\nError:');
    console.log(result.error);
  }
}

// Execute a file operation using the sandbox
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
  
  console.log('\nExecution Result:');
  console.log(`Success: ${result.success}`);
  
  if (result.output) {
    console.log('\nOutput:');
    console.log(result.output);
  }
  
  if (result.error) {
    console.log('\nError:');
    console.log(result.error);
  }
}

// Display execution history
function displayExecutionHistory(sandbox) {
  const history = sandbox.getExecutionHistory();
  
  console.log('\nExecution History:');
  
  if (history.length === 0) {
    console.log('No commands executed yet.');
    return;
  }
  
  history.forEach((entry, index) => {
    console.log(`\n[${index + 1}] Command: ${entry.command}`);
    console.log(`    Time: ${entry.timestamp.toISOString()}`);
    console.log(`    Success: ${entry.result.success}`);
    
    if (entry.result.output) {
      console.log(`    Output: ${entry.result.output.substring(0, 50)}${entry.result.output.length > 50 ? '...' : ''}`);
    }
    
    if (entry.result.error) {
      console.log(`    Error: ${entry.result.error.substring(0, 50)}${entry.result.error.length > 50 ? '...' : ''}`);
    }
  });
}

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

// Run the main function
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  SandboxEnvironment,
  mockE2B,
  mockSupabaseClient
}; 