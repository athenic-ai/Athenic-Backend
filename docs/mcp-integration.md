# MCP (Model Context Protocol) Integration

This document outlines how MCP server integration is implemented in Athenic to enhance agent capabilities with external tools.

## Overview

Model Context Protocol (MCP) servers provide a standardized way to extend agent capabilities by offering additional tools via WebSocket or HTTP/SSE connections. Our implementation includes:

1. **Backend API** - Supabase Edge Functions for managing MCP connections
2. **Secure Credential Storage** - AES-CBC encryption for API keys/tokens
3. **AgentKit Integration** - Helper utilities to dynamically load MCP servers
4. **Frontend Integration** - UI components for managing connections (implemented separately)

## Database Structure

MCP connections are stored using the existing object model:
- `object_type_id`: `mcp_connection`
- Metadata fields:
  - `title`: User-friendly name for the connection
  - `mcp_url`: WebSocket or HTTP URL of the MCP server
  - `mcp_credentials`: Encrypted credentials (API key/token)
  - `mcp_status`: Connection status (pending, connected, error)
  - `created_at`: Timestamp when the connection was created

## Server-Side Components

### Supabase Edge Function (`mcp-connections`)

Located at: `/supabase/functions/mcp-connections/index.ts`

This Edge Function provides the following endpoints:
- `POST /add` - Add a new MCP connection
- `GET /list` - List MCP connections for an organisation
- `DELETE /delete` - Delete an MCP connection
- `POST /get-credentials` - Internal endpoint for secure credential retrieval

The API handles input validation, secure encryption/decryption, and proper authentication checks for all operations.

### Credential Security

- Credentials are encrypted using AES-CBC encryption before storage
- Each credential has a unique initialization vector (IV)
- The encryption key is derived from the `MCP_SECRET_KEY` environment variable, falling back to `SUPABASE_SERVICE_ROLE_KEY`
- The internal endpoint for credential retrieval is only accessible with the service role key

## AgentKit Integration

Located at: `/src/inngest/utils/mcpHelpers.ts`

Helper functions for Inngest integration:
- `fetchMcpConnectionsForOrganisation` - Get all MCP connections for an organization
- `retrieveMcpCredentials` - Securely retrieve credentials for a specific connection
- `buildMcpServersConfig` - Build the MCP server configuration array for AgentKit

### Example Usage

```typescript
import { buildMcpServersConfig } from '../utils/mcpHelpers';

// Within an Inngest function
const mcpServersConfig = await step.run(
  'Build MCP Servers Config',
  async () => buildMcpServersConfig(organisationId)
);

// Use with createAgent or createNetwork
const agent = createAgent({
  // ...other configuration
  mcpServers: mcpServersConfig,
});
```

A complete example is available at `/src/inngest/examples/mcpIntegrationExample.ts`

## Frontend Integration

The frontend integration is implemented separately in the Flutter app (`Athenic-App-Business`). It uses the API endpoints to:
1. Display existing MCP connections
2. Add new connections with a user-friendly form
3. Delete connections when needed

The frontend never receives or handles decrypted credentials, following security best practices.

## Adding New MCP Servers

To add support for new MCP servers:

1. **Backend**: No changes needed - the backend is designed to support any MCP-compliant server
2. **Frontend**: Add to the UI as needed following existing patterns
3. **Documentation**: Document which MCP servers are officially supported
4. **Testing**: Validate that tools from the MCP server are correctly discovered by agents

## Environment Variables

The following environment variables are used:
- `SUPABASE_URL` - Base URL for Supabase API
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for internal operations
- `MCP_SECRET_KEY` (optional) - Dedicated key for credential encryption (falls back to service role key if not set)

## Additional Notes

- The MCP connection status starts as "pending" and can be updated by a separate process that validates connections
- MCP servers with "pending" or "connected" status are loaded into agents, while "error" status connections are ignored
- The implementation follows the AgentKit MCP Server standard as documented at: https://agentkit.inngest.com/advanced-patterns/mcp 