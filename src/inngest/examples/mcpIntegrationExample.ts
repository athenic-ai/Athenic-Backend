/**
 * Example showing how to integrate MCP connections with Inngest agent networks
 */
import { inngest } from '../inngest';
import { createState, createNetwork, createAgent, anthropic } from '@inngest/agent-kit';
import { buildMcpServersConfig } from '../utils/mcpHelpers';

// Define state interface
interface ExampleState {
  organisationId: string;
  query: string;
  results: any[];
}

// Create an example agent
const exampleAgent = createAgent<ExampleState>({
  name: 'MCP-Enabled Agent',
  description: 'An agent that can use tools from MCP servers',
  system: `You are a helpful assistant that can use various tools to assist users.
  You have access to multiple MCP servers which provide additional capabilities.
  When a user asks for help, use the most appropriate tools available to you.`,
  // MCP servers will be dynamically configured at runtime
});

// Create a network using the agent
export const mcpEnabledNetwork = createNetwork<ExampleState>({
  name: 'MCP-Enabled Network',
  agents: [exampleAgent],
  defaultModel: anthropic({
    model: 'claude-3-5-haiku-latest',
    defaultParameters: {
      max_tokens: 1000,
    },
  }),
});

/**
 * Example Inngest function that runs the MCP-enabled network
 */
export const runMcpEnabledFunction = inngest.createFunction(
  { id: 'run-mcp-agent', retries: 2 },
  { event: 'athenic/mcp.query' },
  async ({ event, step }) => {
    const { organisationId, query } = event.data;
    
    // Initialize state
    const state = createState<ExampleState>({
      organisationId,
      query,
      results: [],
    });
    
    // Build MCP servers configuration for this organization
    const mcpServersConfig = await step.run(
      'Build MCP Servers Config',
      async () => buildMcpServersConfig(organisationId)
    );
    
    console.log(`Found ${mcpServersConfig.length} MCP servers for organisation ${organisationId}`);
    
    // Run the network with MCP servers injected
    const result = await mcpEnabledNetwork.run(query, {
      state,
      // Inject MCP servers into the agent context
      mcpServers: mcpServersConfig,
    });
    
    // Return the result
    return {
      result: result.state.results[result.state.results.length - 1]?.output,
      mcpServersUsed: mcpServersConfig.map(server => server.name),
    };
  }
);

/**
 * Example of how to use MCP servers with an existing agent/network
 * 
 * To use with the existing chat network, you would modify runChatSession:
 */
/*
import { chatNetwork } from '../networks/chatNetwork';
import { buildMcpServersConfig } from '../utils/mcpHelpers';

export async function runChatSession(
  message: string, 
  metadata: { userId: string; organisationId: string; clientId: string; }
) {
  console.log(`[runChatSession] Starting chat session for user ${metadata.userId}`);

  // Create initial chat state
  const state = createState({
    userId: metadata.userId,
    organisationId: metadata.organisationId,
    clientId: metadata.clientId,
    messageHistory: [
      {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  // Get MCP servers for this organization
  const mcpServersConfig = await buildMcpServersConfig(metadata.organisationId);
  console.log(`[runChatSession] Found ${mcpServersConfig.length} MCP servers`);

  // Run the network with timeout
  try {
    const response = await Promise.race([
      chatNetwork.run(message, { 
        state,
        // Inject MCP servers into the network
        mcpServers: mcpServersConfig,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Chat network timeout')), 60000)
      ),
    ]);

    return response;
  } catch (error) {
    console.error(`[runChatSession] Error: ${error instanceof Error ? error.message : String(error)}`);
    return error;
  }
}
*/ 