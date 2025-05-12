import { createNetwork, createState } from '@inngest/agent-kit';
import { openai } from '@inngest/agent-kit';
import { ingestDumpAgent } from '../agents/ingestDumpAgent.js';

export const dumpNetwork = createNetwork({
  name: 'Dump Processing Network',
  agents: [ingestDumpAgent],
  defaultModel: openai({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini' }),
  // Simple router that directly calls the ingestDumpAgent
  defaultRouter: () => ingestDumpAgent, 
}); 