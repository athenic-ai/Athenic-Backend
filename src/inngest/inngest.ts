import { createState } from "@inngest/agent-kit";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { EventSchemas, Inngest } from "inngest";
import { z } from "zod";
import { AgentState, codeWritingNetwork } from "./networks/codeWritingNetwork.js";
import { runChatSession } from "./networks/chatNetwork.js";

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

export const chatMessageFunction = inngest.createFunction(
  { id: "chat-message-handler", retries: 2 },
  { event: "athenic/chat.message.received" },
  async ({ event, step }) => {
    const { message, userId, organisationId, clientId } = event.data;
    
    // Log the received message
    await step.run("log-message", () => {
      console.log(`Received message from user ${userId}: ${message}`);
      return { received: true };
    });
    
    // Process the message using the chat network
    const response = await step.run("process-message", async () => {
      try {
        // Process the message with our chat network
        const aiResponse = await runChatSession(message, {
          userId,
          organisationId,
          clientId
        });
        
        return {
          response: aiResponse,
          error: null
        };
      } catch (error) {
        console.error('Error processing chat message:', error);
        return {
          response: "I apologize, but I encountered an error processing your request. Please try again.",
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });
    
    // Send the response back to the API server
    await step.run("send-response", async () => {
      try {
        // Get the API server port from environment variable or default to 8001
        const apiPort = process.env.API_SERVER_PORT || '8001';
        const apiUrl = `http://localhost:${apiPort}/chat/response`; // Use the /chat/response endpoint, not /api/chat/response

        // Make a POST request to the API server's response endpoint
        const apiResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientId,
            response: response.response,
            requiresE2B: false, // Assuming no E2B for basic chat for now
          }),
        });
        
        if (!apiResponse.ok) {
          throw new Error(`API responded with status: ${apiResponse.status}`);
        }
        
        return { sent: true };
      } catch (error) {
        console.error('Failed to send response back to API:', error);
        return { sent: false, error: String(error) };
      }
    });
    
    return { processed: true };
  }
);
