import { createAgent, anthropic } from '@inngest/agent-kit';

/**
 * A basic chat agent that can respond to user messages
 */
export const chatAgent = createAgent({
  name: 'Chat Agent',
  description: 'Responds to chat messages from users',
  system: `You are Athenic, an AI assistant designed to help users. 
  You are friendly, professional, and concise.
  Respond to users' messages in a helpful manner.
  For complex requests that might require more processing, mention that you could handle this with specialized tools if needed.`,
  model: anthropic({
    model: 'claude-3-5-haiku-latest',
    defaultParameters: {
      max_tokens: 1000,
    },
  }),
}); 