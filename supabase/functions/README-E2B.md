# E2B Integration for Athenic

This document explains how Athenic uses E2B for code execution in chat conversations.

## Overview

The Athenic Business App chat interface integrates with E2B to provide code execution capabilities. When a user's message indicates a need for code execution, the backend:

1. Uses an LLM to detect if code execution is required
2. Calls the E2B service with the appropriate parameters
3. Sets up a WebSocket connection for real-time streaming of execution results
4. Displays those results in a split-screen view in the Flutter app

## Components

### Backend Components

1. **processMessageJob.ts**: Contains the main logic for determining if code execution is needed and calling the E2B service
2. **E2B Service**: A separate Node.js service that manages the E2B sandboxes and WebSocket connections

### Frontend Components

The Flutter app has been modified to:
1. Display a split-screen view when code execution is active
2. Connect to the WebSocket server to receive real-time updates
3. Render the execution output (stdout, stderr, status messages)

## Configuration

To use the E2B integration, you need to set the following environment variables in your Supabase functions:

```bash
# In Supabase dashboard or .env.local file
E2B_SERVICE_URL=http://your-e2b-service-url:4000  # URL for the E2B service REST API
E2B_WEBSOCKET_URL=ws://your-e2b-service-url:4000  # URL for the E2B service WebSocket
```

## How It Works

1. When a user sends a message, the processMessageJob first calls `checkIfCodeExecutionRequired()` to determine if E2B is needed
2. If code execution is required, it generates a unique client ID and calls the E2B service's `/execute-stream` endpoint
3. The E2B service:
   - Creates a sandbox
   - Executes the code
   - Streams the output via WebSocket
4. The Flutter app:
   - Shows a split-screen view
   - Connects to the WebSocket
   - Displays the execution progress and results

## Testing

Run the provided tests to verify the E2B integration:

```bash
cd Athenic-Backend/e2b
npm test
```

## Debugging

Common issues:
- Check that the E2B service is running
- Verify environment variables are correctly set
- Examine logs in both the Supabase functions and E2B service
- Check WebSocket connections in browser dev tools

## Future Improvements

- Use LLM to extract actual code from user messages
- Add file upload/download capabilities
- Implement file system visualization
- Allow persistent sandboxes for multi-turn interactions 