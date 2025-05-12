import { createNetwork, createState } from '@inngest/agent-kit';
import { openai } from '@inngest/agent-kit';
import { ingestDumpAgent } from '../agents/ingestDumpAgent.js';

/**
 * Interface for the state of the dump ingest process
 */
export interface DumpIngestState {
  userId: string;
  accountId: string;
  inputText: string;
  clientId?: string;
}

// Define the agent state interface
export interface DumpAgentState {
  userId: string;
  accountId: string;
  inputText: string;
  potentialParents?: Array<{ id: string; title: string; description?: string }>;
  processedMetadata?: any;
}

/**
 * Network for processing dumps
 * Handles the ingestion of user input and creation of dump objects
 */
export const dumpNetwork = createNetwork({
  name: 'Dump Processing Network',
  agents: [ingestDumpAgent],
  defaultModel: openai({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini' }),
  // Simple router that directly calls the ingestDumpAgent
  defaultRouter: () => ingestDumpAgent,
});

/**
 * Run a dump ingestion session
 * 
 * @param inputText The user's input text
 * @param metadata Additional metadata about the user and session
 * @returns The result of the dump creation process
 */
export async function processDump(
  inputText: string, 
  metadata: { userId: string; accountId: string; clientId?: string }
) {
  console.log(`[processDump] Starting dump processing for user ${metadata.userId}`);
  
  const initialState: DumpIngestState = {
    userId: metadata.userId,
    accountId: metadata.accountId,
    inputText,
    clientId: metadata.clientId
  };
  
  const state = createState<DumpIngestState>(initialState);
  console.log(`[processDump] Created state object for input: "${inputText.substring(0, 30)}..."`);
  
  try {
    const response = await dumpNetwork.run(inputText, { state });
    console.log(`[processDump] Dump processing completed successfully`);
    return response;
  } catch (error) {
    console.error(`[processDump] Error processing dump: ${error}`);
    throw error;
  }
} 