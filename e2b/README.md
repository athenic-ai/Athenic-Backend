# Athenic E2B Service

This service provides code execution capabilities using the [E2B](https://e2b.dev/) platform, allowing the Athenic application to execute code in secure sandboxed environments.

## Features

- Execute code in isolated sandboxes via HTTP endpoints
- Stream code execution results via WebSocket
- Analyze messages to determine if they require code execution
- Support for multiple programming languages (Python, JavaScript, etc.)
- Secure API with proper authentication and error handling

## Setup

1. Clone the repository and navigate to this directory:
```bash
cd Athenic-Backend/e2b
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```bash
PORT=3001
WEBSOCKET_PORT=3002
E2B_API_KEY=your_e2b_api_key_here
```

You can obtain an E2B API key by signing up at [e2b.dev](https://e2b.dev/).

## Running the Service

### Development Mode

```bash
npm run dev
```

This will start the service with hot-reloading enabled.

### Production Mode

```bash
npm run build
npm start
```

## API Endpoints

### Health Check

```
GET /health
```

Returns the status of the service.

### Execute Code

```
POST /execute
```

Executes code in a sandbox and returns the result.

**Request Body:**
```json
{
  "code": "print('Hello, World!')",
  "language": "python",
  "timeout": 30000
}
```

**Response:**
```json
{
  "executionId": "unique-id",
  "output": "Hello, World!",
  "error": null,
  "duration": 123
}
```

### Execute Code with Streaming

```
POST /execute-stream
```

Executes code in a sandbox and streams the output via WebSocket.

**Request Body:**
```json
{
  "code": "print('Hello, World!')",
  "language": "python",
  "timeout": 30000,
  "clientId": "websocket-client-id"
}
```

### Analyze Execution Needs

```
POST /analyze-execution-needs
```

Analyzes a message to determine if it requires code execution.

**Request Body:**
```json
{
  "message": "Can you run this Python code for me: print('Hello, World!')"
}
```

**Response:**
```json
{
  "requiresExecution": true,
  "suggestedLanguage": "python",
  "codeSnippet": "print('Hello, World!')"
}
```

## WebSocket API

Connect to the WebSocket server:

```
ws://localhost:3002
```

The server accepts the following message types:

- `connect`: Initial connection message
- `execute`: Execute code request
- `cancel`: Cancel execution request

## Testing

Run tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

### Test Notes

- Integration tests will be skipped automatically if no E2B_API_KEY is provided in the environment variables
- Tests include proper handling of E2B sandbox creation, execution, and termination
- End-to-end flow tests have been updated to handle potential timeout issues and include more robust error checking

## E2B SDK Integration

The service uses the E2B JavaScript SDK to interact with E2B sandboxes. Key aspects include:

- **Sandbox Creation**: Sandboxes are created using `Sandbox.create(template, { apiKey })` with appropriate templates for code execution
- **Sandbox Lifecycle**: Sandboxes are properly terminated using the `kill()` method after each execution
- **Error Handling**: All errors from the E2B SDK are properly caught and propagated with appropriate context

## Environment Variables

- `PORT`: HTTP server port (default: 3001)
- `WEBSOCKET_PORT`: WebSocket server port (default: 3002)
- `E2B_API_KEY`: Your E2B API key
- `NODE_ENV`: Environment (development, production, test)
- `LOG_LEVEL`: Logging level (error, warn, info, debug)

## Integration with Athenic

This service is called by the main Athenic backend when code execution capabilities are needed. The Athenic application's chat interface can dynamically switch to a split-screen view to display code execution results when this service is in use.

## License

This project is part of the Athenic platform and is subject to the same licensing terms. 