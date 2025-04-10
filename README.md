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
