import { createState } from "@inngest/agent-kit";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { EventSchemas, Inngest } from "inngest";
import { z } from "zod";
import { AgentState, codeWritingNetwork } from "./networks/codeWritingNetwork.js";
import { chatAgent } from "./agents/chatAgent.js";
import { type Message } from "@inngest/agent-kit";
import { buildMcpServersConfig } from "./utils/mcpHelpers.js";
import { createMcpIntegrationFunctions } from "./examples/mcpIntegrationExample.js";
import axios from "axios";

// Get API server URL from environment variable or use default
const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:8001';

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
    "athenic/chat.message": {
      data: z.object({
        userId: z.string(),
        organisationId: z.string(),
        clientId: z.string(),
        message: z.string(),
      }),
    },
    "athenic/mcp.query": {
      data: z.object({
        organisationId: z.string(),
        query: z.string(),
      }),
    },
    "athenic/test.mcp_integration": {
      data: z.object({
        organisationId: z.string(),
        clientId: z.string(),
        message: z.string(),
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
  { id: "chat-message", retries: 1 },
  { event: "athenic/chat.message.received" },
  async ({ event, step }) => {
    const { userId, organisationId, clientId, message } = event.data;

    // Initialize state
    const state = createState({
      userId,
      organisationId,
      clientId,
      messageHistory: [
        {
          role: "user",
          content: message,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    // Fetch MCP servers specific to this organization
    const mcpServersConfig = await step.run(
      "Build MCP Servers Config",
      async () => buildMcpServersConfig(organisationId)
    );

    console.log(`Found ${mcpServersConfig.length} MCP servers for organisation ${organisationId}`);

    // Use the chat agent with MCP servers
    const result = await chatAgent.run(message, {
      state,
      // Inject MCP servers into the agent context
      mcpServers: mcpServersConfig,
    } as any);

    // Send the response back to the API server to update client session
    try {
      await step.run("Send Response to API Server", async () => {
        console.log(`Sending response to API server for client ${clientId}`);
        
        await axios.post(`${API_SERVER_URL}/chat/response`, {
          clientId,
          response: result.output,
          requiresE2B: false,
        });
        
        console.log(`Successfully sent response to API server for client ${clientId}`);
      });
    } catch (error) {
      console.error(`Failed to send response to API server: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      response: result.output,
      agentName: chatAgent.name,
    };
  }
);

// Create the MCP integration functions using the factory function
const { runMcpEnabledFunction, testMcpIntegrationFunction } = createMcpIntegrationFunctions(inngest);

// Functions created elsewhere
export const exportedFunctions = [
  runMcpEnabledFunction,
  testMcpIntegrationFunction,
];
