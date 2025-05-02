# Athenic Backend

This repository contains the backend services for the Athenic AI Agent Platform. It utilizes Inngest for orchestration, AgentKit for agent logic, E2B for sandboxed code execution, and Supabase for data persistence and authentication.

## Overview

Athenic is an agentic AI platform designed to understand high-level business objectives and autonomously work towards achieving them. The platform operates in both manual (user-driven, interactive) and autonomous (goal-driven, background) modes, using AI agents with Human-in-the-Loop capabilities when necessary.

### Key Components

- **Inngest:** Handles durable workflow orchestration, scheduling, and event-driven function execution. Agent logic runs within Inngest functions.
- **AgentKit:** Provides the framework for building AI agents, managing their state, tools, and interactions (including LLM calls and Human-in-the-Loop).
- **E2B:** Offers secure, cloud-based sandboxes (on-demand Linux environments) for executing code, interacting with filesystems, and running tools requiring specific dependencies. Invoked via AgentKit tools.
- **Supabase:** Provides the PostgreSQL database using a flexible object model, authentication (Supabase Auth), and potentially real-time capabilities and storage.

## Project Structure

- **`src/`**: Contains the primary backend source code.
  - **`inngest/`**: Houses Inngest function definitions, AgentKit agent implementations, tool definitions (including E2B and Supabase interactions), and workflow logic. This is the core of the agentic system.
  - **`api/`**: Simple API layer for handling HTTP requests, webhook endpoints, and forwarding events to Inngest.
  - **`types/`**: TypeScript type definitions.
  - **`utils/`**: Shared utility functions.
  - **`scripts/`**: Utility scripts (e.g., maintenance, deployment helpers).
- **`tests/`**: Test files for the codebase
  - **`inngest/`**: Tests for Inngest functions and tools
  - **`api/`**: Tests for API endpoints
  - **`integration/`**: Integration tests across components
  - **`unit/`**: Unit tests for utility functions
  - **`mocks/`**: Mock data and utilities for testing
- **`supabase/`**: Contains Supabase-specific configurations.
  - **`migrations/`**: SQL scripts for database schema changes.
  - **`functions/`**: Supabase Edge Functions (use sparingly; prefer Inngest for core logic). May contain webhook handlers or simple API endpoints that trigger Inngest events.
    - `_shared/`: Code shared between edge functions.
- **`logs/`**: Log files (not committed to git)
- **`package.json`**: Defines project dependencies and scripts.
- **`tsconfig.json`**: TypeScript configuration.
- **`inngest.json`**: Configuration for the Inngest CLI.
- **`.env`**: Environment variables (API keys, database URLs, etc. - **DO NOT COMMIT**).

## Setup and Development

### Prerequisites

- Node.js (v18+)
- npm or yarn
- Supabase CLI (if managing Supabase locally or deploying functions/migrations)
- Inngest Dev Server (for local development)
- E2B API Key (for using E2B sandboxes)
- Supabase Project URL and Anon Key
- OpenAI API Key (or other LLM provider keys)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd Athenic-Backend
    ```
2.  **Install Node.js version:**
    ```bash
    # If using nvm (recommended)
    nvm install
    nvm use
    ```
3.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
4.  **Set up environment variables:**
    - Copy `.env.example` to `.env` (if an example file exists).
    - Fill in the required values in `.env`:
      ```
      # Supabase
      SUPABASE_URL=your_supabase_project_url
      SUPABASE_ANON_KEY=your_supabase_anon_key
      
      # Inngest
      INNGEST_API_KEY=your_inngest_api_key
      INNGEST_EVENT_KEY=your_inngest_event_key
      INNGEST_SIGNING_KEY=your_inngest_signing_key
      
      # E2B
      E2B_API_KEY=your_e2b_api_key
      
      # LLM Provider(s)
      OPENAI_API_KEY=your_openai_key
      
      # Server Configuration
      API_SERVER_PORT=3000
      INNGEST_SERVER_PORT=8001
      ```

### Local Development

1.  **Run Inngest Dev Server:**
    This server discovers and runs your Inngest functions locally.
    ```bash
    npm run dev:inngest-cli
    ```

2.  **Start the API server:**
    ```bash
    npm run dev:api
    ```

3.  **Start the Inngest server:**
    ```bash
    npm run dev:inngest
    ```

4. **Or run everything together (recommended):**
    ```bash
    npm run dev:all
    ```

This will start:
- API server on port 3000 (default)
- Inngest server on port 8001 (default)
- Inngest Dev CLI server (typically on port 8288)

### Testing

The project includes several testing utilities:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Test Inngest connection
npm run test:inngest

# Test chat message event
npm run test:chat

# Test direct function call
npm run test:direct
```

### Logs

Log files are stored in the `logs/` directory. Several commands are available for viewing logs:

```bash
# View all logs (follow mode)
npm run logs:follow

# View only error logs
npm run logs:errors

# View API server logs
npm run logs:api

# View Inngest server logs
npm run logs:inngest
```

## Deployment

- **Inngest Functions:** Deploy via the Inngest platform (Cloud or self-hosted). See Inngest documentation.
- **Supabase:**
  - Deploy migrations using `supabase db push`.
  - Deploy Edge Functions (if any) using `supabase functions deploy <function-name>`.
- **API Layer:** Deploy according to its framework (e.g., Docker container or serverless function).

## Data Model

Athenic uses a flexible object model in Supabase:

- **`objects`**: Central table holding all data instances. Each object has a type, metadata in JSON format, ownership information, and potentially vector embeddings for semantic search.
- **`object_types`**: Defines schemas for different types of objects (e.g., "project", "task", "file", "message").
- **`object_metadata_types`**: Specifies the allowed fields within the metadata for each object type.
- **`accounts`**: Represents tenants (organizations/companies) for multi-tenant isolation.
- **`members`**: Users within accounts with various permissions.

## Operational Modes

1. **Manual Mode (User-Driven, Interactive):**
   - Initiated by user chat messages
   - Real-time, interactive responses
   - Can include visualization of agent work (e.g., in E2B sandboxes)

2. **Autonomous Mode (Goal-Driven, Background):**
   - Works based on pre-defined high-level goals
   - Runs in the background, potentially for extended periods
   - Uses Human-in-the-Loop for risky operations based on configurable risk thresholds
   - Leverages Inngest for durable execution over long timeframes

## Contributing

[Guidelines for contributing to the project, coding standards, etc.]

## License

Refer to the [LICENSE](./LICENSE) file. 
