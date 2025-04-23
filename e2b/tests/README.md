# E2B Service Tests

This directory contains the test suite for the E2B service integration with Athenic.

## Test Structure

- **API Tests**: Test the REST API endpoints (`api.test.ts`)
- **WebSocket Tests**: Test the WebSocket functionality (`websocket.test.ts`)
- **E2B Trigger Tests**: Test the code execution detection logic (`e2b-trigger.test.ts`)
- **Execute Stream Tests**: Test code execution streaming (`execute-stream-call.test.ts`)
- **Sandbox Tests**: Test sandbox management functionality (`sandbox.test.ts`)
- **E2B Fixes Tests**: Test specific fixes for E2B integration issues (`e2b-fixes.test.ts`)
- **Mock Tests**: Tests that don't require actual E2B service connection (`e2b-trigger-mock.test.ts`)

## Running Tests

### Prerequisites

- Node.js 16+ installed
- npm installed
- `.env` file properly configured (see below)

### Environment Configuration

Create a `.env` file in the root of the `e2b` directory with the following variables:

```
E2B_API_KEY=your_e2b_api_key_here
E2B_SERVICE_URL=https://api.e2b.dev
NODE_ENV=development
LOG_LEVEL=debug
PORT=8080
WS_PORT=8081
```

### Running All Tests

```bash
npm test
```

### Running Specific Test Files

```bash
npm test -- tests/api.test.ts
npm test -- tests/websocket.test.ts
```

### Running Mock Tests (No E2B Service Required)

These tests can run in CI environments without requiring an actual E2B service connection:

```bash
npm run test:mock
```

## Testing in CI Environment

For CI environments, the mock tests will automatically be used when the `E2B_API_KEY` environment variable is not available. Other tests will be skipped with appropriate warnings.

If you need to run the tests that require an actual E2B service connection, make sure to set up the necessary environment variables in your CI workflow. 