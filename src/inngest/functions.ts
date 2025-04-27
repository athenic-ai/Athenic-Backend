import { inngest } from './client';

// Define a simple test function that responds to the test connection event
export const testFunction = inngest.createFunction(
  { id: 'test-connection-handler' },
  { event: 'athenic/test.connection' },
  async ({ event, step }) => {
    // Log receipt of the event
    await step.run('log-event-receipt', () => {
      console.log('Received test connection event:', event);
      return { received: true };
    });

    // Process the event (simple echo for testing)
    const result = await step.run('process-test-event', () => {
      return {
        message: `Processed test event: ${event.data.message}`,
        receivedAt: new Date().toISOString(),
        originalTimestamp: event.data.timestamp,
      };
    });

    return result;
  }
); 