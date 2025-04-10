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
      - `/orchestrator`: Central coordination system
    - `/jobs`: Job execution related functions
    - `/api`: API endpoints
    - `/data`: Data processing functions
  - `/migrations`: Database migration scripts

## Agent Orchestration Layer

The Agent Orchestration Layer is a new addition to Athenic that enables agentic capabilities through a coordinated multi-agent system. This layer follows a hierarchical architecture where specialized agents collaborate to solve complex problems.

### Key Features

- **Multi-Agent Architecture**: Specialized agents with distinct responsibilities work together in coordination
- **Memory Management**: Short-term working memory and long-term semantic memory for persistent knowledge
- **Tool Integration**: Standardized interface for integrating and executing tools
- **Hierarchical Task Execution**: Complex tasks are broken down into manageable steps with dependency tracking
- **Autonomous Operation**: Support for continuous operation through agentic loops

### Agents

The system comprises several specialized agents:

1. **Executive Agent**: Interprets requests, makes high-level decisions, and synthesizes results
2. **Knowledge Agent**: Retrieves information, analyzes data, and manages contextual understanding
3. **Planner Agent**: Creates execution plans, breaks down tasks, and manages dependencies
4. **Executor Agent**: Implements plans, interacts with tools, and manages execution state

For more details, see the [Agent Orchestration Layer README](./supabase/functions/agents/README.md).

## Setup and Development

### Prerequisites

- Node.js 18+
- Supabase CLI
- npm or yarn

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
supabase functions deploy
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
