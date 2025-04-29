import { Inngest } from 'inngest';
import * as dotenv from 'dotenv';
import Logger from '../utils/logger';

// Load environment variables
dotenv.config();

// Create a logger specifically for the Inngest client
const logger = Logger.getLogger({
  component: 'InngestClient'
});

// Check if we're in dev mode
const isDev = process.env.NODE_ENV !== 'production';

// Initialize Inngest client
export const inngest = new Inngest({
  id: 'athenic-backend',
  // Use dev mode when running locally
  isDev: isDev,
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
      name: 'test/connection',
      data: {
        message: 'Testing Inngest connection',
        timestamp: new Date().toISOString(),
      },
    });
    logger.info('Successfully sent test event to Inngest!');
    return true;
  } catch (error) {
    logger.error('Failed to connect to Inngest:', error instanceof Error ? error.message : String(error));
    return false;
  }
} 