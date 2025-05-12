import { createState } from '@inngest/agent-kit';
import { inngest } from '../client.js';
import { dumpNetwork } from '../networks/dumpNetwork.js';

/**
 * Inngest function to handle dump creation requests
 */
export const handleDumpCreateRequested = inngest.createFunction(
  { id: 'handle-dump-create-request', name: 'Handle Dump Creation Request' },
  { event: 'dump/create.requested' },
  async ({ event, step, logger }) => {
    const { userId, accountId, inputText, clientId } = event.data;
    logger.info(`Processing dump creation request for user ${userId}`, { clientId, inputText });

    // Create initial state for the agent network
    const initialState = createState({
      userId,
      accountId,
      inputText,
    });

    try {
      // Process the dump with the dumpNetwork
      const result = await step.run('process-dump-with-network', async () => {
        return await dumpNetwork.run(inputText, { state: initialState });
      });

      logger.info('Dump processing finished', { 
        clientId,
        success: result.success,
        dumpId: result.dumpId
      });
      
      // Notify of completion (optional)
      await step.sendEvent('notify-dump-creation-complete', {
        name: 'dump/creation.completed',
        data: { 
          clientId,
          success: true,
          dumpId: result.dumpId,
          accountId,
          userId
        }
      });

      return { 
        status: 'success', 
        result,
        clientId
      };
    } catch (error) {
      logger.error('Error processing dump creation:', { 
        error: error.message, 
        stack: error.stack,
        clientId
      });
      
      // Notify of failure (optional)
      await step.sendEvent('notify-dump-creation-failed', {
        name: 'dump/creation.failed',
        data: { 
          clientId,
          success: false, 
          error: error.message,
          accountId,
          userId
        }
      });
      
      return {
        status: 'error',
        error: error.message,
        clientId
      };
    }
  }
); 