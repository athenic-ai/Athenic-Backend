import { inngest } from './client';
import Logger from '../utils/logger';

// Create a logger for this test script
const logger = Logger.getLogger({
  component: 'TestChatMessage'
});

/**
 * Simple script to test sending a chat message event
 * Run with: npx ts-node src/inngest/test-chat-message.ts
 */
async function main() {
  console.log('Sending test chat message event...');
  
  try {
    // Send a chat message event to Inngest
    await inngest.send({
      name: 'athenic/chat.message.received',
      data: {
        message: 'Hello, can you help me with some JavaScript code examples?',
        userId: 'test-user-123',
        sessionId: 'test-session-456',
      },
    });
    
    console.log('✅ Chat message event sent successfully!');
    console.log('Check the Inngest Dev UI to see the event and function execution.');
  } catch (error) {
    console.error('❌ Failed to send chat message event:', error);
  }
}

main().catch(console.error); 