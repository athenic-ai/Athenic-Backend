/**
 * Standalone E2B Test Client
 * 
 * This client allows you to test E2B functionality directly without
 * requiring imports from the Supabase Edge Functions.
 */

const readline = require('readline');
const { Session } = require('e2b');

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

// Execute a shell command using E2B
async function executeCommand(session) {
  const command = await askQuestion('\nEnter command to execute: ');
  
  console.log(`\nExecuting command: ${command}`);
  
  let stdout = '';
  let stderr = '';
  
  try {
    const process = await session.process.start({
      cmd: command,
      onStdout: (data) => {
        stdout += data;
        console.log(data);
      },
      onStderr: (data) => {
        stderr += data;
        console.error(data);
      }
    });
    
    const exitCode = await process.wait();
    
    console.log('\nExecution Result:');
    console.log(`Exit code: ${exitCode}`);
    
    return {
      success: exitCode === 0,
      output: stdout,
      error: stderr,
      exitCode
    };
  } catch (error) {
    console.error('\nError:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Execute a file operation
async function executeFileOperation(session) {
  console.log('\nFile Operations:');
  console.log('1. Write file');
  console.log('2. Read file');
  console.log('3. List directory');
  console.log('4. Remove file');
  
  const actionChoice = await askQuestion('Select a file operation (1-4): ');
  
  try {
    switch (actionChoice) {
      case '1': {
        const path = await askQuestion('Enter file path: ');
        const content = await askQuestion('Enter file content: ');
        
        console.log(`\nWriting to file: ${path}`);
        await session.filesystem.write(path, content);
        console.log('File written successfully!');
        break;
      }
      case '2': {
        const path = await askQuestion('Enter file path: ');
        
        console.log(`\nReading file: ${path}`);
        const content = await session.filesystem.read(path);
        console.log('\nFile content:');
        console.log(content);
        break;
      }
      case '3': {
        const path = await askQuestion('Enter directory path: ');
        
        console.log(`\nListing directory: ${path}`);
        const files = await session.filesystem.list(path);
        console.log('\nFiles:');
        files.forEach(file => console.log(`- ${file}`));
        break;
      }
      case '4': {
        const path = await askQuestion('Enter file path: ');
        
        console.log(`\nRemoving file: ${path}`);
        await session.filesystem.remove(path);
        console.log('File removed successfully!');
        break;
      }
      default:
        console.log('Invalid option, returning to main menu.');
    }
  } catch (error) {
    console.error('\nError:', error.message);
  }
}

// Main function
async function main() {
  console.log('=== Athenic E2B Standalone Test Client ===');
  console.log('This client tests E2B functionality directly using the E2B SDK');
  
  try {
    // Check if E2B_API_KEY is set
    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) {
      console.log('\nWarning: E2B_API_KEY environment variable is not set.');
      console.log('You may encounter authentication issues when using live E2B services.');
      console.log('Set the API key with: export E2B_API_KEY=your_api_key');
    }
    
    // Get template name
    const template = await askQuestion('\nEnter E2B template name (default: base): ') || 'base';
    
    console.log(`\nInitializing E2B session with template: ${template}`);
    console.log('This may take a moment...');
    
    // Initialize E2B session
    const session = new Session({
      id: template,
      apiKey,
      envVars: {
        ORGANIZATION_ID: 'test-organization',
        SESSION_ID: Date.now().toString()
      }
    });
    
    await session.open();
    
    console.log(`\nSession initialized successfully! Session ID: ${session.id}`);
    
    let running = true;
    
    while (running) {
      console.log('\nAvailable actions:');
      console.log('1. Execute shell command');
      console.log('2. Execute file operation');
      console.log('3. Exit');
      
      const answer = await askQuestion('Select an action (1-3): ');
      
      switch (answer) {
        case '1':
          await executeCommand(session);
          break;
        case '2':
          await executeFileOperation(session);
          break;
        case '3':
          running = false;
          break;
        default:
          console.log('Invalid option, please try again.');
      }
    }
    
    console.log('\nCleaning up session...');
    await session.close();
    console.log('Session closed successfully!');
  } catch (error) {
    console.error('\nError:', error.message);
  } finally {
    rl.close();
  }
}

// Run the main function
main().catch(console.error); 