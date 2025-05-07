# MCP Integration for Athenic

This document provides a comprehensive guide to the Model Context Protocol (MCP) integration in Athenic, covering architecture, implementation details, and usage examples.

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Implementation Details](#implementation-details)
4. [Usage Guide](#usage-guide)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

## Overview

Athenic integrates with Anthropic's Model Context Protocol (MCP) to enable AI agents to interact with external tools and data sources. MCP provides a standardized interface for AI models to access and manipulate data from various sources, such as databases, APIs, and web services.

The integration:
- Runs MCP servers in E2B sandboxes for secure execution
- Allows users to install and manage MCP servers via the Athenic UI
- Makes MCP tools available to AI agents through Inngest AgentKit
- Supports dynamic discovery and configuration of MCP servers

## Architecture

The MCP integration in Athenic consists of the following components:

1. **Database Model**:
   - `mcp_server` objects: Templates for available MCP servers
   - `connection` objects with MCP-related metadata: User-installed MCP server instances

2. **Backend Services**:
   - **E2B MCP Manager**: Handles sandbox deployment and management
   - **Supabase Edge Functions**: Provide APIs for MCP server management
   - **Credential Management**: Securely handles user-provided credentials

3. **AgentKit Integration**:
   - **MCP Helpers**: Functions to fetch and configure MCP servers for agents
   - **Chat Network**: Enhanced to use MCP servers dynamically
   - **MCP-enabled Tests**: Example implementations of MCP usage

4. **Frontend**:
   - **Connections Screen**: UI for browsing, installing, and managing MCP servers

## Implementation Details

### Database Structure

MCP-related data is stored in the existing `objects` table using the following patterns:

#### MCP Server Objects (`related_object_type_id = 'mcp_server'`)
```json
{
  "id": "github-mcp-server",
  "metadata": {
    "title": "GitHub",
    "description": "Access GitHub repositories, issues, and PRs",
    "icon": "solid github",
    "start_command": "npx -y @modelcontextprotocol/server-github",
    "requested_credential_schema": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "Your GitHub Personal Access Token"
    }
  }
}
```

#### Connection Objects for MCP (`related_object_type_id = 'connection'`)
```json
{
  "id": "user-github-connection-123",
  "metadata": {
    "title": "My GitHub Connection",
    "mcp_status": "mcpRunning",
    "mcp_server_url": "https://e2b.sandbox.url/mcp/123456",
    "e2b_sandbox_id": "sandbox_123456",
    "provided_credential_schema": "<encrypted credentials>"
  }
}
```

### E2B Integration

The E2B MCP Manager (`src/e2b/e2b-mcp-manager.ts`) handles:
- Creating E2B sandboxes
- Executing MCP server commands
- Managing sandbox lifecycle
- Monitoring MCP server status

### AgentKit Integration

The MCP Helpers (`src/inngest/utils/mcpHelpers.ts`) provides:
- Functions to fetch active MCP connections for an organization
- Conversion of MCP connections to AgentKit `MCP.Server` objects
- Integration with chat networks and agents

Example of using MCP servers in an Inngest function:

```typescript
// Inside an Inngest function
const mcpServersConfig = await step.run(
  'Build MCP Servers Config',
  async () => buildMcpServersConfig(organisationId)
);

// Use the MCP servers with a network
const result = await chatNetwork.run(message, {
  state,
  mcpServers: mcpServersConfig, // Inject MCP servers
});
```

## Usage Guide

### Adding a New MCP Server Definition

To add a new MCP server to the catalog:

1. Insert a new object in the `objects` table with `related_object_type_id = 'mcp_server'`
2. Define the required metadata (title, description, start_command, etc.)
3. Specify any required credentials in the `requested_credential_schema`

### Installing an MCP Server for an Organization

Users can install MCP servers through:

1. The Connections screen in the Athenic UI
2. The `/api/mcp-connections/install` API endpoint (for programmatic use)

Installation process:
1. User selects an MCP server from the catalog
2. User provides any required credentials
3. Athenic creates an E2B sandbox with the MCP server
4. Connection object is created with status updates as the sandbox is deployed

### Using MCP Tools in Agents

AI agents can use MCP tools automatically through the Inngest AgentKit integration:

1. Fetch MCP servers for the organization: `buildMcpServersConfig(organisationId)`
2. Pass the MCP servers to the agent or network: `agent.run(message, { mcpServers })`
3. The agent automatically discovers and uses the available tools

## Testing

The MCP integration can be tested using the provided scripts:

### Basic MCP Test

```bash
# Test with a specific organization ID
npx ts-node src/scripts/test-mcp-integration.ts <organisationId> [customMessage]

# Example:
npx ts-node src/scripts/test-mcp-integration.ts demo.gameforgifts.com "Search for recent AI papers"
```

### End-to-End Test

```bash
# Run a comprehensive E2E test
npx ts-node src/scripts/mcp-e2e-test.ts <organisationId> [skipCleanup]

# Example:
npx ts-node src/scripts/mcp-e2e-test.ts demo.gameforgifts.com
```

The E2E test:
1. Checks for existing MCP connections
2. Creates a test connection if needed
3. Runs the basic MCP test
4. Cleans up test resources (optional)

## Troubleshooting

### Common Issues

1. **MCP Server Not Starting:**
   - Check E2B sandbox status and logs
   - Verify command syntax and credentials
   - Ensure the MCP server package is available

2. **Agent Not Using MCP Tools:**
   - Confirm MCP servers are running (`mcp_status = 'mcpRunning'`)
   - Check the organization ID matches
   - Verify the agent is receiving the MCP servers configuration

3. **Connection Errors:**
   - Check network connectivity to E2B
   - Verify API keys are valid
   - Check firewall/proxy settings

### Diagnostic Commands

```bash
# Check MCP connections in the database
SELECT * FROM objects WHERE related_object_type_id = 'connection' AND metadata->>'mcp_status' = 'mcpRunning';

# Check MCP server definitions
SELECT * FROM objects WHERE related_object_type_id = 'mcp_server';

# Monitor Inngest functions
http://localhost:8288/functions/test-mcp-integration
```

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/introduction)
- [AgentKit MCP Documentation](https://agentkit.inngest.com/advanced-patterns/mcp)
- [E2B Documentation](https://e2b.dev)
- [Available MCP Servers](https://github.com/modelcontextprotocol/servers) 