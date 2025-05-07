/**
 * Example showing how to integrate MCP connections with Inngest agent networks
 */
import { createState, createNetwork, createAgent, anthropic } from '@inngest/agent-kit';
import { buildMcpServersConfig } from '../utils/mcpHelpers.js';
import { chatNetwork } from '../networks/chatNetwork.js';
import { Inngest } from 'inngest';

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

// Create a factory function that returns the function objects
export function createMcpIntegrationFunctions(inngest: Inngest) {
  /**
   * Example Inngest function that runs the MCP-enabled network
   * Usage: 
   * 1. Make sure to register this event schema in inngest.ts
   * 2. Include this function in the inngest server setup
   */
  const runMcpEnabledFunction = inngest.createFunction(
    { id: 'run-mcp-agent', retries: 2 },
    { event: 'athenic/mcp.query' } as any, // Type assertion to avoid TS errors
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
      
      // Run the network with MCP servers injected using type assertion to avoid TypeScript errors
      const result = await mcpEnabledNetwork.run(query, {
        state,
        // Inject MCP servers into the agent context using type assertion
        mcpServers: mcpServersConfig,
      } as any);
      
      // Return the result
      return {
        result: result.state.results[result.state.results.length - 1]?.output,
        mcpServersUsed: mcpServersConfig.map(server => server.name),
      };
    }
  );

  /**
   * Test function for our MCP integration 
   * This function can be used to trigger a test of our MCP implementation
   * Usage: 
   * 1. Make sure to register this event schema in inngest.ts
   * 2. Include this function in the inngest server setup
   */
  const testMcpIntegrationFunction = inngest.createFunction(
    { id: 'test-mcp-integration', retries: 1 },
    { event: 'athenic/test.mcp_integration' } as any, // Type assertion to avoid TS errors
    async ({ event, step }) => {
      const { organisationId, clientId, message } = event.data;
      
      console.log(`[testMcpIntegration] Testing MCP integration for organisation ${organisationId}`);
      
      // Build MCP servers configuration for this organization
      const mcpServersConfig = await step.run(
        'Fetch MCP Servers',
        async () => {
          const configs = await buildMcpServersConfig(organisationId);
          console.log(`Found ${configs.length} MCP servers for organisation ${organisationId}`);
          return configs;
        }
      );
      
      let result;
      
      // Test 1: Use the chat network directly
      result = await step.run(
        'Test Chat Network with MCP',
        async () => {
          try {
            console.log(`Running chat network with message: "${message}"`);
            
            // Use type assertion to avoid TypeScript errors
            const response = await chatNetwork.run(message, {
              state: createState({
                userId: 'test-user',
                organisationId,
                clientId,
                messageHistory: [{
                  role: 'user',
                  content: message,
                  timestamp: new Date().toISOString()
                }]
              }),
              mcpServers: mcpServersConfig,
            } as any);
            
            console.log('Chat network execution completed');
            
            // Extract the response
            const lastResult = response?.state?.results?.[response.state.results.length - 1];
            const output = lastResult?.output?.[lastResult.output.length - 1];
            
            return {
              success: true,
              // Fix the property access for output.text
              output: output ? (typeof output === 'object' && 'content' in output ? output.content : JSON.stringify(output)) : null,
              networkResponse: response,
            };
          } catch (error) {
            console.error('Error during chat network execution:', error);
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }
      );
      
      // Test 2: Use the MCP-enabled example network
      const exampleNetworkResult = await step.run(
        'Test Example Network with MCP',
        async () => {
          try {
            console.log(`Running example MCP-enabled network with message: "${message}"`);
            
            // Use type assertion to avoid TypeScript errors
            const response = await mcpEnabledNetwork.run(message, {
              state: createState<ExampleState>({
                organisationId,
                query: message,
                results: [],
              }),
              mcpServers: mcpServersConfig,
            } as any);
            
            console.log('Example network execution completed');
            
            // Extract the response
            const lastResult = response?.state?.results?.[response.state.results.length - 1];
            const output = lastResult?.output;
            
            return {
              success: true,
              output: output ? (typeof output === 'string' ? output : JSON.stringify(output)) : null,
              networkResponse: response,
            };
          } catch (error) {
            console.error('Error during example network execution:', error);
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }
      );
      
      // Return all test results
      return {
        organisationId,
        mcpServersUsed: mcpServersConfig.map(server => server.name),
        chatNetworkResult: result,
        exampleNetworkResult,
      };
    }
  );
  
  return { runMcpEnabledFunction, testMcpIntegrationFunction };
}

// Example code snippet showing how to use the modified chatNetwork
export async function runChatSessionWithMcp(
  message: string, 
  metadata: { userId: string; organisationId: string; clientId: string; }
) {
  console.log(`[runChatSessionWithMcp] Starting chat session for user ${metadata.userId}`);

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
  console.log(`[runChatSessionWithMcp] Found ${mcpServersConfig.length} MCP servers`);

  // Run the network with timeout
  try {
    const response = await Promise.race([
      // Use type assertion to avoid TypeScript errors
      chatNetwork.run(message, { 
        state,
        // Inject MCP servers into the network
        mcpServers: mcpServersConfig,
      } as any),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Chat network timeout')), 60000)
      ),
    ]);

    return response;
  } catch (error) {
    console.error(`[runChatSessionWithMcp] Error: ${error instanceof Error ? error.message : String(error)}`);
    return error;
  }
}

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