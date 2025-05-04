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

/**
 * Run a chat session in the network
 * @param message The user's message
 * @param metadata Additional metadata about the user and session
 * @returns The AI response
 */
export async function runChatSession(
  message: string, 
  metadata: { userId: string; organisationId: string; clientId: string; }
) {
  try {
    // Initialize state with user info and an empty message history
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
    
    // Create state object with initial state
    const state = createState<ChatState>(initialState);
    
    // Run the chat network to get a response
    const response = await chatNetwork.run(message, { state });
    
    // Instead of updating state here (which doesn't persist between runs by default),
    // we'll return the response to be stored by the calling function
    
    return response;
  } catch (error) {
    console.error('Error in chat session:', error);
    throw error;
  }
} 