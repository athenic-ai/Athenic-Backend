// @ts-ignore - Ignoring all TypeScript errors in this file while we focus on implementing LLM functionality
import { inngest } from './client';
import Logger, { LogLevel } from '../utils/logger';
import ensureLogDirectories from '../utils/ensure-log-dirs';
import { Inngest } from 'inngest';
import { setTimeout } from 'timers/promises';
// Using dynamic import for AgentKit to avoid CommonJS/ESM issues
import { getInitializedTools } from './tools/e2b-tools';
import { executeCodeDirectly } from './tools/e2b-tools';
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
let e2bTools: any;

async function loadModules() {
  try {
    // Dynamically import AgentKit
    const agentKit = await import('@inngest/agent-kit');
    createNetwork = agentKit.createNetwork;
    createAgent = agentKit.createAgent;
    logger.info('AgentKit loaded successfully');
    
    // Get initialized e2b tools
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

// Define the chat message handler function
export const handleChatMessage = inngest.createFunction(
  { id: "handle-chat-message", name: "Handle Chat Message" },
  { event: "chat/message.sent" },
  async ({ event, step, logger }) => {
    const startTime = Date.now();
    logger.info(`[handleChatMessage] Starting process for message sent by ${event.data.userId}`);

    try {
      // Destructure from event data
      const { userId, sessionId, message, clientId } = event.data;
      
      // Skip if any required fields are missing
      if (!userId || !sessionId || !message || !clientId) {
        logger.error("[handleChatMessage] Required fields missing", { userId, sessionId, message, clientId });
        return { 
          error: "Required fields missing", 
          processingTimeMs: Date.now() - startTime 
        };
      }

      logger.info(`[handleChatMessage] Analyzing message from user: ${userId}, session: ${sessionId}`);
      
      // Analyze message to determine action
      const analysis = await step.run("analyze-message", async () => {
        const messageTextLower = message.toLowerCase();
        
        // Check if message contains code execution command
        const isExecuteCommand = 
          messageTextLower.includes("execute") || 
          messageTextLower.includes("run") || 
          messageTextLower.includes("e2b");
        
        // Check if message is asking for coding help or examples
        const isCodingQuestion = 
          messageTextLower.includes("code") ||
          messageTextLower.includes("script") ||
          messageTextLower.includes("program") ||
          messageTextLower.includes("example") ||
          messageTextLower.includes("javascript") ||
          messageTextLower.includes("python") ||
          messageTextLower.includes("typescript");
        
        return {
          requiresE2B: isExecuteCommand || isCodingQuestion,
          type: isExecuteCommand ? "code-execution" : (isCodingQuestion ? "code-generation" : "text-response"),
          messageTextLower
        };
      });
      
      logger.info(`[handleChatMessage] Analysis result:`, analysis);
      
      // Handle different types of messages
      let response;
      
      if (analysis.type === "code-execution") {
        // Extract code from message for execution
        const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]*?)```/) ||
                         message.match(/execute\s+([\s\S]*)/i) || 
                         message.match(/run\s+([\s\S]*)/i);
        
        // Get the code to execute
        const code = codeMatch?.[1]?.trim() || "";
        
        if (!code) {
          response = { 
            text: "I don't see any code to execute. Please provide code using triple backticks (```code here```) or by directly stating 'execute [command]'."
          };
        } else {
          logger.info(`[handleChatMessage] Executing code`, { codeLength: code.length });
          
          // Execute the code directly
          const result = await step.run("execute-e2b-code", async () => {
            try {
              return await executeCodeDirectly(code, 'code-interpreter-v1', clientId, step);
            } catch (error: any) {
              logger.error(`[handleChatMessage] Error executing code:`, error);
              return { error: `Failed to execute code: ${error.message}` };
            }
          });
          
          if (result.error) {
            response = { text: `Error: ${result.error}` };
          } else {
            response = { 
              text: "Code executed successfully. Output has been streamed to your terminal.",
              sandboxId: result.sandboxId 
            };
          }
        }
      } else if (analysis.type === "code-generation") {
        // Generate code example based on query
        logger.info(`[handleChatMessage] Generating code example`);
        
        // Generate the code example
        const codeExample = await step.run("generate-code-example", async () => {
          let codeExample = "```javascript\n";
          
          // Simple examples for demonstration
          if (analysis.messageTextLower.includes("hello world")) {
            codeExample += `console.log("Hello, World!");\n`;
          } else if (analysis.messageTextLower.includes("loop")) {
            codeExample += `// Example of a for loop\nfor (let i = 0; i < 5; i++) {\n  console.log(\`Iteration \${i}\`);\n}\n`;
          } else if (analysis.messageTextLower.includes("array")) {
            codeExample += `// Example of array operations\nconst fruits = ["apple", "banana", "orange"];\nconsole.log(fruits);\n\n// Add an item\nfruits.push("grape");\nconsole.log(fruits);\n\n// Remove last item\nconst lastFruit = fruits.pop();\nconsole.log(\`Removed: \${lastFruit}\`);\nconsole.log(fruits);\n`;
          } else {
            codeExample += `// Here's a basic JavaScript example\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconst result = greet("User");\nconsole.log(result);\n`;
          }
          
          codeExample += "```";
          return codeExample;
        });
        
        response = { 
          text: `Here's an example that might help:\n\n${codeExample}\n\nYou can execute this code by sending it back with "Run this code" at the beginning of your message.` 
        };
      } else {
        // Regular text response
        logger.info(`[handleChatMessage] Generating text response`);
        
        response = { 
          text: "I can help you with coding tasks! Ask me to generate code examples or execute code for you." 
        };
      }
      
      // Try to notify API server of response
      try {
        const port = process.env.API_SERVER_PORT || '3000';
        // Dynamically import axios
        const { default: axios } = await import('axios');
        await axios.post(`http://localhost:${port}/api/chat/response`, {
          userId,
          sessionId,
          clientId,
          response: response.text,
          metadata: response.sandboxId ? { sandboxId: response.sandboxId } : undefined
        });
      } catch (error) {
        logger.error(`[handleChatMessage] Error notifying API of response:`, error);
        // Continue even if notification fails
      }
      
      return {
        userId,
        sessionId,
        response: response.text,
        processingTimeMs: Date.now() - startTime,
        metadata: response.sandboxId ? { sandboxId: response.sandboxId } : undefined
      };
    } catch (error: any) {
      logger.error("[handleChatMessage] Unhandled error:", error);
      return { 
        error: `Unhandled error: ${error.message}`, 
        processingTimeMs: Date.now() - startTime 
      };
    }
  }
);

// Function to execute a command in e2b
async function executeE2bCommand(command: string): Promise<string> {
  try {
    logger.info('Calling e2b service to execute command', { command });
    
    // Dynamically import axios
    const { default: axios } = await import('axios');
    
    // Call the e2b service (adjust URL as needed)
    const e2bServiceUrl = process.env.E2B_SERVICE_URL || 'http://localhost:8002';
    const response = await axios.post(`${e2bServiceUrl}/run-command`, {
      command
    });
    
    logger.info('E2b command execution successful', { 
      status: response.status,
      dataLength: JSON.stringify(response.data).length
    });
    
    return `Command output:\n\`\`\`\n${response.data.output}\n\`\`\``;
  } catch (error) {
    logger.error('E2b service error', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// Helper function to generate sample code based on message
function generateSampleCode(message: string): string {
  // Check if this is a shell command
  const shellCommandRegex = /^\s*\$?\s*(ls|cd|mkdir|rm|cp|mv|cat|grep|find|echo|curl|wget|git|for)\s/;
  const runCommandRegex = /run\s+(the\s+)?command\s*[:`'"'](.+?)[`'"':]/i;
  const commandMatch = message.match(runCommandRegex);
  
  if (commandMatch && commandMatch[2]) {
    // Extract the actual command from the message
    const command = commandMatch[2].trim();
    return `
import subprocess
import sys

try:
    print("Executing command: ${command.replace(/"/g, '\\"')}")
    result = subprocess.run("${command.replace(/"/g, '\\"')}", shell=True, capture_output=True, text=True)
    
    # Print stdout
    if result.stdout:
        print(result.stdout, end='')
    
    # Print stderr if any
    if result.stderr:
        print("Error output:", file=sys.stderr)
        print(result.stderr, file=sys.stderr, end='')
    
    # Print return code
    print(f"Command completed with exit code: {result.returncode}")
except Exception as e:
    print(f"Failed to execute command: {str(e)}", file=sys.stderr)
`;
  } else if (shellCommandRegex.test(message)) {
    // Extract the actual command
    const command = message.replace(/^\s*\$\s*/, '').trim();
    return `
import subprocess
import sys

try:
    print("Executing command: ${command.replace(/"/g, '\\"')}")
    result = subprocess.run("${command.replace(/"/g, '\\"')}", shell=True, capture_output=True, text=True)
    
    # Print stdout
    if result.stdout:
        print(result.stdout, end='')
    
    # Print stderr if any
    if result.stderr:
        print("Error output:", file=sys.stderr)
        print(result.stderr, file=sys.stderr, end='')
    
    # Print return code
    print(f"Command completed with exit code: {result.returncode}")
except Exception as e:
    print(f"Failed to execute command: {str(e)}", file=sys.stderr)
`;
  } else if (message.toLowerCase().includes('file') || message.toLowerCase().includes('read')) {
    return `
// Sample code to read a file
const fs = require('fs');

fs.readFile('example.txt', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }
  console.log('File contents:', data);
});
`;
  } else {
    // Default code example
    return `
# Sample Python code
print("Hello from Athenic!")
print("I'm executing this code in a sandbox environment.")
print("You can ask me to run more complex code if needed.")
`;
  }
}

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

// Add new function to listen to athenic/chat.message.received events
export const processChat = inngest.createFunction(
  { id: "process-chat" },
  { event: "athenic/chat.message.received" },
  async ({ event, step }) => {
    const startTime = Date.now();
    logger.info('Chat message event received', { 
      eventId: event.id,
      eventData: JSON.stringify(event.data)
    });
    
    try {
      // Extract message content from event data
      const { message, userId, organisationId, clientId } = event.data;
      
      if (!message) {
        logger.warn('Missing message content in event data');
        return { error: 'Missing message content' };
      }
      
      logger.info(`Processing message from ${userId || 'unknown user'}: ${message.substring(0, 100) + (message.length > 100 ? '...' : '')}`);
      
      // Analyze the message to determine what kind of response is needed
      const analysis = await step.run('analyze-message', async () => {
        // Check if this is an e2b terminal command
        const e2bCommandRegex = /run\s+(the\s+)?command\s*[:`'"](.+?)[`'"]/i;
        const shellCommandRegex = /^\s*\$?\s*(ls|cd|mkdir|rm|cp|mv|cat|grep|find|echo|curl|wget|git|for)\s/;
        
        const e2bMatch = message.match(e2bCommandRegex);
        
        if (e2bMatch && e2bMatch[2]) {
          return {
            requiresE2B: true,
            command: e2bMatch[2],
            type: 'shell-command' as const
          };
        }
        
        if (shellCommandRegex.test(message)) {
          return {
            requiresE2B: true,
            command: message.replace(/^\s*\$\s*/, '').trim(),
            type: 'shell-command' as const
          };
        }
        
        // Check for other code execution patterns
        const codeBlockRegex = /```([a-z]*)\n([\s\S]*?)```/;
        const codeMatch = message.match(codeBlockRegex);
        
        if (codeMatch) {
          return {
            requiresE2B: true,
            language: codeMatch[1] || 'python',
            code: codeMatch[2].trim(),
            type: 'code-block' as const
          };
        }
        
        return {
          requiresE2B: false,
          type: 'text-response' as const
        };
      });
      
      logger.info(`Message analysis:`, analysis);
      
      let response;
      let sandboxId;
      
      // Handle the message based on the analysis
      if (analysis.requiresE2B) {
        if (analysis.type === 'shell-command') {
          // Execute shell command in E2B
          const command = (analysis as { command: string, type: 'shell-command' }).command;
          logger.info(`Executing shell command in E2B: ${command}`);
          
          try {
            const result = await step.run('execute-command', async () => {
              const code = `
import subprocess
import sys

try:
    print("Executing command: ${command.replace(/"/g, '\\"')}")
    result = subprocess.run("${command.replace(/"/g, '\\"')}", shell=True, capture_output=True, text=True)
    
    # Print stdout
    if result.stdout:
        print(result.stdout, end='')
    
    # Print stderr if any
    if result.stderr:
        print("Error output:", file=sys.stderr)
        print(result.stderr, file=sys.stderr, end='')
    
    # Print return code
    print(f"Command completed with exit code: {result.returncode}")
except Exception as e:
    print(f"Failed to execute command: {str(e)}", file=sys.stderr)
`;
              
              return await executeCodeDirectly(code, 'code-interpreter-v1', clientId, step);
            });
            
            sandboxId = result.sandboxId;
            response = `I'm executing your command in an E2B sandbox. You should see the output shortly.`;
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Error executing shell command: ${errorMessage}`);
            response = `Sorry, I ran into an error trying to execute your command: ${errorMessage}`;
          }
        } else if (analysis.type === 'code-block') {
          // Execute code block in E2B
          const codeBlockAnalysis = analysis as { code: string, language: string, type: 'code-block' };
          logger.info(`Executing code block in E2B: ${codeBlockAnalysis.language}`);
          
          try {
            const result = await step.run('execute-code-block', async () => {
              return await executeCodeDirectly(codeBlockAnalysis.code, 'code-interpreter-v1', clientId, step);
            });
            
            sandboxId = result.sandboxId;
            response = `I'm executing your ${codeBlockAnalysis.language} code in an E2B sandbox. You should see the output shortly.`;
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Error executing code block: ${errorMessage}`);
            response = `Sorry, I ran into an error trying to execute your code: ${errorMessage}`;
          }
        }
      } else {
        // Handle regular text responses by using the NLP service
        const { default: axios } = await import('axios');
        const nlpServiceUrl = process.env.API_SERVER_URL || 'http://localhost:3000';

        try {
          logger.info('Using NLP service for standard text response');
          
          const nlpResponse = await step.run('generate-text-response', async () => {
            const result = await axios.post(`${nlpServiceUrl}/api/nlp/chat`, {
              message,
              userId,
              organisationId
            });
            return result.data;
          });
          
          response = nlpResponse.message || "I processed your request, but couldn't generate a response. Please try again.";
          logger.info(`NLP service generated response: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Error getting NLP response: ${errorMessage}`);
          response = "I'm sorry, I couldn't generate a response at this time. Please try again later.";
        }
      }
      
      // Send response to the client
      try {
        const apiServerPort = process.env.API_SERVER_PORT || '3000';
        // Import axios dynamically
        const { default: axios } = await import('axios');
        
        await axios.post(`http://localhost:${apiServerPort}/api/chat/response`, {
          clientId,
          response,
          requiresE2B: analysis.requiresE2B,
          sandboxId,
          e2bResult: { success: true }
        });
        
        logger.info(`Response sent back to API server for client ${clientId}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error sending response to API server: ${errorMessage}`);
      }
      
      return {
        success: true,
        response,
        requiresE2B: analysis.requiresE2B,
        sandboxId,
        processingTimeMs: Date.now() - startTime
      };
    } catch (error: any) {
      logger.error(`Unhandled error in processChat: ${error.message}`);
      return {
        success: false,
        error: error.message,
        processingTimeMs: Date.now() - startTime
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

    // Ensure the required modules are loaded
    if (!createAgent || !createNetwork) {
      await loadModules();
      if (!createAgent || !createNetwork) {
        logger.error(`[handleNewChatMessage] AgentKit modules not loaded correctly`);
        return {
          status: 'error',
          clientId,
          error: 'Failed to load required modules',
          durationMs: Date.now() - startTime,
        };
      }
    }

    // --- Define the Agent ---
    const chatAgent = createAgent({
      name: "AthenicChatAgent",
      // Simple system prompt for now
      system: `You are Athenic, a helpful AI assistant designed to assist with various tasks. 
Respond concisely and accurately to the user's message.
If the user asks you to run code or execute commands, you can use the tools available to you.`,
      model: {
        provider: 'openai',
        model: process.env.OPENAI_MODEL || "gpt-4o-mini", // Use env var or default to gpt-4o-mini
      },
      // No tools yet in Phase 1
      tools: [],
    });

    // --- Run the Agent ---
    let agentResponseText = "Sorry, I encountered an issue processing your request.";

    try {
      const agentResult = await step.run("run-chat-agent", async () => {
        // Create network with our agent
        const network = createNetwork({ 
          agents: [chatAgent], 
          defaultModel: chatAgent.model
        });
        
        // Store the clientId in the network state for potential future use with tools
        if (network.state && network.state.kv) {
          network.state.kv.set('clientId', clientId);
        }
        
        // Run the agent with the user's message
        return await network.run(message);
      });

      // Extract the text response from the agent result
      if (agentResult?.output?.length > 0) {
        const lastMessage = agentResult.output[agentResult.output.length - 1];
        if (lastMessage.type === 'text') {
          agentResponseText = typeof lastMessage.content === 'string'
            ? lastMessage.content
            : lastMessage.content.map((c: any) => c.text).join('');
        }
      }
      logger.info(`[handleNewChatMessage] Agent generated response for clientId ${clientId}`, { responseLength: agentResponseText.length });

    } catch (agentError: any) {
      logger.error(`[handleNewChatMessage] Agent execution failed for clientId ${clientId}`, { error: agentError.message });
      agentResponseText = `Sorry, I encountered an error while processing your request: ${agentError.message}`;
    }

    // --- Notify API Server of completion ---
    try {
      const { default: axios } = await import('axios');
      const apiServerPort = process.env.API_SERVER_PORT || '3000';
      await axios.post(`http://localhost:${apiServerPort}/api/chat/response`, {
        clientId,
        response: agentResponseText,
        requiresE2B: false,
      });
      logger.info(`[handleNewChatMessage] Notified API server with response for clientId ${clientId}`);
    } catch (notifyError: any) {
      logger.error(`[handleNewChatMessage] Failed to notify API server: ${notifyError.message}`);
      // Continue execution even if notification fails
    }

    // --- Placeholder for DB Storage (Phase 3) ---
    await step.run("store-conversation-placeholder", async () => {
      logger.info(`[handleNewChatMessage] Placeholder: Storing user message and AI response for clientId ${clientId} in DB.`);
      // DB logic will go here in Phase 3
      return { stored: true };
    });

    const duration = Date.now() - startTime;
    logger.info(`[handleNewChatMessage] Finished processing for clientId ${clientId}`, { durationMs: duration });

    return {
      status: 'success',
      clientId: clientId,
      response: agentResponseText,
      durationMs: duration,
    };
  }
);

logger.info('Functions module fully loaded and exported');

// Export a default for convenience
export default {
  testFunction,
  handleChatMessage,
  complexTaskHandler,
  processChat,
  handleNewChatMessage  // Add the new function to the exports
};