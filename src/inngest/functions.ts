// @ts-ignore - Ignoring all TypeScript errors in this file while we focus on implementing LLM functionality
import { inngest } from './client';
import Logger, { LogLevel } from '../utils/logger';
import ensureLogDirectories from '../utils/ensure-log-dirs';
import { Inngest } from 'inngest';
import { setTimeout } from 'timers/promises';
// Using dynamic import for AgentKit to avoid CommonJS/ESM issues
import { getInitializedTools } from './tools/e2b-tools';
// Using dynamic import for axios to avoid CommonJS/ESM compatibility issues
// We'll use dynamic import instead of static import

// Ensure log directories exist
ensureLogDirectories();

// Create a logger specifically for Inngest functions
const logger = Logger.getLogger({
  component: 'InngestFunctions',
  minLevel: LogLevel.DEBUG,
});

logger.info('Functions module is being loaded');

// Import and setup AgentKit
let createNetwork: any;
let createAgent: any;
let e2bTools: any; // Keep this as it might be used by handleNewChatMessage later
let openai: any; // Placeholder for LLM adapter

async function loadModules() {
  try {
    // Dynamically import AgentKit
    const agentKit = await import('@inngest/agent-kit');
    createNetwork = agentKit.createNetwork;
    createAgent = agentKit.createAgent;
    // Dynamically import the specific LLM adapter needed
    openai = agentKit.openai; // Example: Load OpenAI adapter
    logger.info('AgentKit loaded successfully');

    // Get initialized e2b tools (keep this, might be used in Phase 2)
    e2bTools = await getInitializedTools();
    logger.info('E2B tools loaded successfully');
  } catch (error) {
    logger.error('Failed to load modules:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Call loadModules to initialize
loadModules().catch(error => {
  logger.error('Error loading modules:', error instanceof Error ? error.message : String(error));
});

// Define the test connection function
export const testFunction = inngest.createFunction(
  { id: 'test-connection' },
  { event: 'test/connection' },
  async ({ event, step }) => {
    logger.info('Test connection event received', { eventId: event.id });
    
    // Simulate some processing time
    await step.sleep('wait-a-bit', '1s');
    
    // Log that we're done processing
    logger.info('Test connection event processed', { eventId: event.id });
    
    // Return a success response
    return {
      status: 'success',
      message: 'Test connection successful',
      timestamp: new Date().toISOString(),
    };
  }
);

// Define a more complex task handler
export const complexTaskHandler = inngest.createFunction(
  { id: 'complex-task-handler' },
  { event: 'task/complex.requested' },
  async ({ event, step }) => {
    logger.info('Complex task event received', { eventId: event.id });
    
    try {
      // Extract task details from event data
      const { taskId, taskType, parameters } = event.data;
      
      logger.info('Processing complex task', { taskId, taskType });
      
      // Validate task parameters
      if (!taskType) {
        throw new Error('Missing task type');
      }
      
      // Simulate task processing stages
      await step.run('preparing-task', async () => {
        logger.debug('Preparing task resources', { taskId });
        await setTimeout(500); // Simulate preparation time
        return { prepared: true };
      });
      
      // Process the task based on type
      const result = await step.run('execute-task', async () => {
        logger.debug('Executing task', { taskId, taskType });
        
        // Simulate longer processing time
        await setTimeout(2000);
        
        // Simple task result for now
        return {
          taskId,
          completed: true,
          result: "Processed " + taskType + " task successfully",
          timestamp: new Date().toISOString(),
        };
      });
      
      // Final cleanup step
      await step.run('finalize-task', async () => {
        logger.debug('Finalizing task', { taskId });
        await setTimeout(500); // Simulate cleanup time
        return { finalized: true };
      });
      
      logger.info('Complex task completed successfully', { 
        taskId, 
        taskType,
        executionTime: 'about 3 seconds' // hardcoded for this example
      });
      
      // Return the task result
      return {
        status: 'success',
        ...result,
      };
    } catch (error) {
      // Log the error
      logger.error('Error processing complex task', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        eventId: event.id
      });
      
      // Return an error response
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
);

// Add new function to handle messages with AgentKit
export const handleNewChatMessage = inngest.createFunction(
  { id: "handle-new-chat-message", name: "Handle New Chat Message" },
  { event: "athenic/chat.message.received" }, // Trigger on the new event
  async ({ event, step, logger }) => {
    const startTime = Date.now();
    logger.info(`[handleNewChatMessage] Received event`, { eventId: event.id, clientId: event.data.clientId });

    const { message, userId, organisationId, clientId } = event.data;

    // Validate required input from event data
    if (!message || !userId || !organisationId || !clientId) {
        logger.error(`[handleNewChatMessage] Missing required fields in event data for clientId ${clientId}`, { userId, organisationId, messageProvided: !!message, clientId });
        return {
          status: 'error',
          clientId,
          error: 'Missing required fields (message, userId, organisationId, clientId) in event data.',
          durationMs: Date.now() - startTime,
        };
    }

    // Ensure the required modules are loaded
    if (!createAgent || !createNetwork || !openai) { // Check for LLM adapter too
      try {
        await loadModules();
      } catch (loadError: any) {
         logger.error(`[handleNewChatMessage] Failed to load modules: ${loadError.message}`);
         return {
           status: 'error',
           clientId,
           error: `Failed to load required modules: ${loadError.message}`,
           durationMs: Date.now() - startTime,
         };
      }
      if (!createAgent || !createNetwork || !openai) {
        logger.error(`[handleNewChatMessage] AgentKit modules or LLM adapter not loaded correctly after attempting reload`);
        return {
          status: 'error',
          clientId,
          error: 'Failed to load required modules even after reload attempt.',
          durationMs: Date.now() - startTime,
        };
      }
    }

    // --- Define the Agent ---
    let chatAgent;
    try {
        chatAgent = createAgent({
          name: "AthenicChatAgent",
          // Simple system prompt for now - Phase 2 will add tool instructions
          system: `You are Athenic, a helpful AI assistant designed to assist with various tasks.
Respond concisely and accurately to the user's message based on the provided input.
User ID: ${userId}
Organisation ID: ${organisationId}
Client ID for this interaction: ${clientId}
You do not have tools available in this phase, just respond directly to the message.`,
          // Use the dynamically loaded LLM adapter
          model: openai({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini", // Use env var or default to gpt-4o-mini
            // AgentKit should automatically pick up OPENAI_API_KEY from env
          }),
          // Tools will be added in Phase 2
          tools: [],
        });
    } catch(agentCreationError: any) {
        logger.error(`[handleNewChatMessage] Failed to create agent for clientId ${clientId}`, { error: agentCreationError.message });
        return {
          status: 'error',
          clientId,
          error: `Failed to create agent: ${agentCreationError.message}`,
          durationMs: Date.now() - startTime,
        };
    }


    // --- Run the Agent ---
    let agentResponseText = "Sorry, I encountered an issue processing your request.";
    let agentResult;

    try {
      agentResult = await step.run("run-chat-agent", async () => {
        // Create network with our agent
        const network = createNetwork({
          agents: [chatAgent],
          defaultModel: chatAgent.model
        });

        // Inject clientId into state for potential tool use later (if network supports state)
        // Note: Standard network doesn't have persistent state like this,
        // but good practice if using stateful networks later.
        // if (network.state && typeof network.state.set === 'function') {
        //   network.state.set('clientId', clientId);
        // } else if (network.state && network.state.kv && typeof network.state.kv.set === 'function') {
        //    network.state.kv.set('clientId', clientId); // Handle kv store state if present
        // }

        // Run the agent with the user's message
        return await network.run(message);
      });

      // Extract the text response from the agent result
      // AgentKit v0.7+ output format handling
      if (agentResult?.output?.length > 0) {
         const lastMessage = agentResult.output[agentResult.output.length - 1];
         if (lastMessage.type === 'text') {
           agentResponseText = typeof lastMessage.content === 'string'
             ? lastMessage.content
             : lastMessage.content.map((c: any) => c.text || '').join(''); // Handle potential content arrays safely
         } else if (lastMessage.type === 'tool_outputs') {
            // Handle case where the last output is from a tool (Phase 2 onwards)
            agentResponseText = "I used a tool to process your request. What would you like to do next?"; // Placeholder
         } else {
            agentResponseText = "I processed your request."; // Generic fallback
         }
      } else if (agentResult?.error) {
         logger.error(`[handleNewChatMessage] Agent network run resulted in an error for clientId ${clientId}`, { error: agentResult.error });
         agentResponseText = `Sorry, the agent encountered an error: ${agentResult.error}`;
      }

      logger.info(`[handleNewChatMessage] Agent generated response for clientId ${clientId}`, { responseLength: agentResponseText.length });

    } catch (agentRunError: any) {
      logger.error(`[handleNewChatMessage] Agent execution ('run-chat-agent' step) failed for clientId ${clientId}`, { error: agentRunError.message, stack: agentRunError.stack });
      // Try to provide a more informative error message if possible
      agentResponseText = `Sorry, I encountered an error while processing your request. Step "run-chat-agent" failed: ${agentRunError.message}`;
    }

    // --- Notify API Server of completion ---
    // This should ideally happen *after* DB persistence, but keeping order from plan for now
    try {
      const { default: axios } = await import('axios');
      const apiServerPort = process.env.API_SERVER_PORT || '3000';
      const apiServerUrl = `http://localhost:${apiServerPort}`;

      await step.run("notify-api-server", async () => {
          await axios.post(`${apiServerUrl}/api/chat/response`, {
            clientId,
            response: agentResponseText,
            // Indicate no E2B was used in this phase
            requiresE2B: false,
            // metadata: agentResult?.metadata // Pass any relevant metadata if needed
          });
          return { notified: true };
      });
      logger.info(`[handleNewChatMessage] Notified API server with response for clientId ${clientId}`);
    } catch (notifyError: any) {
      // Log error from the step if available, otherwise the caught error
      const stepError = (notifyError.cause as any)?.error; // Inngest wraps errors in step.run
      const finalErrorMessage = stepError?.message || notifyError.message;
      logger.error(`[handleNewChatMessage] Failed to notify API server (step 'notify-api-server') for clientId ${clientId}: ${finalErrorMessage}`);
      // Consider implications - client might not get response. Don't re-throw, just log.
    }

    // --- Placeholder for DB Storage (Phase 3) ---
    await step.run("store-conversation-placeholder", async () => {
      logger.info(`[handleNewChatMessage] Placeholder: Storing user message and AI response for clientId ${clientId} in DB.`);
      // In Phase 3: Use event.data.message, agentResponseText, userId, organisationId, clientId
      // Find/create thread, create message objects, update thread
      return { stored: true }; // Placeholder success
    });

    const duration = Date.now() - startTime;
    logger.info(`[handleNewChatMessage] Finished processing for clientId ${clientId}`, { durationMs: duration });

    // Final return includes status, clientId, response text, and duration
    return {
      status: 'success',
      clientId: clientId,
      response: agentResponseText,
      durationMs: duration,
    };
  }
);

logger.info('Functions module fully loaded and exported');

// Update the default export to only include active functions
export default {
  testFunction,
  complexTaskHandler,
  handleNewChatMessage  // This is the main chat handler now
};