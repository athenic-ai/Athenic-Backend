import { createNetwork, createState, openai } from '@inngest/agent-kit';
import { chatAgent } from '../agents/chatAgent.js';

/**
 * Type definition for chat state
 */
export interface ChatState {
  userId: string;
  organisationId: string;
  clientId: string;
  messageHistory: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }[];
}

/**
 * Interface for network response structure
 */
export interface NetworkResponse {
  state?: {
    results?: Array<{
      agentName: string;
      output?: Array<{ type: string; content: any; text?: string }>;
      // Add other potential fields from AgentKit results if needed
    }>;
    // Add other state properties if needed
  };
  // Add other top-level properties returned by chatNetwork.run if needed
}

/**
 * Chat network for handling user messages
 */
export const chatNetwork = createNetwork({
  name: 'Chat Network',
  agents: [chatAgent],
  defaultModel: openai({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
  }),
});

// Restore the createTimeout function
function createTimeout(ms: number) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${ms} ms`)), ms);
  });
}

/**
 * Run a chat session in the network
 * @param message The user's message
 * @param metadata Additional metadata about the user and session
 * @returns The AI response
 */
export async function runChatSession(
  message: string, 
  metadata: { userId: string; organisationId: string; clientId: string; }
): Promise<NetworkResponse> {
  console.log(`[runChatSession] Starting chat session for user ${metadata.userId}`);
  
  const initialState: ChatState = {
    userId: metadata.userId,
    organisationId: metadata.organisationId,
    clientId: metadata.clientId,
    messageHistory: [{
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    }]
  };
  
  const state = createState<ChatState>(initialState);
  console.log(`[runChatSession] Created state object for client ${metadata.clientId}`);

  console.log(`[runChatSession] Running chat network with message: "${message.substring(0, 30)}..."`);
  
  // Restore Promise.race for timeout
  const TIMEOUT_MS = 30000; // 30 seconds timeout
  const response = await Promise.race([
    chatNetwork.run(message, { state }),
    createTimeout(TIMEOUT_MS)
  ]) as NetworkResponse;
  
  console.log(`[runChatSession] Chat network execution completed or timed out`);
  
  // Log debug info about the response structure if it's not the timeout error
  if (!(response instanceof Error)) {
    // Log debug info about the response structure
    if (response?.state?.results && response.state.results.length > 0) {
      console.log(`[runChatSession] Got ${response.state.results.length} results from the network`);
      const lastResult = response.state.results[response.state.results.length - 1];
      if (lastResult) {
        console.log(`[runChatSession] Last result from agent: ${lastResult.agentName || 'unknown'}`);
        if (lastResult.output && lastResult.output.length > 0) {
          const lastOutput = lastResult.output[lastResult.output.length - 1];
          if (lastOutput) {
            console.log(`[runChatSession] Output type: ${lastOutput.type || 'unknown'}`);
            if(lastOutput.type === 'text' && typeof lastOutput.content === 'string') {
              console.log(`[runChatSession] Output content: ${lastOutput.content.substring(0, 50)}...`);
            }
          } else {
            console.log(`[runChatSession] Last output item is undefined`);
          }
        } else {
          console.log(`[runChatSession] No output in last result`);
        }
      } else {
        console.log(`[runChatSession] Last result is undefined`);
      }
    } else {
      console.log(`[runChatSession] No results returned from network or state structure unexpected`);
    }
  } else {
    console.log(`[runChatSession] Network call resulted in an error (likely timeout)`);
  }
  
  return response; // Return the response or the timeout Error object
} 