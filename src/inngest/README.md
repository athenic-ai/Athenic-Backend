# Athenic AgentKit Implementation

This directory contains the AgentKit-based implementation of Athenic's agent system, powered by Inngest.

## Overview

The Athenic agent system uses [AgentKit by Inngest](https://agentkit.inngest.com/) to create a powerful, orchestrated AI agent system. This implementation replaces the previous Inngest-based implementation with a more sophisticated agent-based approach.

## Key Components

- **Agents**: Individual specialized AI agents defined in the `agents/` directory
- **Networks**: Collections of agents that work together, defined in the `networks/` directory
- **Tools**: Custom capabilities that agents can use, defined in the `tools/` directory
- **Server**: Express server that exposes the Inngest webhook endpoints and UI
- **Client**: Exports the Inngest client for use by other parts of the application
- **MCP Servers**: Integration with Model Context Protocol (MCP) servers running in E2B sandboxes

## Architecture

This implementation follows the modular design of AgentKit:

1. **AgentKit Networks** orchestrate the overall workflows
2. **AgentKit Agents** handle specialized tasks based on their expertise
3. **Tools** allow agents to interact with external systems, databases, or perform specific actions
4. **Inngest** handles the event-based execution, durable state, and retry logic
5. **MCP Servers** provide dynamic tool capabilities to agents through Anthropic's Model Context Protocol

## Getting Started

### Prerequisites

- Node.js 16+
- npm/pnpm
- Running Supabase instance

### Running the Server

To start the Inngest server:

```bash
npm run start:inngest
```

To start the development server with hot reload:

```bash
npm run dev:inngest
```

To start both API and Inngest servers together:

```bash
npm run start:all
```

### Testing

To test the chat functionality:

```bash
./test-chat.sh
```

Or run the test script directly:

```bash
npx ts-node src/test-chat.ts
```

To test the MCP integration:

```bash
npx ts-node src/scripts/test-mcp-integration.ts <organisationId> [customMessage]
```

## Development Guide

### Creating a New Agent

To create a new agent, add a new file in the `agents/` directory:

```typescript
import { createAgent, anthropic } from '@inngest/agent-kit';

export const myAgent = createAgent({
  name: 'My Agent',
  description: 'Handles specific tasks',
  system: 'You are an expert agent that...',
  model: anthropic({
    model: 'claude-3-5-haiku-latest',
  }),
});
```

### Creating a Network

Networks combine multiple agents to work together:

```typescript
import { createNetwork } from '@inngest/agent-kit';
import { agentA, agentB } from '../agents/myAgents';

export const myNetwork = createNetwork({
  name: 'My Network',
  agents: [agentA, agentB],
  defaultModel: anthropic({
    model: 'claude-3-5-haiku-latest',
  }),
});
```

### Adding a Tool

Tools extend agent capabilities. Add new tools to the `tools/` directory:

```typescript
import { createTool } from '@inngest/agent-kit';

export const myTool = createTool({
  name: 'my-tool',
  description: 'Does something useful',
  handler: async (input, context) => {
    // Implementation
    return { result: 'Success' };
  },
});
```

## Model Context Protocol (MCP) Integration

Athenic's AgentKit implementation has been enhanced with MCP integration, allowing agents to dynamically use tools provided by MCP servers running in E2B sandboxes.

### How MCP Integration Works

1. **MCP Server Objects**: Definitions of available MCP servers are stored in the `objects` table with `related_object_type_id = 'mcp_server'`
2. **Connection Objects**: When a user "installs" an MCP server, a connection object is created with `related_object_type_id = 'connection'`
3. **E2B Sandbox Deployment**: The MCP server is deployed in an E2B sandbox, and the connection is updated with the server URL
4. **Dynamic Tool Discovery**: When an agent is initialized for a user, it retrieves the MCP servers associated with the user's organization
5. **AgentKit Integration**: MCP servers are injected into the agent's context, giving it access to the tools provided by those servers

### Using MCP Servers in Agent Networks

The `buildMcpServersConfig` function in `utils/mcpHelpers.ts` handles fetching and configuring MCP servers for use with AgentKit:

```typescript
import { buildMcpServersConfig } from '../utils/mcpHelpers.js';

// Inside an Inngest function
const mcpServersConfig = await step.run(
  'Build MCP Servers Config',
  async () => buildMcpServersConfig(organisationId)
);

// Use the MCP servers with an agent or network
const result = await agent.run(message, {
  state,
  mcpServers: mcpServersConfig, // Inject MCP servers
});
```

### Testing MCP Integration

Use the provided test script to verify MCP integration:

```bash
npx ts-node src/scripts/test-mcp-integration.ts <organisationId> [customMessage]
```

This script triggers the `testMcpIntegrationFunction` which:
1. Fetches MCP servers for the specified organization
2. Tests both the chat network and an example MCP-enabled network using the provided message
3. Returns detailed results about the test execution

## Configuration

The Inngest configuration is set in `inngest.ts`. Key settings include:

- Event schemas
- Function definitions and retry policies
- Integration with external services

## API Reference

See the [AgentKit documentation](https://agentkit.inngest.com/getting-started/quick-start) for more details on the available APIs and components.

For MCP documentation, see the [Model Context Protocol specification](https://modelcontextprotocol.io/introduction).
