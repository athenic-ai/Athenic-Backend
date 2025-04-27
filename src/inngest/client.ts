import { Inngest } from 'inngest';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Inngest client
export const inngest = new Inngest({
  id: 'athenic-backend',
  // Optional: Specify Inngest API key if you're using Inngest Cloud
  // (You would add this to your .env file)
  apiKey: process.env.INNGEST_API_KEY,
  // Optional: Specify an event key which is used to sign events
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// Export a simple function to test connectivity
export async function testInngestConnection(): Promise<boolean> {
  try {
    // Send a test event to Inngest
    await inngest.send({
      name: 'athenic/test.connection',
      data: {
        message: 'Testing Inngest connection',
        timestamp: new Date().toISOString(),
      },
    });
    console.log('Successfully sent test event to Inngest!');
    return true;
  } catch (error) {
    console.error('Failed to connect to Inngest:', error);
    return false;
  }
} 