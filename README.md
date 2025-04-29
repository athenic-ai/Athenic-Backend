# Athenic
The AI Product Brain Framework 

## Overview

Athenic-Backend is the backend component of the Athenic platform, containing Supabase Edge Functions, database scripts, and connection handlers for third-party services.

## Project Structure

- `/supabase`: Supabase edge functions and database configuration
  - `/functions`: Edge functions for handling various operations
    - `/_shared`: Shared utilities and services used across functions
    - `/jobs`: Job execution related functions
    - `/api`: API endpoints
    - `/data`: Data processing functions
  - `/migrations`: Database migration scripts


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

To start the Inngest server, use one of the following commands in your terminal:
# For TypeScript version with ts-node
npm run start:inngest`

# For development with auto-reload
npm run dev:inngest

# For JavaScript version (if you have built the TS files)
npm run start:inngest:js

Or to start both the Inngest server and the API server together:
# Start both servers in development mode
npm run dev:all

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

## NLP Service Improvements - 2024-06-09

- Refactored NLP service to ensure strict TypeScript typing for all OpenAI API calls.
- Added helpers to ensure all messages passed to OpenAI are valid and strictly typed.
- Removed deprecated/invalid tool types (e.g., 'code_interpreter') from OpenAI tool arrays.
- Added explicit type annotations and null checks for improved reliability and maintainability.
- Fixed property typos and ensured compatibility with the latest OpenAI Node SDK.
- All changes validated by running and passing relevant NLP service tests.

## License

This project is licensed under the terms specified in the [LICENSE](./LICENSE) file. 
