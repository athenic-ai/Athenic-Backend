import { createState } from "@inngest/agent-kit";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { EventSchemas, Inngest } from "inngest";
import { z } from "zod";
import { AgentState, codeWritingNetwork } from "./networks/codeWritingNetwork.js";
import { chatAgent } from "./agents/chatAgent.js";
import { type Message } from "@inngest/agent-kit";

export const inngest = new Inngest({
  id: "athenic-backend",
  schemas: new EventSchemas().fromZod({
    "swebench/run": {
      data: z.object({
        repo: z.string(),
        base_commit: z.string(),
        environment_setup_commit: z.string(),
        problem_statement: z.string(),
      }),
    },
    "test/connection": {
      data: z.object({
        message: z.string(),
        timestamp: z.string(),
      }),
    },
    "athenic/chat.message.received": {
      data: z.object({
        message: z.string(),
        userId: z.string(),
        organisationId: z.string(),
        clientId: z.string(),
        timestamp: z.string(),
      }),
    },
  }),
});

export const fn = inngest.createFunction(
  { id: "agent", retries: 2 },
  { event: "swebench/run" },
  async ({ event, step }) => {
    // This is some basic stuff to initialize and set up the repos
    // for the swebench test.
    //
    // First, we clone the repo, then we ensure we're on the correct base commit.
    const dir = `./opt/${event.data.repo}`;
    await step.run("clone repo", () => {
      // Check if the dir already exists.
      if (fs.existsSync(dir)) {
        return;
      }
      console.log("creating repo");
      fs.mkdirSync(dir, { recursive: true });
      execSync(`cd ${dir} && git init`);
      // use the `https` version so that we can pull without a pubkey.
      execSync(
        `cd ${dir} && git remote add origin https://github.com/${event.data.repo}.git`
      );
    });

    await step.run("check out commit", () => {
      console.log("checking out commit");
      execSync(
        `cd ${dir} && git fetch origin ${event.data.base_commit} --depth=1`
      );
      execSync(`cd ${dir} && git reset --hard FETCH_HEAD`);
    });

    // Create new state and store the repo in KV for access via tools.
    const state = createState<AgentState>({
      repo: event.data.repo,
      done: false,
    });

    await codeWritingNetwork.run(event.data.problem_statement, {
      state,
    });

    await step.run("history", () => {
      return state.results.map(r => ({
        ...r.export(),
        checksum: r.checksum,
      }));
    });
  }
);

// Helper function for timeout (could be moved elsewhere)
function createTimeout(ms: number, message: string) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

export const chatMessageFunction = inngest.createFunction(
  { id: "chat-message-handler", retries: 0 }, // Keep retries at 0 for testing
  { event: "athenic/chat.message.received" },
  async ({ event, step }) => {
    const { message, userId, organisationId, clientId } = event.data;
    
    await step.run("log-message", () => {
      console.log(`Received message from user ${userId}: ${message}`);
      return { received: true };
    });
    
    let responsePayload: { response: string; error: string | null } = {
        response: "An unexpected issue occurred before processing could complete.",
        error: "Initialization failure"
    };
    
    try {
      // Call chatAgent.run directly with a timeout
      console.log("Running chatAgent.run directly...");
      const TIMEOUT_MS = 30000;
      const agentResponse = await Promise.race([
          chatAgent.run(message), // Pass only the message prompt
          createTimeout(TIMEOUT_MS, `Agent execution timed out after ${TIMEOUT_MS} ms`)
      ]) as { output: Message[] }; // Type assertion for expected success structure

      console.log("chatAgent.run call completed successfully.");
      
      // --- Logic to extract content from agentResponse.output --- 
      let finalContent = "No valid text response found in agent output.";
      if (agentResponse?.output && agentResponse.output.length > 0) {
        // Find the assistant message
        const assistantMessage = agentResponse.output.find(m => m.role === 'assistant');
        
        // Check if it exists and assume it has content based on role
        if (assistantMessage) { // No need to check role again, find did that
            // Use type assertion if necessary to access content
             const content = (assistantMessage as any).content;
             if (typeof content === 'string') {
                 finalContent = content;
                 console.log(`Extracted content: ${finalContent.substring(0, 50)}...`);
             } else if (Array.isArray(content)) {
                 // Handle potential structured content (e.g., Anthropic)
                 const textBlock = content.find((block: any) => block.type === 'text');
                 if (textBlock && typeof textBlock.text === 'string') {
                     finalContent = textBlock.text;
                     console.log(`Extracted content from block: ${finalContent.substring(0, 50)}...`);
                 }
             } else {
                 console.log("Assistant message content is not a string or suitable array.");
             }
        } else {
             console.log("No message with role 'assistant' found in agent output.");
        }
      } else {
        console.log("No output array found in agent response.");
      }
      // --- End of extraction logic ---
      
      responsePayload = {
        response: finalContent,
        error: null
      };

    } catch (error) {
      // Catch errors from chatAgent.run or the timeout
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error during agent execution:', errorMessage);

      // Check specifically for our timeout message
      if (errorMessage.includes('Agent execution timed out after')) { 
        console.log('Caught agent timeout error. Setting timeout fallback response.');
        responsePayload = {
          response: "I apologize, but your request timed out. Please try again later.",
          error: errorMessage
        };
      } else {
        console.log('Caught non-timeout error during agent execution. Setting generic error response.');
        responsePayload = {
          response: "I apologize, but an unexpected error occurred. Please try again later.",
          error: errorMessage
        };
      }
    }
    
    // --- Send Response Step (always runs) --- 
    console.log("Proceeding to send response step.");
    await step.run("send-response", async () => {
      console.log("Executing send-response step.");
      try {
        const apiPort = process.env.API_SERVER_PORT || '8001';
        const apiUrl = `http://localhost:${apiPort}/chat/response`;
        
        const responseToSend = typeof responsePayload.response === 'string' ? responsePayload.response : JSON.stringify(responsePayload.response);
        console.log(`Sending final response to API: ${responseToSend.substring(0, 50)}...`);
        
        const apiResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId, // Pass clientId back to the API
            response: responseToSend,
            requiresE2B: false, // Chat agent doesn't use E2B
            error: responsePayload.error 
          }),
        });
        
        if (!apiResponse.ok) {
          console.error(`API responded with status: ${apiResponse.status} during send.`);
          throw new Error(`API call failed with status: ${apiResponse.status}`); 
        }
        
        console.log("Response successfully sent to API server.");
        return { sent: true };
      } catch (sendError) {
        console.error('Failed to send response back to API:', sendError);
        throw sendError; // Fail this step if sending fails
      }
    });
    
    console.log("chatMessageFunction finished.");
    return { processed: responsePayload.error === null }; // Indicate success if no error was caught
  }
);
