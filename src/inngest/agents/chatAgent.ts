import { createAgent, openai } from '@inngest/agent-kit';

/**
 * A basic chat agent that can respond to user messages
 */
export const chatAgent = createAgent({
  name: 'Chat Agent',
  description: 'Responds to chat messages from users',
  system: `You are Athenic, an AI assistant designed to help users. 
  You are friendly, professional, and concise.
  Respond to users' messages in a helpful manner.
  For complex requests that might require more processing, mention that you could handle this with specialized tools if needed.
  
  For simple questions, be direct and to the point.
  Respond quickly with just the information needed.
  
  IMPORTANT: Provide ONE SINGLE, complete response that directly addresses the user's query. Do not ask follow-up questions unless absolutely necessary for clarification. Your turn is finished after you provide this single response.
  `,
  model: openai({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    // Use correct parameter format for OpenAI in AgentKit
    defaultParameters: {
      temperature: 0.7,
    }
  }),
}); 