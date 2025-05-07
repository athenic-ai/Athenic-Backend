# MCP Integration Guide

This document provides a comprehensive guide to the Model Context Protocol (MCP) integration in the Athenic platform.

## What is Model Context Protocol (MCP)?

Model Context Protocol (MCP) is an open standard developed by Anthropic that enables two-way connections between AI assistants and external data sources or tools. It allows AI models to access real-time information from various systems like databases, GitHub, email, and other business platforms.

MCP consists of:
- **MCP Servers**: Expose access to specific data sources or tools
- **MCP Clients**: AI applications or assistants that query MCP servers

## Architecture Overview

Our MCP integration has the following components:

1. **E2B Sandboxes**: We use [E2B](https://e2b.dev) to run MCP servers in secure, isolated sandboxes
2. **MCP Server Registry**: Database of available MCP servers that can be instantiated
3. **MCP Connection Management**: API for installing, configuring, and removing MCP server connections
4. **MCP Integration with AgentKit**: Connects MCP servers to our agent framework
5. **Security Layer**: Handles credential management and access control

### Component Diagram

```
┌──────────────────┐      ┌───────────────────┐      ┌─────────────────────┐
│                  │      │                   │      │                     │
│  Athenic Client  │◄────►│  Athenic Backend  │◄────►│  E2B MCP Sandboxes  │
│                  │      │                   │      │                     │
└──────────────────┘      └───────────────────┘      └─────────────────────┘
                                   ▲                           ▲
                                   │                           │
                                   ▼                           ▼
                          ┌─────────────────┐         ┌─────────────────┐
                          │                 │         │                 │
                          │  Agent Runners  │────────►│  External APIs  │
                          │                 │         │                 │
                          └─────────────────┘         └─────────────────┘
```

## MCP Server Types

We support the following types of MCP servers:

1. **File System Tools**: Access to file systems and document storage
2. **Database Tools**: Query databases directly through natural language
3. **GitHub Integration**: Access repositories, issues, and pull requests
4. **Custom API Tools**: Connect to any API with the right credentials
5. **Email & Calendar**: Access to productivity tools
6. **Internal Systems**: Connect to internal business systems
7. **On-premise MCP Servers**: For enterprise customers with strict data governance

## Deployment and Lifecycle Management

### MCP Server Installation

To install a new MCP server:

1. Select a server type from the server registry
2. Provide required credentials (API keys, connection strings, etc.)
3. The system deploys the server in an E2B sandbox
4. The server URL is registered with the client application

```javascript
// Example: Installing a new MCP server
const response = await fetch('/functions/v1/mcp-connections/install', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceRoleKey}`
  },
  body: JSON.stringify({
    mcp_server_id: 'github-server',
    account_id: 'user-account-id',
    title: 'GitHub Integration',
    provided_credential_schema: {
      github_token: 'YOUR_ENCRYPTED_TOKEN'
    }
  })
});
```

### MCP Server Lifecycle

MCP servers go through the following lifecycle states:

1. **mcpPending**: Initial state during creation
2. **mcpDeploying**: E2B sandbox is being provisioned
3. **mcpRunning**: Server is active and available for use
4. **mcpStopped**: Server has been stopped but can be restarted
5. **mcpError**: An error occurred during deployment or operation

### Resource Management

The E2BMcpManager handles resource management:

- Automatic cleanup of idle sandboxes
- Timeout extension for active sandboxes
- Graceful shutdown during service restarts

## Security Considerations

### Credential Management

Sensitive credentials are:

1. Encrypted at rest using AES-256
2. Only decrypted when needed in the E2B sandbox
3. Never exposed in logs or responses

### Sandbox Isolation

Each MCP server runs in its own isolated E2B sandbox:

- Network isolation between different customers' MCP servers
- No persistent storage between sessions (unless explicitly configured)
- Sandbox timeouts to limit resource consumption

## Using MCP Servers with Agents

### Integration with AgentKit

To use MCP servers with an agent:

```javascript
import { createState } from '@inngest/agent-kit';
import { buildMcpServersConfig } from '../utils/mcpHelpers.js';

// Get all active MCP servers for the user
const mcpServers = await buildMcpServersConfig(accountId);

// Create agent state with MCP servers
const state = createState({
  // other state configuration...
  mcpServers,
});

// The agent can now use the MCP servers
const result = await agent.run(state, {
  messages: [
    { role: 'user', content: 'Find all open pull requests in our repository' }
  ]
});
```

### Available MCP Tools

| Tool Type | Description | Credentials Required |
|-----------|-------------|---------------------|
| GitHub | Access repositories, PRs, issues | GitHub API token |
| Postgres | Query databases using natural language | Connection string |
| Slack | Send and read messages | Slack OAuth token |
| GoogleDrive | Access documents and files | Google OAuth credentials |
| Jira | Access issues and projects | Jira API token |
| Custom API | Connect to any RESTful API | Varies by API |

## Monitoring and Diagnostics

### Health Checks

Health endpoints are available to monitor MCP server status:

```
GET /functions/v1/mcp-connections/health?account_id=<account_id>
```

The response includes:
- Overall status (healthy/unhealthy)
- Per-connection status
- Response times
- Error details if applicable

### Logging

MCP server operations are logged at multiple levels:

1. **E2B Sandbox Logs**: Raw stdout/stderr from the MCP server
2. **Connection Status Logs**: State transitions and connectivity
3. **Request Logs**: Request patterns and performance metrics
4. **Error Logs**: Detailed error information for troubleshooting

## Testing

The MCP integration includes comprehensive tests:

1. **Unit Tests**: For individual components
2. **Integration Tests**: For end-to-end flows
3. **Stress Tests**: For performance and concurrency

## Troubleshooting

### Common Issues

1. **Connection Timeout**: 
   - Check network connectivity to E2B
   - Verify the MCP server is properly configured

2. **Authentication Errors**:
   - Ensure credentials are valid and not expired
   - Check if encrypted credentials can be properly decrypted

3. **Sandbox Resources**:
   - Monitor sandbox resource usage
   - Check if timeouts are configured correctly

### Getting Support

For issues with MCP integration, contact:
- Internal: #mcp-support channel
- External: support@athenic.ai with subject "MCP Issue"

## Future Enhancements

Planned improvements for the MCP integration:

1. **MCP Server Templates**: Allow customers to create custom MCP server templates
2. **Multi-region Deployment**: Deploy MCP servers in multiple regions for improved latency
3. **Enhanced Monitoring**: More detailed metrics and observability
4. **Batched Operations**: Support for batched requests across multiple MCP servers
5. **Persistent Sandboxes**: Long-lived MCP servers for enterprise customers

## References

- [Anthropic MCP Documentation](https://www.anthropic.com/news/model-context-protocol)
- [E2B Documentation](https://e2b.dev/docs)
- [AgentKit Documentation](https://github.com/inngest/agent-kit)
- [Model Context Protocol Specification](https://modelcontextprotocol.io) 