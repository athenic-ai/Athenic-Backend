import fetch from 'node-fetch';
import { MCP } from '@agent-kit/core';

interface McpConnectionMetadata {
  id: string;
  title: string;
  url: string;
  status: string;
  created_at: string;
}

interface McpCredentialsResponse {
  status: number;
  data?: {
    url: string;
    credential?: string;
    name: string;
  };
  message: string;
}

/**
 * Fetches MCP connections for a specific organization from the Supabase database
 * @param organisationId The organization ID to fetch connections for
 * @returns Promise resolving to an array of MCP connection metadata
 */
export async function fetchMcpConnectionsForOrganisation(
  organisationId: string
): Promise<McpConnectionMetadata[]> {
  try {
    // Use the list endpoint to get all connections (without credentials)
    const response = await fetch(
      `${process.env.SUPABASE_URL}/functions/v1/mcp-connections/list?organisationId=${encodeURIComponent(organisationId)}`,
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
    
    if (result.status !== 200 || !result.data) {
      throw new Error(result.message || 'Failed to fetch MCP connections');
    }

    return result.data;
  } catch (error) {
    console.error('Error fetching MCP connections:', error);
    return [];
  }
}

/**
 * Retrieves secure credentials for a specific MCP connection
 * @param organisationId The organization ID the connection belongs to
 * @param connectionId The specific connection ID to retrieve credentials for
 * @returns Promise resolving to the credential response with URL and decrypted credential
 */
export async function retrieveMcpCredentials(
  organisationId: string,
  connectionId: string
): Promise<McpCredentialsResponse> {
  try {
    // Call the secure credentials endpoint
    const response = await fetch(
      `${process.env.SUPABASE_URL}/functions/v1/mcp-connections/get-credentials`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          organisationId,
          connectionId
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to retrieve MCP credentials: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error retrieving MCP credentials:', error);
    return {
      status: 500,
      message: `Error retrieving MCP credentials: ${error instanceof Error ? error.message : String(error)}`
    };
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
    
    // Only process connections with 'connected' or 'pending' status
    const activeConnections = mcpConnections.filter(
      conn => conn.status === 'connected' || conn.status === 'pending'
    );
    
    // If no active connections, return empty array
    if (activeConnections.length === 0) {
      return mcpServersConfig;
    }
    
    // For each active connection, get the credentials
    for (const conn of activeConnections) {
      try {
        const credentialsResponse = await retrieveMcpCredentials(
          organisationId,
          conn.id
        );
        
        // Skip if retrieval failed
        if (credentialsResponse.status !== 200 || !credentialsResponse.data) {
          console.warn(`Failed to retrieve credentials for MCP connection ${conn.id}: ${credentialsResponse.message}`);
          continue;
        }
        
        const { url, credential, name } = credentialsResponse.data;
        
        // Determine transport type based on URL protocol
        const transportType: 'ws' | 'sse' = url.startsWith('ws') ? 'ws' : 'sse';
        
        // Add to MCP servers config
        mcpServersConfig.push({
          name: name || conn.title, // Use name from credentials or fallback to connection title
          transport: {
            type: transportType,
            url: url,
            // Add authentication headers if credentials exist
            requestInit: credential ? 
              { headers: { 'Authorization': `Bearer ${credential}` } } : 
              undefined,
          },
        });
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
 * import { buildMcpServersConfig } from './utils/mcpHelpers';
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