# E2B & MCP Integration for Athenic

This directory contains the E2B (Environment to Build) services for Athenic, including the MCP (Model Context Protocol) Manager that enables AI models to interact with external tools.

## Overview

The E2B MCP Manager provides a way to run Model Context Protocol servers in isolated sandboxes. This allows Athenic's AI agents to access external tools and data sources while maintaining security and separation between different accounts/organizations.

## Files

- `e2b-service.ts` - Core E2B service for code execution in sandboxes
- `e2b-mcp-manager.ts` - Service for deploying and managing MCP servers in E2B sandboxes
- `tests/` - Unit tests for E2B services

## MCP Integration

Model Context Protocol (MCP) is an open standard developed by Anthropic that enables two-way connections between AI assistants and data sources—whether that's internal databases, Gmail, dev environments, or business platforms.

### Key Components

1. **E2B MCP Manager (`e2b-mcp-manager.ts`)** 
   - Deploys MCP servers in E2B sandboxes
   - Manages the lifecycle of MCP servers
   - Provides utilities for status checking and timeout extension

2. **MCP Connections Edge Function (`supabase/functions/mcp-connections/index.ts`)**
   - RESTful API for installing, listing, and deleting MCP connections
   - Handles credential management (encryption/decryption)
   - Maps MCP server definitions to running instances

3. **Database Schema**
   - `mcp_server` object type for MCP server definitions
   - `mcp_connection` object type for active connections
   - Supporting metadata types and enums

## Usage

### Setting Up MCP Servers

MCP server definitions are stored in the database as `mcp_server` objects. Each server definition includes:

- `title` - Name of the MCP server
- `description` - Purpose and capabilities
- `start_command` - Command to start the MCP server
- `credential_schema` - Required credentials (API keys, etc.)
- `default_timeout` - Default timeout for the sandbox

### Managing MCP Connections

The MCP connections Edge Function provides these API endpoints:

- `POST /mcp-connections/install` - Install a new MCP server connection for an account
- `GET /mcp-connections?account_id=<account_id>` - List all MCP connections for an account
- `DELETE /mcp-connections/:connection_id` - Delete an MCP connection
- `GET /mcp-server-definitions` - Get all available MCP server definitions

### Connection Lifecycle

1. **Installation**: A user selects an MCP server to install from available definitions
2. **Deployment**: The system creates an E2B sandbox and deploys the MCP server
3. **Usage**: AI agents interact with the MCP server via the E2B sandbox
4. **Maintenance**: The system periodically extends timeouts for active servers
5. **Termination**: When no longer needed, the connection is deleted and the sandbox is terminated

## Security Considerations

- Sensitive credentials (API keys, tokens) are encrypted before storage
- Each MCP server runs in an isolated E2B sandbox
- MCP servers are associated with specific accounts for proper isolation
- Credentials are only decrypted when needed within sandboxes

## Development

### Prerequisites

- E2B API key (set in environment as `E2B_API_KEY`)
- Supabase project with Edge Functions capability
- Node.js 18+ and npm/yarn

### Running Tests

```bash
# Run tests for the E2B MCP Manager
npm test -- src/e2b/tests/e2b-mcp-manager.test.js
```

### Deployment

The MCP connections Edge Function is deployed with other Supabase Edge Functions:

```bash
supabase functions deploy mcp-connections
``` 