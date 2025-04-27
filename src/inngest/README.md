# Athenic Inngest Integration

This directory contains the integration with Inngest for the Athenic backend. Inngest is used for workflow orchestration, which enables more complex, durable, and reliable agent workflows compared to direct API calls.

## Structure

- `client.ts` - Configures the Inngest client
- `functions.ts` - Defines Inngest functions that handle specific events
- `server.ts` - Sets up an Express server to serve the Inngest webhook handler
- `index.ts` - Re-exports all components for easy importing

## Getting Started

### Prerequisites

- Node.js installed
- Inngest CLI installed (`npm install -g inngest-cli`)

### Configuration

Add the following environment variables to your `.env` file:

```
INNGEST_API_KEY=your_api_key     # Optional, for Inngest Cloud
INNGEST_EVENT_KEY=athenic-dev    # Used to sign events
INNGEST_SERVER_PORT=8000         # Port for the Inngest server
```

### Running the Server

To start the Inngest server:

```bash
npm run start:inngest
```

This will start an Express server at the port specified in your `.env` file.

### Development

For local development with hot reloading:

```bash
npm run dev:inngest
```

### Testing the Connection

To test the Inngest connection:

```bash
npm run test:inngest
```

This will send a test event to Inngest and verify if it was received.

### Running the Inngest Dev Server

To visualize and debug events and functions, run the Inngest Dev Server:

```bash
npx inngest-cli dev
```

This will open a browser window showing the Inngest Dev UI, where you can see events, function executions, and debug logs.

## Function Calling Flow

1. Events are sent to Inngest using the `inngest.send()` method
2. Registered functions that match the event name will be triggered
3. Each function executes steps via `step.run()`
4. Steps can use AgentKit to implement agent logic
5. Results of the functions can trigger webhooks or callbacks

## Adding New Functions

To create a new Inngest function:

1. Add the function to `functions.ts` using `inngest.createFunction()`
2. Register it in the `inngestFunctions` array in `server.ts`
3. Restart the server to apply changes 