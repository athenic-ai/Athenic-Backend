const { inngest } = require('./client');
const axios = require('axios');
const { createNetwork } = require('@inngest/agent-kit');

// Define a simple test function that responds to the test connection event
const testFunction = inngest.createFunction(
  { id: 'test-connection-handler' },
  { event: 'athenic/test.connection' },
  async ({ event, step }) => {
    // Log receipt of the event
    await step.run('log-event-receipt', () => {
      console.log('Received test connection event:', event);
      return { received: true };
    });

    // Process the event (simple echo for testing)
    const result = await step.run('process-test-event', () => {
      return {
        message: `Processed test event: ${event.data.message}`,
        receivedAt: new Date().toISOString(),
        originalTimestamp: event.data.timestamp,
      };
    });

    return result;
  }
);

// Define a chat message handler using AgentKit
const chatMessageHandler = inngest.createFunction(
  { id: 'chat-message-handler' },
  { event: 'athenic/chat.message.received' },
  async ({ event, step }) => {
    // Log receipt of the chat message
    await step.run('log-chat-message', () => {
      console.log('Received chat message:', event.data.message);
      return { received: true };
    });
    
    // Create AgentKit network
    const network = await step.run('create-agent-network', async () => {
      return await createNetwork({
        id: `chat-session-${event.data.clientId}`,
        systemPrompt: `You are Athenic, an agentic AI assistant that can perform complex tasks.
Your goal is to process user messages and determine whether code execution is required.
If code execution is needed, you should use the executeCode tool.
Otherwise, you should provide a helpful response.`,
      });
    });
    
    // Store the clientId in a variable for tools to access
    const clientId = event.data.clientId;

    // Determine if message requires code execution
    const analysisResult = await step.run('analyze-execution-needs', async () => {
      // Simple keyword check for now until we implement full AI inference
      const message = event.data.message.toLowerCase();
      const codeKeywords = [
        'code', 'execute', 'run', 'python', 'javascript', 'node', 'npm', 'script',
        'terminal', 'command', 'shell', 'bash', 'function', 'algorithm',
        'compile', 'build', 'dev', 'program', 'repository', 'git', 'commit',
        'file system', 'read file', 'write file', 'modify file', 
        'debug', 'modify', 'create'
      ];
      
      const requiresE2B = codeKeywords.some(keyword => message.includes(keyword));
      
      return {
        requiresE2B,
        analysisText: `Message ${requiresE2B ? 'requires' : 'does not require'} code execution`
      };
    });
    
    // Generate a response based on the message
    const response = await step.run('generate-response', async () => {
      // For now, using a simple hardcoded response until we implement AI integration
      if (analysisResult.requiresE2B) {
        return `I'll need to execute some code to help with "${event.data.message.substring(0, 50)}${event.data.message.length > 50 ? '...' : ''}". Let me set that up for you.`;
      } else {
        return `You said: "${event.data.message.substring(0, 50)}${event.data.message.length > 50 ? '...' : ''}". How can I help with that?`;
      }
    });
    
    // Send the response back to the client
    await step.run('send-response-to-client', async () => {
      try {
        // Get the API_SERVER_PORT from environment or default to 3000
        const port = process.env.API_SERVER_PORT || '3000';
        const apiUrl = `http://localhost:${port}/api/chat/response`;
        
        // Send the response to the API server
        await axios.post(apiUrl, {
          clientId: event.data.clientId,
          response,
          requiresE2B: analysisResult.requiresE2B,
        });
        
        console.log('Response sent to client:', response);
        return { success: true };
      } catch (error) {
        console.error('Error sending response to client:', error.message);
        return { error: error.message };
      }
    });
    
    // Return the final result
    return {
      message: response,
      requiresE2B: analysisResult.requiresE2B,
      clientId: event.data.clientId,
      timestamp: new Date().toISOString(),
    };
  }
);

module.exports = { testFunction, chatMessageHandler }; 