# Athenic E2B Service

This service provides code execution capabilities to the Athenic platform using E2B sandboxes and real-time visualization through WebSockets.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with your E2B API key:
   ```
   E2B_API_KEY=your_api_key_here
   PORT=4000
   ```

3. Start the service:
   ```bash
   npm run dev
   ```

## Problem Solved

This service solves the challenge of executing code in secure sandboxes and streaming real-time results back to the Flutter app. It enables:

1. Secure execution of user code/commands in isolated environments
2. Real-time streaming of execution progress and output
3. Interactive terminals for users to see code execution results
4. Integration with the Athenic chat interface

## Environment Configuration

### Development

When running locally, you can use the following setup:

1. Run the E2B service:
   ```bash
   cd Athenic-Backend/e2b
   npm run dev
   ```

2. The Flutter app will connect to the service using:
   - API URL: `http://localhost:4000`
   - WebSocket URL: `ws://localhost:4000`

### Production

In production, the service should be deployed to a publicly accessible URL, and the following environment variables should be set:

1. In Supabase Edge Functions:
   ```
   E2B_SERVICE_URL=https://your-deployed-service.com/execute-stream
   E2B_WEBSOCKET_URL=wss://your-deployed-service.com
   ```

2. In the Flutter app (through build environments):
   ```
   E2B_API_URL=https://your-deployed-service.com
   E2B_WEBSOCKET_URL=wss://your-deployed-service.com
   ```

## Using with the Supabase Edge Function

The Supabase Edge Function running in production cannot directly access `localhost`. There are two ways to handle this:

1. **Development with Forwarding**: Use a service like ngrok to make your local E2B service publicly accessible:
   ```bash
   npx ngrok http 4000
   ```
   
   Then, when testing, add two custom headers to your request:
   ```
   x-e2b-service-url: https://your-ngrok-url.ngrok.io/execute-stream
   x-e2b-websocket-url: wss://your-ngrok-url.ngrok.io
   ```

2. **Production Deployment**: Deploy the E2B service to a public URL and set the environment variables as described above.

## API Reference

### `POST /execute-stream`

Executes code in a sandbox and streams the output via WebSocket.

**Request:**
```json
{
  "code": "print('Hello, World!')",
  "clientId": "unique_client_id",
  "language": "code-interpreter-v1",
  "timeout": 30000
}
```

**Response:**
```json
{
  "executionId": "abc123",
  "status": "streaming",
  "clientId": "unique_client_id"
}
```

### WebSocket Connection

Connect to `ws://localhost:4000?clientId=unique_client_id` (or your production URL) to receive real-time updates.

**WebSocket Messages:**

1. Status updates:
   ```json
   {
     "type": "status",
     "executionId": "abc123",
     "status": "running",
     "message": "Executing code..."
   }
   ```

2. Output:
   ```json
   {
     "type": "stdout",
     "executionId": "abc123",
     "data": "Hello, World!"
   }
   ```

3. Errors:
   ```json
   {
     "type": "stderr",
     "executionId": "abc123",
     "data": "Error message..."
   }
   ```

4. Results:
   ```json
   {
     "type": "result",
     "executionId": "abc123",
     "data": { /* Execution results */ },
     "duration": 1234
   }
   ```

## Troubleshooting

If you're experiencing issues with the E2B terminal integration:

1. Check that the E2B service is running and accessible.
2. Verify the E2B API key is valid and has permissions.
3. Ensure WebSocket URLs are correctly formatted and include the protocol (ws:// or wss://).
4. For Supabase Edge Function connectivity, check the headers or environment variables.
5. Look at the browser console and server logs for any error messages.

## Running Tests

Run the test suite with:
```bash
npm test
```

To run only the mock tests that don't require an E2B API key:
```bash
npm run test:mock
```

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