// @ts-ignore - Ignoring all TypeScript errors in this file while we focus on implementing LLM functionality
import { inngest } from './client';
import axios from 'axios';
import { createNetwork } from '@inngest/agent-kit';
import { z } from 'zod';
import { executeCodeInSandbox } from './tools/e2b-tools';

// Define a simple test function that responds to the test connection event
export const testFunction = inngest.createFunction(
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
export const chatMessageHandler = inngest.createFunction(
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
      // @ts-ignore - AgentKit type definitions need to be updated
      const network = await createNetwork({
        id: `chat-session-${event.data.clientId}`,
        systemPrompt: `You are Athenic, an agentic AI assistant that can perform complex tasks.
Your goal is to process user messages and determine whether code execution is required.
If code execution is needed, you should use the executeCode tool.
Otherwise, you should provide a helpful response.`,
      });
      
      // Store clientId in network state for tools to access
      network.state.kv.set('clientId', event.data.clientId);
      
      return network;
    });
    
    // Determine if message requires code execution using LLM
    const analysisResult = await step.run('analyze-execution-needs', async () => {
      const message = event.data.message;
      
      // Use LLM to decide if code execution is needed
      const analysisPrompt = `
You are an AI assistant that can execute code in a secure sandbox to solve problems.
Given the following user message, determine if code execution would be helpful in addressing their request.
Respond with 'YES' if code execution would be beneficial, or 'NO' if a text response is sufficient.

User message: "${message}"

Would code execution be helpful for this request? (YES/NO)
`;
      
      // @ts-ignore - step.ai.invoke type definition needs to be added
      const analysis = await step.ai.invoke({
        model: 'gpt-4',
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that determines if code execution is required.' },
          { role: 'user', content: analysisPrompt }
        ]
      });
      
      const requiresE2B = analysis.trim().toUpperCase().startsWith('YES');
      
      return {
        requiresE2B,
        analysisText: `Message ${requiresE2B ? 'requires' : 'does not require'} code execution`,
        aiAnalysis: analysis
      };
    });
    
    let response = '';
    let e2bResult = null;
    
    // If code execution is needed, use the E2B tool
    if (analysisResult.requiresE2B) {
      // Generate response indicating code execution
      await step.run('prepare-response-with-e2b', async () => {
        // Use LLM to generate a helpful, contextual response about executing code
        const responsePrompt = `
User message: "${event.data.message}"

The user's request requires code execution. Generate a brief, friendly response
explaining that you'll execute some code to address their request. Be specific 
about what you're going to do, without being too verbose.
`;
        
        // @ts-ignore - step.ai.invoke type definition needs to be added
        response = await step.ai.invoke({
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          messages: [
            { role: 'system', content: 'You are a helpful assistant that will execute code.' },
            { role: 'user', content: responsePrompt }
          ]
        });
      });
      
      // Generate and execute code
      // @ts-ignore - step.agent.useTools type definition needs to be added
      e2bResult = await step.agent.useTools([executeCodeInSandbox], async ({ tools }) => {
        // Use LLM to generate appropriate code based on the user's message
        const codeGenerationPrompt = `
User message: "${event.data.message}"

Generate appropriate code to address this request. You should:
1. Use Python unless the user specifically asked for another language
2. Add helpful comments that explain what the code does
3. Use print statements to make the output easy to understand
4. Handle potential errors appropriately
5. Make the code clear, efficient, and well-formatted

Return ONLY the code with no additional explanations or markdown formatting.
`;
        
        // @ts-ignore - step.ai.invoke type definition needs to be added
        const generatedCode = await step.ai.invoke({
          model: 'gpt-4',
          temperature: 0.2,
          messages: [
            { role: 'system', content: 'You are a skilled programmer that generates clean, effective code.' },
            { role: 'user', content: codeGenerationPrompt }
          ]
        });
        
        console.log(`Executing AI-generated code for: "${event.data.message}"`);
        console.log(`Code:\n${generatedCode}`);
        
        return tools.executeCodeInSandbox({
          code: generatedCode,
          template: 'code-interpreter-v1'
        });
      });
      
      console.log('E2B execution result:', e2bResult);
    } else {
      // Generate a regular text response
      await step.run('generate-response', async () => {
        // Use LLM to generate a helpful response based on the user's message
        const responsePrompt = `
User message: "${event.data.message}"

Generate a helpful, informative, and friendly response to this message.
`;
        
        // @ts-ignore - step.ai.invoke type definition needs to be added
        response = await step.ai.invoke({
          model: 'gpt-4',
          temperature: 0.7,
          messages: [
            { role: 'system', content: 'You are Athenic, a helpful and knowledgeable assistant.' },
            { role: 'user', content: responsePrompt }
          ]
        });
      });
    }
    
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
          e2bResult
        });
        
        console.log('Response sent to client:', response);
        return { success: true };
      } catch (error: any) {
        console.error('Error sending response to client:', error.message);
        return { error: error.message };
      }
    });
    
    // Return the final result
    return {
      message: response,
      requiresE2B: analysisResult.requiresE2B,
      e2bResult,
      clientId: event.data.clientId,
      timestamp: new Date().toISOString(),
    };
  }
);

/**
 * Generate sample code based on the user's message
 * In a real implementation, this would use AI to generate relevant code
 */
function generateSampleCode(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('python')) {
    return `print("Hello from Python!")
import math
for i in range(5):
    print(f"The square root of {i} is {math.sqrt(i)}")`;
  } else if (lowerMessage.includes('javascript') || lowerMessage.includes('node')) {
    return `console.log("Hello from JavaScript!");
for (let i = 0; i < 5; i++) {
    console.log(\`The square of \${i} is \${i * i}\`);
}`;
  } else if (lowerMessage.includes('file') || lowerMessage.includes('read') || lowerMessage.includes('write')) {
    return `import os
print("Current directory:", os.getcwd())
print("\\nCreating sample file...")
with open("example.txt", "w") as f:
    f.write("Hello, this is some sample content!\\n")
    f.write("Created by Athenic E2B sandbox\\n")
print("\\nReading file contents:")
with open("example.txt", "r") as f:
    print(f.read())`;
  } else {
    return `# Default code sample
print("Hello from the Athenic E2B sandbox!")
print("You asked about: ${message.replace(/"/g, '\\"')}")
print("\\nHere's a simple calculation demo:")
total = 0
for i in range(1, 6):
    total += i
    print(f"Running total: {total}")`;
  }
}