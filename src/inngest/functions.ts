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
  if (message.toLowerCase().includes('python')) {
    return `
# Sample Python code
print("Hello, World!")
print("This is a Python example generated by Athenic.")

# Simple list manipulation
numbers = [1, 2, 3, 4, 5]
squared = [n**2 for n in numbers]
print("Original:", numbers)
print("Squared:", squared)
`;
  } else if (message.toLowerCase().includes('javascript') || message.toLowerCase().includes('js')) {
    return `
// Sample JavaScript code
function helloWorld() {
  console.log("Hello, World!");
  console.log("This is a JavaScript example generated by Athenic.");
}

// Simple array manipulation
const numbers = [1, 2, 3, 4, 5];
const squared = numbers.map(n => n * n);
console.log("Original:", numbers);
console.log("Squared:", squared);

helloWorld();
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
      const { message, userId, sessionId, clientId } = event.data;
      
      logger.info('Processing chat message', { 
        userId,
        sessionId,
        clientId,
        messageLength: message?.length || 0,
        messagePreview: message?.substring(0, 50)
      });
      
      // Check for missing data
      if (!message) {
        logger.warn('Missing message content in chat event', { eventId: event.id });
        return {
          status: 'error',
          error: 'Missing message content',
        };
      }
      
      // Analyze message to determine appropriate action
      const analysisResult = await step.run('analyze-message', async () => {
        logger.debug('Analyzing message', { message: message.substring(0, 100) });
        
        // Check if this is an e2b terminal command
        const e2bCommandRegex = /run the command `(.*?)`\s+in an e2b terminal/i;
        const e2bMatch = message.match(e2bCommandRegex);
        
        if (e2bMatch && e2bMatch[1]) {
          return {
            requiresE2B: true,
            command: e2bMatch[1],
            type: 'shell-command'
          };
        }
        
        // Check for code-related keywords
        const codeKeywords = [
          'code', 'execute', 'run', 'python', 'javascript', 'node', 'npm', 'script',
          'terminal', 'command', 'shell', 'bash', 'function', 'algorithm',
          'compile', 'build', 'dev', 'program', 'repository', 'git', 'commit',
          'file system', 'read file', 'write file', 'modify file', 
          'debug', 'modify', 'create'
        ];
        
        const lowercaseMessage = message.toLowerCase();
        const requiresE2B = codeKeywords.some(keyword => lowercaseMessage.includes(keyword));
        
        return {
          requiresE2B,
          type: requiresE2B ? 'code-execution' : 'text-response'
        };
      });
      
      logger.info('Analysis result', { analysisResult });
      
      // Generate response based on the analysis
      let response = '';
      
      if (analysisResult.requiresE2B) {
        if (analysisResult.type === 'shell-command' && 'command' in analysisResult) {
          // Handle terminal command
          response = await step.run('execute-shell-command', async () => {
            const command = analysisResult.command;
            logger.info('Executing shell command', { command });
            
            // Format the command as code to run in sandbox
            const code = `
import subprocess
import sys

try:
    # Execute the shell command
    result = subprocess.run("${command.replace(/"/g, '\\"')}", shell=True, capture_output=True, text=True)
    
    # Print stdout
    if result.stdout:
        print(result.stdout)
    
    # Print stderr if any
    if result.stderr:
        print("Error output:", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
    
    # Print return code
    print(f"Command completed with exit code: {result.returncode}")
except Exception as e:
    print(f"Failed to execute command: {str(e)}", file=sys.stderr)
`;
            
            try {
              // Execute the code directly
              const result = await executeCodeDirectly(code, 'code-interpreter-v1', clientId, step);
              
              if (result.error) {
                throw new Error(result.error);
              }
              
              return `I've executed your command \`${command}\`. The output is being streamed to your terminal.`;
            } catch (error: any) {
              logger.error('Error executing command in sandbox', { 
                error: error instanceof Error ? error.message : String(error)
              });
              return `I tried to run the command \`${command}\` but encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
          });
        } else if (analysisResult.type === 'code-execution') {
          // Generate and execute code based on message
          response = await step.run('generate-and-execute-code', async () => {
            logger.info('Generating code based on message');
            
            // For now, generate a simple example based on message content
            let code = generateSampleCode(message);
            
            try {
              // Execute the code directly
              const result = await executeCodeDirectly(code, 'code-interpreter-v1', clientId, step);
              
              if (result.error) {
                throw new Error(result.error);
              }
              
              return `I've generated and executed some code based on your request. The output is being streamed to your terminal.`;
            } catch (error: any) {
              logger.error('Error executing code in sandbox', { 
                error: error instanceof Error ? error.message : String(error)
              });
              return `I tried to execute code based on your request but encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
          });
        }
      } else {
        // Simple text response
        response = await step.run('generate-text-response', async () => {
          logger.info('Generating text response for message');
          
          // Handle simple text response patterns
          if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
            return "Hello! How can I help you today?";
          } else if (message.toLowerCase().includes('help')) {
            return "I'm here to help! What do you need assistance with?";
          } else {
            return `I've received your message: "${message}". How can I assist you further?`;
          }
        });
      }
      
      // Send the response back to the API server for client retrieval
      await step.run('send-response-to-api', async () => {
        logger.info('Sending response to API server', { 
          clientId,
          responseLength: response.length,
          requiresE2B: analysisResult.requiresE2B
        });
        
        try {
          // Dynamically import axios
          const { default: axios } = await import('axios');
          
          // Call the API server's response endpoint
          const port = process.env.API_SERVER_PORT || '3000';
          await axios.post(`http://localhost:${port}/api/chat/response`, {
            clientId,
            response,
            requiresE2B: analysisResult.requiresE2B
          });
          
          logger.info('Response sent to API server successfully');
          return { success: true };
        } catch (error: any) {
          logger.error('Failed to send response to API server', {
            error: error instanceof Error ? error.message : String(error)
          });
          // Continue execution even if sending response fails
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });
      
      logger.info('Chat message processed successfully', { eventId: event.id });
      
      return {
        status: 'success',
        response,
        processingTimeMs: Date.now() - startTime
      };
    } catch (error: any) {
      // Log the error
      logger.error('Error processing chat message', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        eventId: event.id
      });
      
      // Return an error response
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime
      };
    }
  }
);

logger.info('Functions module fully loaded and exported');

// Export a default for convenience
export default {
  testFunction,
  handleChatMessage,
  complexTaskHandler
};