# Athenic Backend API Layer

This API layer serves as a bridge between the Flutter app and the Inngest orchestration layer. It provides endpoints for handling chat messages and retrieving responses, with E2B execution capabilities.

## Architecture

The Backend API Layer follows a simple request-response pattern with asynchronous processing:

1. The Flutter app sends chat messages to the API server
2. The API server immediately acknowledges the message and returns a client ID
3. The API server forwards the message to Inngest for processing
4. Inngest determines if E2B execution is required and generates a response
5. The response is stored in the API server for retrieval by the client
6. The client can poll for the response using the client ID (in the future, WebSockets will be used)

## API Endpoints

### Health Check

```
GET /api/health
```

Returns the health status of the API server.

**Response:**
```json
{
  "status": "healthy",
  "service": "api-server"
}
```

### Chat Message

```
POST /api/chat
```

Submit a chat message for processing.

**Request:**
```json
{
  "message": "Write some code to calculate the factorial of a number"
}
```

**Headers:**
- `x-client-id` (optional): A client ID for session tracking. If not provided, a new UUID will be generated.

**Response:**
```json
{
  "success": true,
  "message": "Chat message received and is being processed",
  "clientId": "2cd39703-d6ff-4d1c-b9ae-b83340986ca3"
}
```

### Get Chat Response

```
GET /api/chat/response/:clientId
```

Retrieve the latest response for a given client ID.

**Response:**
```json
{
  "lastMessage": "Write some code to calculate the factorial of a number",
  "lastResponse": {
    "message": "I'll need to execute some code to help with \"Write some code to calculate the factorial of a number\". Let me set that up for you.",
    "requiresE2B": true,
    "clientId": "2cd39703-d6ff-4d1c-b9ae-b83340986ca3",
    "timestamp": "2025-04-27T20:53:57.947Z"
  },
  "requiresE2B": true,
  "timestamp": "2025-04-27T20:53:57.952Z"
}
```

## Running the API Server

The API server can be run in two ways:

### TypeScript (Development)

```bash
npm run dev:api
```

### JavaScript (Production)

```bash
npm run start:api:js
```

### Running with Inngest Server

To run both the API server and Inngest server together:

```bash
npm run start:all:js
```

## Environment Variables

- `API_SERVER_PORT`: The port on which the API server listens (default: 3000)
- `INNGEST_SERVER_PORT`: The port on which the Inngest server listens (default: 8000)

## Future Enhancements

1. **WebSocket Support**: Replace polling with real-time WebSocket communication
2. **Authentication**: Add proper authentication with Supabase Auth
3. **E2B Integration**: Direct integration with the E2B service for code execution
4. **Request Validation**: Add schema validation for incoming requests
5. **Error Handling**: Improve error handling and client feedback
6. **Logging**: Add structured logging for better debugging 