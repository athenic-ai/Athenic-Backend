import fetch from 'node-fetch';
import { MCP } from '@inngest/agent-kit';
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Ensure environment variables are loaded
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

// Declare the global variable type
declare global {
  var mcpE2bSandboxMap: Map<string, string>;
}

// Initialize the global map if it doesn't exist
if (!global.mcpE2bSandboxMap) {
  global.mcpE2bSandboxMap = new Map<string, string>();
}

// Use console for logging since the logger path is causing an issue
// We can add better logging later if needed

/**
 * Interface for MCP connection metadata
 */
interface McpConnectionMetadata {
  id: string;
  title: string;
  mcp_status: string;
  mcp_server_url?: string;
  e2b_sandbox_id?: string;
  provided_credential_schema?: Record<string, unknown>;
  provided_credentials?: Record<string, unknown>;
  created_at: string;
}

/**
 * Interface for MCP connection objects from database
 */
interface McpConnectionFromDb {
  id: string;
  related_object_type_id: string;
  owner_organisation_id: string;
  metadata: McpConnectionMetadata;
  created_at?: string;
  embedding?: any;
  owner_member_id?: string;
}

// Helper to check if access is valid
function isAccessValid(connection: McpConnectionFromDb): boolean {
  return connection?.metadata?.mcp_status === 'active' && 
         (!!connection?.metadata?.mcp_server_url || !!connection?.metadata?.e2b_sandbox_id);
}

/**
 * Fetches MCP connections for an organisation from the Supabase database
 * @param organisationId The organisation ID to fetch connections for
 * @returns Array of MCP connection objects
 */
export async function fetchMcpConnectionsForOrganisation(
  organisationId: string
): Promise<McpConnectionFromDb[]> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[SERVERS] Supabase URL or Service Key not set');
      return [];
    }

    console.log(`[SERVERS] Fetching MCP connections for org: ${organisationId}`);
    
    const response = await fetch(
      `${supabaseUrl}/functions/v1/mcp-connections?account_id=${organisationId}`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
          'Content-Type': 'application/json'
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SERVERS] MCP connections fetch failed: ${response.status} ${errorText}`);
      return [];
    }

    const responseData = await response.json();
    
    // Check if responseData is an array
    if (Array.isArray(responseData)) {
      console.log(`[SERVERS] Found ${responseData.length} MCP connections`);
      return responseData;
    } 
    
    // Check for data property which might contain the array
    if (responseData && typeof responseData === 'object' && Array.isArray((responseData as any).data)) {
      console.log(`[SERVERS] Found ${(responseData as any).data.length} MCP connections in data property`);
      return (responseData as any).data;
    }

    // Check for connections property which might contain the array
    if (responseData && typeof responseData === 'object' && Array.isArray((responseData as any).connections)) {
      console.log(`[SERVERS] Found ${(responseData as any).connections.length} MCP connections in connections property`);
      return (responseData as any).connections;
    }

    console.log(`[SERVERS] Response is not an array: ${JSON.stringify(responseData).substring(0, 200)}...`);
    return [];
  } catch (error) {
    console.error('[SERVERS] Error fetching MCP connections:', error);
    return [];
  }
}

/**
 * Helper function to create an E2B sandbox
 * @param sandboxId The sandbox ID
 * @returns The sandbox instance or null if creation fails
 */
async function createE2BSandbox(sandboxId: string): Promise<any | null> {
  try {
    console.log(`[SERVERS] Creating E2B sandbox with ID: ${sandboxId}`);
    
    // Check for E2B API key
    if (!process.env.E2B_API_KEY) {
      console.error(`[SERVERS] E2B_API_KEY not set in environment variables`);
      return null;
    }
    
    // Dynamically import E2B SDK
    const SDK = await import('@e2b/sdk');
    
    // Create the sandbox
    const sandbox = await SDK.Sandbox.create({
      id: sandboxId,
      apiKey: process.env.E2B_API_KEY
    });
    
    console.log(`[SERVERS] E2B sandbox created successfully`);
    return sandbox;
  } catch (error) {
    console.error(`[SERVERS] Error creating E2B sandbox:`, error);
    return null;
  }
}

/**
 * Creates an MCP object from a connection object
 * @param connectionObject The connection object to create an MCP from
 * @returns An MCP object or null if creation failed
 */
export async function createMcpFromConnectionObject(
  connectionObject: McpConnectionFromDb
): Promise<any> {
  try {
    const { metadata } = connectionObject;
    const { mcp_server_url, e2b_sandbox_id } = metadata;

    if (!mcp_server_url) {
      console.error(`[SERVERS] MCP server URL not found for connection ${metadata.id}`);
      return null;
    }

    // Check if the URL is already properly formatted
    const serverUrl = mcp_server_url.startsWith('http') 
      ? mcp_server_url 
      : `http://${mcp_server_url}`;
    
    console.log(`[SERVERS] Creating MCP for ${metadata.title} with URL: ${serverUrl}`);

    // Create E2B sandbox if needed
    let sandbox = null;
    if (e2b_sandbox_id) {
      sandbox = await createE2BSandbox(e2b_sandbox_id);
    }

    // Create MCP config
    const mcpConfig: any = {
      baseUrl: serverUrl,
      auth: metadata.provided_credentials,
    };
    
    if (sandbox) {
      mcpConfig.sandbox = sandbox;
    }
    
    // Create MCP instance
    return mcpConfig; // Return the config object directly
  } catch (error) {
    console.error(`[SERVERS] Error creating MCP from connection:`, error);
    return null;
  }
}

/**
 * Fetches and creates MCP instances for an organisation
 * @param organisationId The organisation ID to fetch MCPs for
 * @returns An array of MCP instances for use with AgentKit
 */
export async function getMcpServersForOrganisation(organisationId: string): Promise<any[]> {
  try {
    const connections = await fetchMcpConnectionsForOrganisation(organisationId);
    console.log(`Processing ${connections.length} connections for MCPs`);
    
    // Create MCP instances in parallel
    const mcpPromises = connections.map(connection => createMcpFromConnectionObject(connection));
    const mcps = await Promise.all(mcpPromises);
    
    // Filter out null results
    return mcps.filter((mcp) => mcp !== null);
  } catch (error) {
    console.error('Error getting MCP servers:', error);
    return [];
  }
}

/**
 * Builds the MCP server configuration for a given organisation.
 * Returns an array of MCP server configs that can be used with AgentKit.
 */
export async function buildMcpServersConfig(organisationId: string): Promise<any[]> {
  console.log(`Building MCP server configs for organisation: ${organisationId}`);

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  try {
    // Step 1: Fetch all connection objects for this organisation
    const { data: connections, error: connectionsError } = await supabase
      .from("objects")
      .select("*")
      .eq("related_object_type_id", "connection")
      .eq("owner_organisation_id", organisationId);

    if (connectionsError) {
      console.error("Error fetching connection objects:", connectionsError);
      return [];
    }

    console.log(`[MCP] Found ${connections?.length || 0} connection objects for org: ${organisationId}`);
    if (!connections || connections.length === 0) {
      return [];
    }

    // Log all connection objects
    connections.forEach((conn, idx) => {
      let meta = conn.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch (e) { console.error(`[MCP] Could not parse metadata for connection ${conn.id}`); meta = {}; }
      }
      console.log(`[MCP] Connection[${idx}]: id=${conn.id}, title=${meta.title}, mcp_status=${meta.mcp_status}, mcp_server_id=${meta.mcp_server_id}, mcp_server_url=${meta.mcp_server_url}`);
    });

    // Filter active connections by checking mcp_status
    const activeConnections = connections.filter(connection => {
      let metadata = connection.metadata;
      if (typeof metadata === 'string') {
        try { metadata = JSON.parse(metadata); } catch (e) { metadata = {}; }
      }
      const status = metadata.mcp_status;
      if (status !== "mcpRunning") {
        console.log(`[MCP] Skipping MCP server ${metadata.title || "Unknown"}: Not active (status=${status})`);
        return false;
      }
      return true;
    });

    console.log(`[MCP] Found ${activeConnections.length} active MCP connections`);
    if (activeConnections.length === 0) {
      return [];
    }

    // Create a mapping to store e2b_sandbox_ids by MCP server title for later use
    const e2bSandboxIdMap = new Map<string, string>();

    // Process active connections to find their corresponding mcp_server definitions
    const mcpServerPromises = activeConnections.map(async (connection, idx) => {
      try {
        let metadata = connection.metadata;
        if (typeof metadata === 'string') {
          try { metadata = JSON.parse(metadata); } catch (e) { metadata = {}; }
        }
        const { title, mcp_server_id, mcp_server_url, e2b_sandbox_id } = metadata;

        if (!mcp_server_id) {
          console.log(`[MCP] Skipping connection ${title}: No mcp_server_id provided`);
          return null;
        }
        if (!mcp_server_url) {
          console.log(`[MCP] Skipping connection ${title}: No mcp_server_url provided`);
          return null;
        }
        if (e2b_sandbox_id && title) {
          e2bSandboxIdMap.set(title, e2b_sandbox_id);
        }

        // Step 2: Find the corresponding mcp_server object
        const { data: mcpServerObjects, error: mcpServerError } = await supabase
          .from("objects")
          .select("*")
          .eq("related_object_type_id", "mcp_server")
          .filter("metadata->>mcp_server_id", "eq", mcp_server_id);

        if (mcpServerError) {
          console.log(`[MCP] Error fetching mcp_server for id ${mcp_server_id}:`, mcpServerError);
        }
        if (!mcpServerObjects || mcpServerObjects.length === 0) {
          console.log(`[MCP] Could not find mcp_server with id ${mcp_server_id} for connection ${title}`);
          return null;
        }

        const mcpServerObject = mcpServerObjects[0];
        let mcpServerMetadata = mcpServerObject.metadata;
        if (typeof mcpServerMetadata === 'string') {
          try { mcpServerMetadata = JSON.parse(mcpServerMetadata); } catch (e) { mcpServerMetadata = {}; }
        }
        console.log(`[MCP] Found mcp_server: id=${mcpServerObject.id}, title=${mcpServerMetadata.title}, mcp_server_id=${mcpServerMetadata.mcp_server_id}`);

        // Step 3: Construct AgentKit MCP Configuration
        return {
          name: title || mcpServerMetadata.title,
          transport: {
            type: mcp_server_url.includes("/sse") ? "sse" : "ws",
            url: mcp_server_url
          },
          e2b_sandbox_id
        };
      } catch (err) {
        console.error(`[MCP] Error processing MCP connection:`, err);
        return null;
      }
    });

    // Wait for all promises to resolve
    const results = await Promise.all(mcpServerPromises);
    const mcpAgentKitConfigs = results.filter(config => config !== null);
    global.mcpE2bSandboxMap = e2bSandboxIdMap;
    console.log(`[MCP] Final MCP AgentKit configs: ${JSON.stringify(mcpAgentKitConfigs, null, 2)}`);
    return mcpAgentKitConfigs;
  } catch (err) {
    console.error("[MCP] Error building MCP server configs:", err);
    return [];
  }
}

/**
 * Example usage in an Inngest function:
 * 
 * import { buildMcpServersConfig } from '../utils/mcpHelpers';
 * 
 * export const yourInngestFunction = inngest.createFunction(
 *   { name: "Your Function" },
 *   { event: "your.event" },
 *   async ({ event, step }) => {
 *     const organisationId = event.data.organisationId;
 *     
 *     // Get MCP servers configuration
 *     const mcpServersConfig = await step.run(
 *       "Build MCP Servers Config",
 *       async () => buildMcpServersConfig(organisationId)
 *     );
 *     
 *     // Create agent with MCP servers
 *     const agent = createAgent({
 *       // ...other agent config...
 *       mcpServers: mcpServersConfig,
 *     });
 *     
 *     // Continue with agent operations...
 *   }
 * );
 */

/**
 * Creates MCPs for all connections for an organisation
 * @param organisationId The organisation ID to create MCPs for
 * @returns A record of MCP objects by name
 */
export async function createMcpsForOrganisation(organisationId: string): Promise<Record<string, any>> {
  try {
    // Fetch all MCP connections for this organisation
    const connections = await fetchMcpConnectionsForOrganisation(organisationId);
    
    if (!connections || connections.length === 0) {
      console.log(`[SERVERS] No MCP connections found for organisation ${organisationId}`);
      return {};
    }
    
    // Create MCPs from connections
    const mcpResults: Record<string, any> = {};
    
    for (const connection of connections) {
      try {
        const mcp = await createMcpFromConnectionObject(connection);
        if (mcp) {
          mcpResults[connection.metadata.title] = mcp;
        }
      } catch (error) {
        console.error(`[SERVERS] Error creating MCP for ${connection.metadata.title}:`, error);
      }
    }
    
    return mcpResults;
  } catch (error) {
    console.error(`[SERVERS] Error creating MCPs for organisation:`, error);
    return {};
  }
} 