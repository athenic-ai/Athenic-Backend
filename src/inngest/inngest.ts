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
import { dumpNetwork } from './networks/dumpNetwork.js';

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
    "dump/create.requested": {
      data: z.object({
        userId: z.string(),
        accountId: z.string(),
        inputText: z.string(),
        clientId: z.string().optional(),
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

// Type definitions for message outputs
interface TextMessage {
  type: 'text';
  content: string | { text: string }[];
  role: 'user' | 'system' | 'assistant';
}

interface ToolMessage {
  type: 'tool_call' | 'tool_outputs';
  tools: any[];
  role: 'user' | 'assistant';
}

type AgentMessage = TextMessage | ToolMessage;

// Define message types for TypeScript
interface MessageHistoryItem {
  role: string;
  content: string;
  timestamp: string;
}

interface ChatStateData {
  userId: string;
  organisationId: string;
  clientId: string;
  messageHistory: MessageHistoryItem[];
}

// Define the agent result interface
interface AgentResult {
  messages?: Array<{
    type: string;
    content: string | Array<{text?: string} | string> | any;
    role?: string;
    toolOutput?: any;
  }>;
  output?: any;
  [key: string]: any;
}

/**
 * Directly log to console to ensure visibility in terminal output
 */
function terminalLog(message: string) {
  // Force output to console for visibility in terminal
  console.log(`\n[INNGEST_LOG] ${message}\n`);
}

// Helper function to parse tool calls from agent output
function extractToolCalls(agentResult: AgentResult): any[] {
  try {
    terminalLog(`Attempting to extract tool calls from agent result: ${JSON.stringify(agentResult.output)}`);
    
    // Check if the LLM output is in the structured format we requested
    if (agentResult.output && agentResult.output.length > 0) {
      const lastMessage = agentResult.output[agentResult.output.length - 1];
      
      terminalLog(`Last message: ${JSON.stringify(lastMessage)}`);
      
      if (lastMessage.type === 'text' && lastMessage.content) {
        let content = lastMessage.content;
        terminalLog(`Content type: ${typeof content}`);

        // Handle if content is a string that contains JSON
        if (typeof content === 'string') {
          // Remove any potential markdown formatting
          if (content.includes('```json')) {
            content = content.replace(/```json\s*([\s\S]*?)\s*```/g, '$1');
            terminalLog(`Extracted JSON from markdown: ${content}`);
          }
          
          // Try to parse the content as JSON if it looks like JSON
          if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
            try {
              const parsedContent = JSON.parse(content.trim());
              terminalLog(`Successfully parsed content as JSON: ${JSON.stringify(parsedContent)}`);
              
              // Check if the parsed content has tool_calls
              if (parsedContent.tool_calls && Array.isArray(parsedContent.tool_calls)) {
                terminalLog(`Found tool_calls in parsed JSON: ${JSON.stringify(parsedContent.tool_calls)}`);
                return parsedContent.tool_calls;
              }
            } catch (err) {
              terminalLog(`Failed to parse content as JSON: ${err}`);
              
              // Try to extract JSON with regex as a fallback
              const jsonRegex = /{[\s\S]*}/g;
              const jsonMatch = content.match(jsonRegex);
              
              if (jsonMatch && jsonMatch.length > 0) {
                try {
                  const extractedJson = JSON.parse(jsonMatch[0]);
                  terminalLog(`Extracted JSON using regex: ${JSON.stringify(extractedJson)}`);
                  
                  if (extractedJson.tool_calls && Array.isArray(extractedJson.tool_calls)) {
                    return extractedJson.tool_calls;
                  }
                } catch (regexErr) {
                  terminalLog(`Failed to parse regex-extracted JSON: ${regexErr}`);
                }
              }
            }
          } 
          
          // Last resort: Check if the content mentions using a tool for a specific query
          // This is a fallback for cases where the LLM doesn't follow the format
          if (content.toLowerCase().includes('pubmed') && 
             (content.toLowerCase().includes('search') || content.toLowerCase().includes('query'))) {
            terminalLog(`Inferring PubMed tool call from text content`);
            
            // Extract the query from the message
            const queryMatch = content.match(/about\s+([^\.]+)/i) || 
                              content.match(/for\s+([^\.]+)/i) ||
                              content.match(/search\s+for\s+([^\.]+)/i);
                              
            const query = queryMatch ? queryMatch[1].trim() : "beech tree bark";
            
            terminalLog(`Inferred query: ${query}`);
            
            return [{
              id: `tool_call_${Date.now()}`,
              type: 'tool_call',
              function: {
                name: 'pubmed_search', // Hardcoded tool name based on context
                arguments: JSON.stringify({ query: query })
              }
            }];
          }
        }
      }
    }
    
    return []; // Default to no tool calls
  } catch (error) {
    terminalLog(`Error extracting tool calls: ${error}`);
    return [];
  }
}

// Function to find an MCP server by name
function findMcpServerByName(mcpServers: any[], serverName: string): any | null {
  return mcpServers.find(server => server.serverName === serverName) || null;
}

/**
 * Gets the E2B sandbox ID associated with a specific MCP server.
 * This example assumes a fixed mapping or logic to determine the sandbox ID.
 * In a real application, this might involve looking up configuration or managing sandbox lifecycles.
 */
function getE2bSandboxIdForMcpServer(serverName: string): string | null {
  // Example logic: Return a specific sandbox ID for a known server
  // Replace this with your actual logic for managing sandboxes per server/tool
  if (serverName === 'e2b-examples') {
    // For testing, return a placeholder or dynamically managed ID
    return process.env.E2B_SANDBOX_ID_MCP_EXAMPLES || null; 
  } else if (serverName === 'e2b-code-interpreter') {
    // Example: Another server might use a different sandbox
    return process.env.E2B_SANDBOX_ID_CODE_INTERPRETER || null;
  }
  // Default: No specific sandbox associated
  return null;
}

/**
 * Executes a tool on an MCP server using E2B.
 * Assumes the E2B environment has the necessary tools installed or can run the command.
 */
async function executeMcpTool(mcpServer: any, toolName: string, toolInput: any): Promise<any> {
  const e2bSandboxId = getE2bSandboxIdForMcpServer(mcpServer.serverName);
  if (!e2bSandboxId) {
    throw new Error(`No E2B sandbox configured for MCP server: ${mcpServer.serverName}`);
  }
  if (!process.env.E2B_API_KEY) {
    throw new Error("E2B_API_KEY environment variable not set.");
  }

  console.log(`Executing tool '${toolName}' on MCP server '${mcpServer.serverName}' in sandbox '${e2bSandboxId}'`);

  // Construct the command to execute the tool via E2B
  // This is highly dependent on how your E2B environment and the MCP server tools are set up.
  // Example: Assuming a CLI tool or script exists in the sandbox
  const inputJsonString = JSON.stringify(toolInput).replace(/'/g, "'\\''"); // Escape single quotes for shell
  const command = `mcp-tool-runner --server="${mcpServer.serverName}" --tool="${toolName}" --input='${inputJsonString}'`;
  
  console.log(`E2B Command: ${command}`);

  // Use E2B SDK to execute the command
  const { Sandbox } = await import('@e2b/sdk');
  let sandbox: typeof Sandbox | null = null; 
  
  try {
    sandbox = await Sandbox.reconnect(e2bSandboxId);
    console.log(`Reconnected to sandbox: ${e2bSandboxId}`);
    
    const execution = await sandbox.process.start(command);
    const output = await execution.wait();

    console.log(`E2B Execution Output (stdout): ${output.stdout}`);
    console.log(`E2B Execution Output (stderr): ${output.stderr}`);

    if (output.exitCode !== 0) {
      throw new Error(`Tool execution failed with exit code ${output.exitCode}: ${output.stderr}`);
    }

    // Parse the output (assuming the tool runner outputs JSON)
    try {
      return JSON.parse(output.stdout);
    } catch (parseError) {
      console.error(`Failed to parse tool output JSON: ${parseError}`);
      // Return raw stdout if JSON parsing fails, might still be useful
      return { rawOutput: output.stdout }; 
    }
  } catch (error) {
    console.error(`E2B execution failed: ${error}`);
    throw error; // Rethrow to be caught by the caller
  } finally {
    if (sandbox) {
      await sandbox.close();
      console.log(`Closed sandbox connection: ${e2bSandboxId}`);
    }
  }
}

export const chatMessageFunction = inngest.createFunction(
  { id: 'chat-message-handler', name: 'Handle Chat Message' },
  { event: 'athenic/chat.message' },
  async ({ event, step, logger }) => {
    const { userId, organisationId, clientId, message } = event.data;
    console.log("\n\n============== STARTING CHAT MESSAGE FUNCTION ==============");
    console.log(`Received message from user ${userId} in org ${organisationId} (client: ${clientId}): "${message}"`);

    let responseMessage = "I'm sorry, I couldn't process your request.";
    let requiresE2B = false; // Flag if an E2B sandbox was needed
    let e2bSandboxId = null; // Store the ID if used
    const toolCalls: any[] = []; // Track executed tool calls

    // 1. Fetch MCP Servers configuration for the organisation
    let mcpServers: any[] = [];
    try {
      mcpServers = await buildMcpServersConfig(organisationId, logger);
      console.log(`Fetched ${mcpServers.length} MCP servers for organisation ${organisationId}`);
    } catch (error) {
      console.error(`Failed to fetch MCP servers for organisation ${organisationId}: ${error}`);
      // Proceed without MCP servers, but log the error
    }

    // 2. Initialize message history (in a real app, fetch from DB)
    const initialMessageHistory: MessageHistoryItem[] = [
      { role: 'user', content: message, timestamp: new Date().toISOString() }
    ];
    
    // 3. Create initial agent state
    const initialState = createState<ChatStateData>({
      userId,
      organisationId,
      clientId,
      messageHistory: initialMessageHistory,
    });

    // 4. Run the chat agent
    const agentRunResult = await step.run('invoke-chat-agent', async () => {
      return await chatAgent.run(message, { 
        state: initialState, 
        mcpServers: mcpServers, // Pass MCP config to the agent
      });
    });
    
    console.log(`Agent run completed. Result keys: ${Object.keys(agentRunResult || {})}`);
    //console.log(`Full Agent Run Result: ${JSON.stringify(agentRunResult)}`);
    
    // 5. Process Agent Result: Check for Tool Calls
    const extractedTools = extractToolCalls(agentRunResult);
    console.log(`Extracted ${extractedTools.length} tool calls`);

    if (extractedTools.length > 0) {
      const firstToolCall = extractedTools[0]; // Handle only the first tool call for now
      toolCalls.push(firstToolCall);
      console.log(`Processing first tool call: ${JSON.stringify(firstToolCall)}`);

      const toolName = firstToolCall.function?.name;
      const toolInputString = firstToolCall.function?.arguments;
      const mcpServerName = firstToolCall.mcp_server_name; // Check if the agent specified an MCP server

      console.log(`Tool Name: ${toolName}, Server Name: ${mcpServerName}`);

      if (toolName && mcpServerName) {
        const targetMcpServer = findMcpServerByName(mcpServers, mcpServerName);

        if (!targetMcpServer) {
          console.warn(`MCP server "${mcpServerName}" not found or configured for organisation ${organisationId}.`);
          responseMessage = `I wanted to use the tool "${toolName}" from the "${mcpServerName}" integration, but it doesn't seem to be available or configured correctly for your account.`;
        } else {
          try {
            console.log(`Attempting to execute tool "${toolName}" on server "${mcpServerName}"`);
            requiresE2B = true; // Assume MCP tool execution requires E2B
            e2bSandboxId = getE2bSandboxIdForMcpServer(mcpServerName); // Get sandbox ID
            
            if (!e2bSandboxId) {
              throw new Error(`No E2B sandbox found for MCP server ${mcpServerName}`);
            }

            let toolInput = {};
            try {
              if (toolInputString) {
                toolInput = JSON.parse(toolInputString);
              }
            } catch (parseError) {
              console.error(`Failed to parse tool input arguments: ${parseError}`);
              throw new Error("Invalid format for tool arguments.");
            }
            
            const toolResult = await step.run('execute-mcp-tool', async () => {
              return await executeMcpTool(targetMcpServer, toolName, toolInput);
            });
            
            console.log(`Tool execution result: ${JSON.stringify(toolResult)}`);

            // Update message history for the next step
            const currentMessageHistory = agentRunResult.state?.data?.messageHistory || initialMessageHistory;
            // Add the agent's initial response (containing the tool call) to history
            if (agentRunResult.output && agentRunResult.output.length > 0) {
                const agentResponse = agentRunResult.output[agentRunResult.output.length - 1];
                currentMessageHistory.push({
                    role: 'assistant', // Assuming agent's response is assistant role
                    content: JSON.stringify(agentResponse), // Store the raw agent response with tool call
                    timestamp: new Date().toISOString()
                });
            }
            
            // Add the tool result to message history
            currentMessageHistory.push({
              role: 'function', // Use 'function' or 'tool' role based on OpenAI standards
              content: JSON.stringify({ name: toolName, output: toolResult }), // Structure tool output
              timestamp: new Date().toISOString()
            });
            
            // Process the tool result with the agent to get a final response
            const summaryResult = await step.run('summarize-tool-result', async () => {
              // Update the state with the new message history
              const updatedState = createState<ChatStateData>({
                userId, 
                organisationId, 
                clientId, 
                messageHistory: currentMessageHistory,
              });
              
              // Ask the agent to summarize the tool result for the user
              const summaryPrompt = `The tool "${toolName}" returned the following result: ${JSON.stringify(toolResult)}. Please present this information clearly to the user who asked: "${message}"`;
              
              return await chatAgent.run(summaryPrompt, { state: updatedState });
            });
            
            console.log(`Summary result: ${JSON.stringify(summaryResult)}`);
            
            // Extract the final text response from the summary agent result
            if (summaryResult.output && summaryResult.output.length > 0) {
              const lastMessage = summaryResult.output[summaryResult.output.length - 1];
              if (lastMessage && lastMessage.type === 'text') {
                const content = lastMessage.content;
                if (typeof content === 'string') {
                  responseMessage = content;
                } else if (Array.isArray(content)) {
                  responseMessage = content
                    .map((part: any) => typeof part === 'string' ? part : (part?.text || ''))
                    .filter(Boolean)
                    .join(' ');
                }
              }
            }
          } catch (toolError: any) {
            console.error(`Error executing or processing tool "${toolName}": ${toolError}`);
            responseMessage = `I tried to use the ${toolName} tool, but encountered an error: ${toolError.message}. Please try again later.`;
          }
        }
      } else {
        console.warn(`Missing tool_name or mcp_server_name in tool call: ${JSON.stringify(firstToolCall)}`);
        responseMessage = "I wanted to use a tool to answer your question, but I couldn't identify which tool or integration to use. Could you specify it? For example, 'Use the GitHub tool to...'";
      }
    } else {
      // If no tool calls, process the regular text response from the agent
      try {
        console.log(`Processing text response from agent`);
        if (agentRunResult && agentRunResult.output && agentRunResult.output.length > 0) {
          const lastMessage = agentRunResult.output[agentRunResult.output.length - 1];
          if (lastMessage && lastMessage.type === 'text') {
            const content = lastMessage.content;
            if (typeof content === 'string') {
              responseMessage = content;
            } else if (Array.isArray(content)) {
              responseMessage = content
                .map((part: any) => typeof part === 'string' ? part : (part?.text || ''))
                .filter(Boolean)
                .join(' ');
            }
          }
        }
      } catch (error) {
        console.error("Error processing text response:", error);
        // Keep the default error message
      }
    }
    
    console.log(`Final response message preview: "${responseMessage.substring(0, 100)}${responseMessage.length > 100 ? '...' : ''}"`);

    // Send the response back to the API server
    try {
      console.log(`Sending response to API server at ${API_SERVER_URL}/chat/response`);
      await axios.post(`${API_SERVER_URL}/chat/response`, {
        clientId,
        response: responseMessage,
        requiresE2B,
        e2bSandboxId
      });
      console.log(`API server response received successfully.`);
    } catch (error: any) {
      // Log detailed error information if available
      const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
      console.error(`Error sending response to API server: ${errorDetails}`);
    }

    console.log("============== CHAT MESSAGE FUNCTION COMPLETED ==============\n\n");
    
    // Return relevant information
    return {
      status: 'completed',
      responseLength: responseMessage.length,
      mcpServersAvailable: mcpServers.length,
      toolCallsAttempted: toolCalls.length,
      e2bRequired: requiresE2B,
      e2bSandboxIdUsed: e2bSandboxId
    };
  }
);

// Create the MCP integration functions using the factory function
const { runMcpEnabledFunction, testMcpIntegrationFunction } = createMcpIntegrationFunctions(inngest);

// Functions created elsewhere
export const exportedFunctions = [
  runMcpEnabledFunction,
  testMcpIntegrationFunction,
  fn,
  chatMessageFunction,
];
