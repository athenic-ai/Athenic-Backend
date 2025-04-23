import { Sandbox } from '@e2b/code-interpreter';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Print available methods on Sandbox
console.log('Static methods on Sandbox:');
console.log(Object.getOwnPropertyNames(Sandbox));

// Print API key
console.log('API Key is set:', process.env.E2B_API_KEY ? 'Yes' : 'No');
console.log('API Key:', process.env.E2B_API_KEY ? `${process.env.E2B_API_KEY.substring(0, 5)}...` : 'Not set');

async function testSandbox() {
  try {
    // Create sandbox without specifying a template to use the default
    console.log('Creating sandbox...');
    const sandbox = await Sandbox.create();
    
    // Print instance properties
    console.log('Instance properties:');
    console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(sandbox)));
    
    // Log sandbox properties
    console.log('Sandbox object keys:', Object.keys(sandbox));
    
    // Print the sandbox object to see its structure
    console.log('Sandbox object (stringified):', JSON.stringify(sandbox, null, 2));
    
    // Try to list available methods
    const proto = Object.getPrototypeOf(sandbox);
    console.log('Available methods:');
    for (const prop of Object.getOwnPropertyNames(proto)) {
      if (typeof proto[prop] === 'function') {
        console.log(`- ${prop}: ${proto[prop].toString().slice(0, 50)}...`);
      }
    }

    // Test running a simple piece of code
    console.log('Running test code...');
    const execution = await sandbox.runCode('print("Hello world")');
    console.log('Execution result:', execution);

    // Clean up
    await sandbox.kill();
    console.log('Sandbox killed');
  } catch (error) {
    console.error('Error:', error);
  }
}

testSandbox().catch(console.error); 