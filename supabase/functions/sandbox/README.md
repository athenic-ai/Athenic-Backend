# Athenic Sandbox Edge Function

This Edge Function provides a secure way to execute commands in an E2B sandbox environment from the Athenic frontend. It ensures proper authentication and validates requests before executing them in an isolated environment.

## Configuration

To use this function, you need to set the following environment variables:

- `E2B_API_KEY`: Your E2B API key for sandbox execution
- `ENVIRONMENT`: Optional environment setting ('development' or 'production')

## Endpoints

The function exposes the following endpoints:

### GET `/status`

Returns the current status of the E2B sandbox service.

**Response Example:**
```json
{
  "status": "operational",
  "apiKeyConfigured": true, 
  "apiKeyWorking": true,
  "version": "0.1.1"
}
```

### POST `/run`

Executes a command in the E2B sandbox.

**Request Body:**
```json
{
  "command": "ls -la",
  "templateId": "base",
  "sessionId": "user-session-123",
  "organizationId": "athenic-test-org"
}
```

**Response Example:**
```json
{
  "success": true,
  "stdout": "total 32\ndrwxr-xr-x 2 root root 4096 Dec 1 12:00 .\n...",
  "stderr": "",
  "exitCode": 0
}
```

## Authentication

The function uses Supabase JWT authentication. Requests must include an `Authorization` header with a valid Supabase JWT token.

In development mode, authentication can be skipped by setting `ENVIRONMENT=development`.

## Deployment

### Prerequisites

1. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Log in to Supabase:
   ```bash
   supabase login
   ```

3. Create a `.env` file based on the example:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file to include your actual E2B API key:
   ```
   E2B_API_KEY=your_actual_api_key
   ```

### Deploy the Function

1. Deploy the Edge Function with secrets:
   ```bash
   cd /path/to/Athenic-Backend
   supabase functions deploy sandbox --project-ref hlxtkgwbgmvrvznvnlyb
   supabase secrets set --env-file ./supabase/functions/sandbox/.env --project-ref hlxtkgwbgmvrvznvnlyb
   ```

2. Test the deployed function:
   ```bash
   curl -X GET "https://hlxtkgwbgmvrvznvnlyb.supabase.co/functions/v1/sandbox/status" \
     -H "X-API-Key: test-api-key-for-development"
   ```

## Usage

### Get Sandbox Status

```bash
curl -X GET "https://your-project-ref.supabase.co/functions/v1/sandbox/status" \
  -H "X-API-Key: your-api-key"
```

### Run a Command

```bash
curl -X POST "https://your-project-ref.supabase.co/functions/v1/sandbox/run" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "command": "ls -la",
    "sessionId": "user123",
    "organizationId": "org456"
  }'
```

## Frontend Integration

Update your application's API service to point to this Edge Function instead of the local development server. Replace:

```
http://localhost:3333/api/sandbox/status
http://localhost:3333/api/sandbox/run
```

With:

```
https://your-project-ref.supabase.co/functions/v1/sandbox/status
https://your-project-ref.supabase.co/functions/v1/sandbox/run
``` 