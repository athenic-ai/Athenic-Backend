import { createState } from '@inngest/agent-kit';
import { inngest } from '../client.js';
import { dumpNetwork } from '../networks/dumpNetwork.js';
import { Logger } from '../../utils/logger.js';

// Create a logger for this function
const logger = Logger.getLogger({
  component: 'HandleDumpCreateRequested'
});

// Define the event data interface
interface DumpCreateRequestedEvent {
  userId: string;
  accountId: string;
  inputText: string;
  clientId?: string;
}

// Define the state interface
interface DumpAgentState {
  userId: string;
  accountId: string;
  inputText: string;
  potentialParents?: Array<{ id: string; title: string; description?: string }>;
  processedMetadata?: any;
}

/**
 * Inngest function to handle dump creation requests
 */
export const handleDumpCreateRequested = inngest.createFunction(
  { id: 'handle-dump-create-request', name: 'Handle Dump Creation Request' },
  { event: 'dump/create.requested' },
  async ({ event, step }) => {
    const { userId, accountId, inputText, clientId } = event.data as DumpCreateRequestedEvent;
    logger.info(`Processing dump creation request for user ${userId}`, { clientId, inputText });

    // Create initial state for the agent network
    const initialState = createState<DumpAgentState>({
      userId,
      accountId,
      inputText,
    });

    try {
      // Process the dump with the dumpNetwork
      const result = await step.run('process-dump-with-agent', async () => {
        return await dumpNetwork.run(inputText, {
          state: initialState,
        });
      });

      logger.info('Dump processed successfully', { 
        userId, 
        result: result ? 'Success' : 'No result'
      });

      return { success: true, result };
    } catch (error) {
      logger.error('Error processing dump', { 
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
); 