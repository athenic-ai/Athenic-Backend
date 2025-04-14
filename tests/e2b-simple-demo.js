/**
 * E2B Simple Demo
 * 
 * This script demonstrates how to use E2B to run a simple command.
 * It requires the E2B_API_KEY environment variable to be set.
 */

require('dotenv').config();
const e2b = require('e2b');
const { Sandbox } = e2b;

// Main function
async function main() {
  try {
    // Check if E2B_API_KEY is set
    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) {
      console.error('\nError: E2B_API_KEY environment variable is not set');
      console.error('Set the API key with: export E2B_API_KEY=your_api_key');
      process.exit(1);
    }
    
    console.log('Initializing E2B session...');
    
    // Create a sandbox with the base template
    const sandbox = await Sandbox.create('base', {
      apiKey,
      metadata: {
        ORGANIZATION_ID: 'test-organization',
        SESSION_ID: Date.now().toString()
      }
    });
    
    console.log(`Sandbox initialized successfully!`);
    
    // Run a simple 'ls' command
    console.log('\nRunning "ls -la" command:');
    
    const result = await sandbox.commands.run('ls -la');
    
    console.log('\nCommand output:');
    console.log(result.stdout);
    
    if (result.stderr) {
      console.error('\nErrors:');
      console.error(result.stderr);
    }
    
    console.log('\nExecution completed:');
    console.log(`Exit code: ${result.exitCode}`);
    
    // Close the sandbox
    console.log('\nCleaning up sandbox...');
    await sandbox.kill();
    console.log('Sandbox closed successfully!');
  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(console.error); 