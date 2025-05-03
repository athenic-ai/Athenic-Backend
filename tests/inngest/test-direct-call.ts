import { handleNewChatMessage } from '../../src/inngest/functions';
import Logger from '../../src/utils/logger';
import ensureLogDirectories from '../../src/utils/ensure-log-dirs';

// Ensure log directories exist
ensureLogDirectories();

// Create a logger for this test script
const logger = Logger.getLogger({
  component: 'TestDirectCall'
});

/**
 * Script to test calling the chat message handler function directly
 * Run with: npx ts-node tests/inngest/test-direct-call.ts
 */
async function main() {
  console.log('Directly calling the new chat message handler function (handleNewChatMessage)...');
  
  try {
    // Create a mock event and step object
    const mockEvent = {
      id: 'test-event-id-new',
      name: 'athenic/chat.message.received',
      data: {
        message: 'Hello, this is a test message for the new handler.',
        userId: 'test-user-direct-new',
        organisationId: 'test-org-direct-new',
        clientId: 'test-client-direct-new',
        timestamp: new Date().toISOString(),
      },
    };
    
    const mockStep = {
      run: async (id: string, fn: () => Promise<any>) => {
        console.log(`Running step: ${id}`);
        return await fn();
      },
      sleep: async (id: string, duration: string) => {
        console.log(`Sleeping for ${duration} at step: ${id}`);
        return true;
      },
      // Add other required methods if needed
    };
    
    // Create mock logger
    const mockLogger = {
      info: (...args: any[]) => console.log(...args),
      error: (...args: any[]) => console.error(...args),
      debug: (...args: any[]) => console.debug(...args),
      warn: (...args: any[]) => console.warn(...args),
    };
    
    // Call the function directly using the handler function
    // @ts-ignore - Ignoring type issues to directly test handler
    const result = await handleNewChatMessage.handler({ 
      event: mockEvent, 
      step: mockStep,
      logger: mockLogger
    });
    
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