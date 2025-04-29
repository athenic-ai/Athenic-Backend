import { chatMessageHandler } from './functions';
import Logger from '../utils/logger';
import ensureLogDirectories from '../utils/ensure-log-dirs';

// Ensure log directories exist
ensureLogDirectories();

// Create a logger for this test script
const logger = Logger.getLogger({
  component: 'TestDirectCall'
});

/**
 * Script to test calling the chat message handler function directly
 * Run with: npx ts-node src/inngest/test-direct-call.ts
 */
async function main() {
  console.log('Directly calling chatMessageHandler function...');
  
  try {
    // Create a mock event and step object
    const mockEvent = {
      id: 'test-event-id',
      name: 'athenic/chat.message.received',
      data: {
        message: 'Hello, can you help me with some JavaScript code examples?',
        userId: 'test-user-direct',
        clientId: 'test-client-direct',
        timestamp: new Date().toISOString(),
      },
    };
    
    const mockStep = {
      run: async (id: string, fn: () => Promise<any>) => {
        console.log(`Running step: ${id}`);
        return await fn();
      },
    };
    
    // Call the function directly using the handler function
    // @ts-ignore - Ignoring type issues to directly test handler
    const result = await chatMessageHandler.handler({ event: mockEvent, step: mockStep });
    
    console.log('✅ Function called successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error calling function:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
}); 