import fetch from 'node-fetch';
import { MCP } from '@inngest/agent-kit';

/**
 * Interface for MCP connection metadata
 */
interface McpConnectionMetadata {
  id: string;
  title: string;
  mcp_status: string;
  mcp_server_url?: string;
  e2b_sandbox_id?: string;
  provided_credential_schema?: Record<string, string>;
  created_at: string;
}

/**
 * Interface for MCP server object
 */
interface McpServerObject {
  id: string;
  metadata: {
    title: string;
    start_command: string;
    requested_credential_schema?: Record<string, string>;
  };
}

/**
 * Fetches MCP connections for a specific organization from the Supabase objects table
 * @param organisationId The organization ID to fetch connections for
 * @returns Promise resolving to an array of MCP connection metadata
 */
export async function fetchMcpConnectionsForOrganisation(
  organisationId: string
): Promise<McpConnectionMetadata[]> {
  try {
    // Use the Supabase Edge function to list MCP connections
    const response = await fetch(
      `${process.env.SUPABASE_URL}/functions/v1/mcp-connections?account_id=${encodeURIComponent(organisationId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch MCP connections: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result || !Array.isArray(result)) {
      throw new Error('Failed to fetch MCP connections: Invalid response format');
    }

    return result.map(conn => conn.metadata) as McpConnectionMetadata[];
  } catch (error) {
    console.error('Error fetching MCP connections:', error);
    return [];
  }
}

/**
 * Builds an array of MCP server configurations for AgentKit
 * @param organisationId The organization ID to build MCP server configs for
 * @returns Promise resolving to an array of MCP.Server objects for AgentKit
 */
export async function buildMcpServersConfig(
  organisationId: string
): Promise<MCP.Server[]> {
  try {
    const mcpServersConfig: MCP.Server[] = [];
    
    // Get all MCP connections for this organization
    const mcpConnections = await fetchMcpConnectionsForOrganisation(organisationId);
    
    // Only process connections with 'mcpRunning' status and a valid URL
    const activeConnections = mcpConnections.filter(
      conn => conn.mcp_status === 'mcpRunning' && conn.mcp_server_url
    );
    
    // If no active connections, return empty array
    if (activeConnections.length === 0) {
      console.log(`No active MCP connections found for organisation ${organisationId}`);
      return mcpServersConfig;
    }
    
    console.log(`Found ${activeConnections.length} active MCP connections for organisation ${organisationId}`);
    
    // For each active connection, create an MCP.Server object
    for (const conn of activeConnections) {
      try {
        if (!conn.mcp_server_url) {
          console.warn(`MCP connection ${conn.id} is missing mcp_server_url`);
          continue;
        }
        
        // Determine transport type based on URL protocol
        const transportType: 'ws' | 'sse' = conn.mcp_server_url.startsWith('ws') ? 'ws' : 'sse';
        
        // Add to MCP servers config
        mcpServersConfig.push({
          name: conn.title,
          transport: {
            type: transportType,
            url: conn.mcp_server_url,
            // No authentication headers needed - E2B handles authentication
          },
        });
        
        console.log(`Added MCP server ${conn.title} with URL ${conn.mcp_server_url}`);
      } catch (error) {
        console.error(`Error processing MCP connection ${conn.id}:`, error);
        // Continue with the next connection
      }
    }
    
    return mcpServersConfig;
  } catch (error) {
    console.error('Error building MCP servers config:', error);
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