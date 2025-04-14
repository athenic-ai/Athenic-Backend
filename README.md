# Athenic
The AI Product Brain Framework 

## Overview

Athenic-Backend is the backend component of the Athenic platform, containing Supabase Edge Functions, database scripts, and connection handlers for third-party services.

## Project Structure

- `/supabase`: Supabase edge functions and database configuration
  - `/functions`: Edge functions for handling various operations
    - `/_shared`: Shared utilities and services used across functions
    - `/agents`: Agent Orchestration Layer components
      - `/executiveAgent`: Central coordinator for task interpretation
      - `/knowledgeAgent`: Information retrieval and context management
      - `/plannerAgent`: Task breakdown and execution planning
      - `/executorAgent`: Plan implementation and tool interaction
      - `/memoryManager`: Working and long-term memory management
      - `/toolsManager`: Tool registry and execution
      - `/sandboxEnvironment`: Secure execution environment for agent operations
      - `/orchestrator`: Central coordination system
    - `/jobs`: Job execution related functions
    - `/api`: API endpoints
    - `/data`: Data processing functions
  - `/migrations`: Database migration scripts
- `/e2b`: E2B sandbox environment configuration and deployment scripts
- `/tests`: Test scripts and utilities

## Database Architecture and Object Model

Athenic uses a flexible, metadata-driven approach to data storage rather than hardcoded schemas:

### Core Principles

- **Object-Based Storage**: All data is stored as generic object entries in the `objects` table
- **Type Definition**: Object types are defined in the `object_types` table
- **Metadata Structure**: Each object type's structure is defined in the `object_metadata_types` table
- **No Hardcoded Models**: Do not create hardcoded model classes for specific data types

### Key Database Tables

- **objects**: Stores all user and system data with a consistent structure
- **object_types**: Defines the available types of objects in the system
- **object_metadata_types**: Defines the structure and metadata fields for each object type
- **signals**: Stores AI-generated insights and observations about objects
- **jobs**: Defines work items to be completed by the AI or users

### Benefits of this Approach

- Dynamic addition of new data types without code changes
- Flexible evolution of existing data types
- Consistent data handling patterns throughout the application
- Ability to define custom object types for specific organizations
- Simplified database management

Always use the generic Object model for all data handling operations rather than creating specialized classes for specific data types. This ensures maximum flexibility and avoids hardcoded schemas that require migration to modify.

## Agent Orchestration Layer

The Agent Orchestration Layer is a new addition to Athenic that enables agentic capabilities through a coordinated multi-agent system. This layer follows a hierarchical architecture where specialized agents collaborate to solve complex problems.

### Key Features

- **Multi-Agent Architecture**: Specialized agents with distinct responsibilities work together in coordination
- **Memory Management**: Short-term working memory and long-term semantic memory for persistent knowledge
- **Tool Integration**: Standardized interface for integrating and executing tools
- **Hierarchical Task Execution**: Complex tasks are broken down into manageable steps with dependency tracking
- **Autonomous Operation**: Support for continuous operation through agentic loops
- **Sandbox Environment**: Secure isolated execution environment powered by E2B

### Agents

The system comprises several specialized agents:

1. **Executive Agent**: Interprets requests, makes high-level decisions, and synthesizes results
2. **Knowledge Agent**: Retrieves information, analyzes data, and manages contextual understanding
3. **Planner Agent**: Creates execution plans, breaks down tasks, and manages dependencies
4. **Executor Agent**: Implements plans, interacts with tools, and manages execution state

For more details, see the [Agent Orchestration Layer README](./supabase/functions/agents/README.md).

## Sandbox Environment

The Sandbox Environment provides a secure, isolated execution environment for agent operations. It uses [E2B](https://e2b.dev) to create sandboxed microVMs that can safely execute code, browse the web, and interact with files.

### Setting Up E2B

To use the E2B sandbox:

1. Sign up for an E2B account at [e2b.dev](https://e2b.dev)
2. Get your API key from the E2B dashboard
3. Set up your environment:

```bash
# Set your E2B API key
export E2B_API_KEY=your_api_key

# Deploy the Athenic agent template
cd e2b
node deploy-template.js
```

For more details, see the [E2B Sandbox README](./e2b/README.md).

## Setup and Development

### Prerequisites

- Node.js 18+
- Supabase CLI
- npm or yarn
- E2B account (for sandbox operations)

### Installation

```bash
# Ensure using Node.js 18
nvm use 18

# Install dependencies
npm install
```

### Local Development

```bash
# Start Supabase locally
supabase start

# Deploy edge functions
supabase functions deploy agent-orchestrator-api
```

### Deploying the Agent Orchestrator API

To deploy the agent orchestrator API (which manages the sandbox environment):

```bash
# Set required environment variables
export SUPABASE_PROJECT_REF=your_project_ref
export ATHENIC_API_KEY=your_api_key
export IS_DEVELOPMENT=true  # Use false for production

# Run the deployment script
node deploy-orchestrator-api.js
```

## Testing

The project includes a comprehensive test suite to ensure functionality works as expected.

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run with watch mode
npm run test:watch
```

### Testing the Sandbox Environment

To test the sandbox API:

```bash
# Run the sandbox API client
node tests/sandbox-api-client.js
```

For local testing of the sandbox without the API:

```bash
# Run the sandbox test client
node tests/sandbox-test-client.js
```

### Test Script

For more control over which tests to run, use the provided test script:

```bash
# Show help
./tests/run-tests.sh --help

# Run all unit tests
./tests/run-tests.sh --unit

# Run specific component tests
./tests/run-tests.sh --component storage

# Run integration tests with coverage
./tests/run-tests.sh --integration --coverage
```

For more details on testing, see the [Tests README](./tests/README.md).

## License

This project is licensed under the terms specified in the [LICENSE](./LICENSE) file. 
