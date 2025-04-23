# Athenic E2B Service

This service provides a REST API and WebSocket interface for executing code using E2B sandboxes within the Athenic platform.

## Overview

The E2B Service is a critical component of the Athenic architecture, enabling:

- Secure code execution in isolated sandboxes
- Real-time feedback during code execution via WebSockets
- Integration with the Athenic backend for autonomous agent workflows

## Features

- **REST API** for initiating code execution
- **WebSocket Interface** for real-time execution feedback
- **Sandbox Management** to efficiently create and close E2B environments
- **Execution Streaming** for stdout/stderr in real-time
- **Multi-language Support** for running Python, JavaScript, and more

## What's New in 1.1.1

- Enhanced WebSocket testing suite with dedicated test cases
- Improved multi-line code execution tests
- Added error handling tests for WebSocket connections

## What's New in 1.1.0

- Upgraded to use the new `@e2b/code-interpreter` package
- Improved error handling and session cleanup
- Fixed WebSocket output handling for stdout and stderr
- Added proper TypeScript typing for all parameters

## Setup

### Prerequisites

- Node.js 18+
- An E2B API key (from [e2b.dev](https://e2b.dev))

### Installation

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env file to add your E2B API key
```

### Environment Variables

- `PORT`: HTTP port for the REST API (default: 4000)
- `E2B_API_KEY`: Your E2B API key (required)

## Development

```bash
# Start development server with hot reload
npm run dev
```

## Testing

```bash
# Run all tests
npm test

# Run specific tests
npm test -- -t "WebSocket"

# Run tests with coverage
npm run test:coverage
```

## Building and Running

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Docker Support

```bash
# Build the Docker image
docker build -t athenic-e2b-service .

# Run the Docker container
docker run -p 4000:4000 -e E2B_API_KEY=your_api_key athenic-e2b-service
```

Or using Docker Compose:

```bash
# Start with Docker Compose
docker-compose up
```

## API Reference

### REST Endpoints

#### `POST /execute`

Execute code in an E2B sandbox.

**Request body**:
```json
{
  "code": "print('Hello, World!')",
  "language": "python",
  "timeout": 30000
}
```

**Parameters**:
- `code` (required): The code to execute
- `language` (optional): Programming language to use (default: "python")
- `timeout` (optional): Execution timeout in milliseconds (default: 30000)

**Response**:
```json
{
  "executionId": "1682412345678",
  "result": {
    "results": [...],
    "logs": {
      "stdout": ["Hello, World!"],
      "stderr": []
    },
    "error": null
  },
  "duration": 235
}
```

#### `POST /execute-stream`

Execute code with real-time streaming via WebSocket.

**Request body**:
```json
{
  "code": "print('Hello, World!')",
  "language": "python", 
  "timeout": 30000,
  "clientId": "client_123456"
}
```

**Parameters**:
- `code` (required): The code to execute
- `language` (optional): Programming language to use (default: "python")
- `timeout` (optional): Execution timeout in milliseconds (default: 30000)
- `clientId` (required): WebSocket client ID to stream output to

**Response**:
```json
{
  "executionId": "1682412345678", 
  "status": "streaming",
  "clientId": "client_123456"
}
```

### WebSocket Events

Connect to the WebSocket server to receive real-time updates during code execution:

```javascript
const ws = new WebSocket('ws://localhost:4000?clientId=client_123456');
```

#### Event Types

- `status`: Updates about sandbox and execution status
- `stdout`: Standard output from the executing code
- `stderr`: Standard error from the executing code
- `error`: Execution errors
- `result`: Final execution result

#### Sample WebSocket Messages

Status Update:
```json
{
  "type": "status",
  "executionId": "1682412345678",
  "status": "running",
  "message": "Executing code..."
}
```

Standard Output:
```json
{
  "type": "stdout",
  "executionId": "1682412345678",
  "data": "Hello, World!"
}
```

Error:
```json
{
  "type": "stderr",
  "executionId": "1682412345678",
  "data": "NameError: name 'undefined_variable' is not defined"
}
```

## Integration with Athenic

This service is designed to be called by the Athenic backend when agents need to execute code as part of their workflows.

## License

ISC License 