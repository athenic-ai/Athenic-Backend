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
            
            return [{
              tool_name: "pubmed_search",
              mcp_server_name: "PubMed",
              tool_input: {
                query: query
              }
            }];
          }
        }
        
        // Check if content has structured tool calls
        if (typeof content === 'object' && content !== null && 'tool_calls' in content) {
          if (Array.isArray(content.tool_calls)) {
            terminalLog(`Found tool_calls in content object: ${JSON.stringify(content.tool_calls)}`);
            return content.tool_calls;
          }
        }
      }
    }
    
    // If no structured tool calls found, check if AgentKit detected any
    if (agentResult.toolCalls && Array.isArray(agentResult.toolCalls) && agentResult.toolCalls.length > 0) {
      terminalLog(`Found toolCalls in agentResult: ${JSON.stringify(agentResult.toolCalls)}`);
      return agentResult.toolCalls;
    }
    
    terminalLog(`No tool calls found in agent response`);
    return [];
  } catch (error) {
    console.error(`Error extracting tool calls: ${error}`);
    return [];
  }
}

// Helper function to find the MCP server by name
function findMcpServerByName(mcpServers: any[], serverName: string): any | null {
  const server = mcpServers.find(s => s.name.toLowerCase() === serverName.toLowerCase());
  
  if (!server) {
    console.log(`Could not find MCP server with name: ${serverName}`);
    return null;
  }
  
  return server;
}

// Helper function to get e2b_sandbox_id for a given MCP server name
function getE2bSandboxIdForMcpServer(serverName: string): string | null {
  if (!global.mcpE2bSandboxMap) {
    console.log(`No mcpE2bSandboxMap available to find sandbox for ${serverName}`);
    return null;
  }
  // Try direct match
  let sandboxId = global.mcpE2bSandboxMap.get(serverName);
  if (!sandboxId) {
    // Try case-insensitive match
    for (const [key, value] of global.mcpE2bSandboxMap.entries()) {
      if (key.toLowerCase() === serverName.toLowerCase()) {
        sandboxId = value;
        break;
      }
    }
  }
  if (!sandboxId) {
    console.log(`No sandbox ID found for MCP server ${serverName}. Available keys: ${Array.from(global.mcpE2bSandboxMap.keys()).join(', ')}`);
    return null;
  }
  return sandboxId;
}

// Helper function to execute a tool call on an MCP server
async function executeMcpTool(mcpServer: any, toolName: string, toolInput: any): Promise<any> {
  try {
    terminalLog(`Executing MCP tool ${toolName} on server ${mcpServer.name}`);
    
    if (!mcpServer.transport || !mcpServer.transport.url) {
      throw new Error(`Invalid MCP server configuration: ${JSON.stringify(mcpServer)}`);
    }
    
    const serverUrl = mcpServer.transport.url;
    terminalLog(`Server URL: ${serverUrl}`);
    
    // Determine API endpoint based on server URL and tool name
    let toolUrl = '';
    
    // Handle different MCP server URL patterns
    if (serverUrl.includes('/sse')) {
      // If URL contains /sse, replace it with /api/tools/{toolName}
      toolUrl = serverUrl.replace(/\/sse$/, `/api/tools/${toolName}`);
    } else if (serverUrl.endsWith('/')) {
      // If URL ends with a slash, append api/tools/{toolName}
      toolUrl = `${serverUrl}api/tools/${toolName}`;
    } else {
      // Otherwise, append /api/tools/{toolName}
      toolUrl = `${serverUrl}/api/tools/${toolName}`;
    }
    
    terminalLog(`Making request to MCP server at: ${toolUrl}`);
    terminalLog(`Tool input: ${JSON.stringify(toolInput)}`);
    
    // Attempt to make the request
    let response;
    try {
      response = await axios.post(toolUrl, toolInput, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });
    } catch (axiosError: any) {
      // If the first URL pattern fails, try an alternative pattern
      if (axiosError.code === 'ECONNREFUSED' || axiosError.response?.status === 404) {
        terminalLog(`First URL pattern failed, trying alternative endpoint pattern`);
        
        // Try alternative URL pattern
        const alternativeUrl = serverUrl.replace(/\/sse$/, '') + `/tools/${toolName}`;
        terminalLog(`Trying alternative MCP server URL: ${alternativeUrl}`);
        
        response = await axios.post(alternativeUrl, toolInput, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });
      } else {
        throw axiosError;
      }
    }
    
    terminalLog(`MCP server response status: ${response.status}`);
    terminalLog(`MCP server response data: ${JSON.stringify(response.data)}`);
    
    return response.data;
  } catch (error: any) {
    const errorMessage = error.response?.data || error.message || String(error);
    terminalLog(`Error executing MCP tool: ${errorMessage}`);
    return {
      error: `Failed to execute ${toolName} on ${mcpServer.name}: ${errorMessage}`
    };
  }
}

/**
 * A function that handles chat messages
 */
export const chatMessageFunction = inngest.createFunction(
  { id: "chat-message", name: "Chat Message Handler", retries: 1 },
  { event: "athenic/chat.message.received" },
  async ({ event, step, logger }) => {
    console.log("\n\n============== CHAT MESSAGE FUNCTION STARTED ==============");
    console.log(`Received chat message event: ${JSON.stringify(event.data, null, 2)}`);
    
    const { userId, organisationId, clientId, message, timestamp = new Date().toISOString() } = event.data;
    
    console.log(`Processing chat message for clientId: ${clientId}, orgId: ${organisationId}`);
    console.log(`Message content: "${message}"`);

    // Initialize a local message history array
    let currentMessageHistory: MessageHistoryItem[] = [
      { role: "user", content: message, timestamp },
    ];

    console.log("Creating initial state with message history");
    
    // Create the initial state for the agent run
    const initialState = createState<ChatStateData>({
      userId, organisationId, clientId, messageHistory: currentMessageHistory,
    });

    console.log("Attempting to fetch MCP server configurations");
    
    // Attempt to fetch MCP servers, but don't let failure stop the chat processing
    let mcpServers: any[] = [];
    try {
      mcpServers = await step.run("fetch-mcp-servers", async () => {
        console.log(`Fetching MCP server configurations for organisation: ${organisationId}`);
        const { buildMcpServersConfig } = await import('./utils/mcpHelpers');
        console.log("Successfully imported mcpHelpers");
        const configs = await buildMcpServersConfig(organisationId);
        console.log(`[INNGEST] MCP server configs returned from buildMcpServersConfig: ${JSON.stringify(configs, null, 2)}`);
        if (configs.length > 0) {
          const mcpNames = configs.map(c => c.name).join(', ');
          console.log(`[INNGEST] Found ${configs.length} MCP server configurations: ${mcpNames}`);
        } else {
          console.log(`[INNGEST] No MCP server configurations found for organisation: ${organisationId}`);
        }
        return configs;
      });
      console.log(`[INNGEST] mcpServers after fetch-mcp-servers step: ${JSON.stringify(mcpServers, null, 2)}`);
    } catch (error) {
      console.error("Error fetching MCP configurations:", error);
      console.log("Continuing chat processing without MCP servers");
      // Continue with empty mcpServers array
    }

    console.log("Defining process message function");
    
    // Define a function to process the message using the agent
    const processMessage = async (): Promise<AgentResult> => {
      console.log("Starting processMessage function execution");
      console.log(`Running chatAgent with message: \"${message.substring(0, 100)}${message.length > 100 ? '...' : ''}\"`);
      // Setup options for the agent run
      const runOptions = {
        state: initialState,
        ...(mcpServers.length > 0 ? { mcpServers: mcpServers } : {}),
      };
      console.log(`[INNGEST] Agent run options (before chatAgent.run): ${JSON.stringify(runOptions, null, 2)}`);
      try {
        console.log("Calling chatAgent.run() with mcpServers:", mcpServers);
        const result = await chatAgent.run(message, runOptions);
        console.log(`[INNGEST] Agent run complete, result: ${JSON.stringify(result, null, 2)}`);
        return result as AgentResult;
      } catch (error) {
        console.error("Error running chatAgent:", error);
        return {
          output: [{
            type: 'text',
            role: 'assistant',
            content: "I'm sorry, I encountered an error processing your request. Please try again later."
          }]
        } as AgentResult;
      }
    };

    console.log("Calling processMessage function");
    
    // Call the agent processing function directly
    const agentRunResult = await processMessage();
    
    console.log("Processing agent run result to extract response");
    
    // Check for tool calls in the LLM response
    const toolCalls = extractToolCalls(agentRunResult);
    
    let responseMessage = "I'm sorry, I couldn't process your request.";
    let requiresE2B = false;
    let e2bSandboxId = null;

    // If there are tool calls, execute them
    if (toolCalls.length > 0) {
      console.log(`Found ${toolCalls.length} tool calls to execute`);
      
      // Get the first tool call (we'll handle multiple tool calls in a future update)
      const firstToolCall = toolCalls[0];
      console.log(`Processing tool call: ${JSON.stringify(firstToolCall)}`);
      
      const toolName = firstToolCall.tool_name || firstToolCall.name;
      const mcpServerName = firstToolCall.mcp_server_name || firstToolCall.server;
      const toolInput = firstToolCall.tool_input || firstToolCall.parameters || firstToolCall.input || {};
      
      if (toolName && mcpServerName) {
        console.log(`Executing tool ${toolName} from MCP server ${mcpServerName}`);
        // Add a warning if the mcp_server_name does not match any available config
        const availableNames = mcpServers.map(s => s.name);
        if (!availableNames.map(n => n.toLowerCase()).includes(mcpServerName.toLowerCase())) {
          console.warn(`[INNGEST] WARNING: LLM requested MCP server '${mcpServerName}', but available MCP servers are: ${availableNames.join(', ')}`);
        }
        try {
          // Execute the MCP tool in a new Inngest step
          const toolResult = await step.run('execute-mcp-tool', async () => {
            // Find the MCP server by name
            const mcpServer = findMcpServerByName(mcpServers, mcpServerName);

            if (!mcpServer) {
              throw new Error(`MCP server not found: ${mcpServerName}`);
            }
            
            // Get the E2B sandbox ID for this MCP server if available
            e2bSandboxId = getE2bSandboxIdForMcpServer(mcpServerName);
            if (e2bSandboxId) {
              console.log(`Found e2b_sandbox_id for ${mcpServerName}: ${e2bSandboxId}`);
              requiresE2B = true;
            }
            
            // Execute the tool and get the result
            return await executeMcpTool(mcpServer, toolName, toolInput);
          });
          
          console.log(`Tool execution result: ${JSON.stringify(toolResult)}`);
          
          // Add the tool result to message history
          currentMessageHistory.push({
            role: 'function',
            content: JSON.stringify(toolResult),
            timestamp: new Date().toISOString()
          });
          
          // Process the tool result with the agent
          const summaryResult = await step.run('summarize-tool-result', async () => {
            // Update the state with the new message history
            const updatedState = createState<ChatStateData>({
              userId, 
              organisationId, 
              clientId, 
              messageHistory: currentMessageHistory,
            });
            
            // Ask the agent to summarize the tool result
            const summaryPrompt = `Here is the result from the ${toolName} tool: ${JSON.stringify(toolResult)}. Please summarize this information in a helpful way for the user who asked: "${message}"`;
            
            return await chatAgent.run(summaryPrompt, { state: updatedState });
          });
          
          console.log(`Summary result: ${JSON.stringify(summaryResult)}`);
          
          // Extract the summary from the agent result
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
          console.error(`Error executing tool: ${toolError}`);
          responseMessage = `I tried to use the ${toolName} tool, but encountered an error: ${toolError.message}. Please try again later.`;
        }
      } else {
        console.log(`Missing tool_name or mcp_server_name in tool call: ${JSON.stringify(firstToolCall)}`);
        responseMessage = "I wanted to use a tool to answer your question, but I couldn't identify which tool to use. Please try rephrasing your question.";
      }
    } else {
      // If no tool calls, process the regular text response
      try {
        console.log(`Processing text response from agent`);
        
        if (agentRunResult && agentRunResult.output && agentRunResult.output.length > 0) {
        console.log(`Found ${agentRunResult.output.length} messages in output`);
        
        // Get the last message from the agent output
        const lastMessage = agentRunResult.output[agentRunResult.output.length - 1];
        
        console.log(`Last message type: ${lastMessage?.type || 'undefined'}`);
        
        if (lastMessage && lastMessage.type === 'text') {
          console.log("Found text message");
          
          // Handle string content
          if (typeof lastMessage.content === 'string') {
            responseMessage = lastMessage.content;
            console.log(`Text content length: ${responseMessage.length}`);
          } 
          // Handle array content (some LLMs return this format)
          else if (Array.isArray(lastMessage.content)) {
            console.log("Content is an array");
            
            // Join array elements if they are text parts
            const textParts = lastMessage.content
              .map((part: any) => {
                if (typeof part === 'string') return part;
                if (part && typeof part === 'object' && 'text' in part) return part.text;
                return '';
              })
              .filter(Boolean);
              
            if (textParts.length > 0) {
              responseMessage = textParts.join(' ');
              console.log(`Joined text parts, length: ${responseMessage.length}`);
            }
          }
          }
        }
      } catch (error) {
        console.error("Error processing text response:", error);
      }
    }
    
    console.log(`Final response message: "${responseMessage.substring(0, 100)}${responseMessage.length > 100 ? '...' : ''}"`);

    // Send the response back to the API server
    try {
      console.log(`Sending response to API server at ${API_SERVER_URL}/chat/response`);
      
      const response = await axios.post(`${API_SERVER_URL}/chat/response`, {
        clientId,
        response: responseMessage,
        requiresE2B,
        e2bSandboxId
      });
      
      console.log(`API server response: ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.error("Error sending response to API server:", error);
    }

    console.log("============== CHAT MESSAGE FUNCTION COMPLETED ==============\n\n");
    
    // Return the result
    return {
      responseMessage,
      mcpServerCount: mcpServers.length,
      toolCallsExecuted: toolCalls.length,
      requiresE2B,
      active_e2b_sandbox_id: e2bSandboxId
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
  chatMessageFunction
];
