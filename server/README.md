# Athenic E2B Server

This directory contains the Express server implementation for the Athenic E2B sandbox integration.

## Overview

The E2B server provides a REST API for interacting with the E2B sandbox environment. It allows running commands, performing file operations, and automating browser interactions within a secure, isolated environment.

## Getting Started

### Prerequisites

- Node.js v18 or later
- E2B account with API key (sign up at [e2b.dev](https://e2b.dev))

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   source ./scripts/setup-e2b-env.sh
   ```

3. Deploy the Athenic agent template:
   ```bash
   node e2b/deploy-template.js
   ```

### Running the Server

Use the provided start script:

```bash
./scripts/start-e2b-server.sh
```

This will start the server on port 3333 and provide instructions for testing.

## API Endpoints

### `/api/sandbox/run`

Run a command in the E2B sandbox environment.

**Method:** POST

**Headers:**
- `Content-Type: application/json`
- `X-API-Key: test-api-key-for-development` (for dev environment)

**Request Body:**
```json
{
  "command": "ls -la",
  "templateId": "base",
  "sessionId": "optional-custom-session-id",
  "organizationId": "optional-organization-id"
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "total 16\ndrwxr-xr-x 1 user user 4096 May 15 10:00 .\ndrwxr-xr-x 1 user user 4096 May 15 10:00 ..\n-rw-r--r-- 1 user user    0 May 15 10:00 file.txt\n",
  "stderr": "",
  "exitCode": 0
}
```

### `/api/sandbox/status`

Check the status of the sandbox API.

**Method:** GET

**Headers:**
- `X-API-Key: test-api-key-for-development` (for dev environment)

**Response:**
```json
{
  "status": "operational",
  "apiKeyConfigured": true,
  "version": "0.1.0"
}
```

## Testing

### Using Simple Demo Script

```bash
node tests/e2b-simple-demo.js
```

### Using cURL

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-api-key-for-development" \
  -d '{"command":"ls -la", "templateId":"base"}' \
  http://localhost:3333/api/sandbox/run
```

### Using the Flutter App

Run the Flutter app and navigate to the Sandbox Terminal screen from the drawer menu.

## Troubleshooting

### Common Issues

1. **"E2B API key not configured" error**
   - Make sure you've set the E2B_API_KEY environment variable
   - Run `source ./scripts/setup-e2b-env.sh` to configure it

2. **"Template not found" error**
   - Deploy the template first with `node e2b/deploy-template.js`
   - Try using the "base" template which is always available

3. **"Connection refused" error when using Flutter app**
   - Make sure the server is running on localhost:3333
   - If running on a mobile device, you may need to use your computer's IP address instead of localhost

## Security Considerations

In a production environment:
- Use a proper API key management system
- Set up proper CORS restrictions
- Implement rate limiting
- Use HTTPS for all communications 