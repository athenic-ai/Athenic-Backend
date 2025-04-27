# E2B Test Function

This Supabase Edge Function demonstrates integration with E2B's code execution sandbox.

## Overview

The `e2b-test` function provides a way to execute code in a secure, isolated environment using E2B's sandbox capabilities. It accepts a user message as input and uses E2B to process it, returning the response.

## Prerequisites

- A valid E2B API key (obtain one at [e2b.dev](https://e2b.dev/))
- Supabase project with Edge Functions enabled

## Setup

1. Set your E2B API key as a Supabase secret:
   ```bash
   supabase secrets set E2B_API_KEY="your_e2b_api_key_here"
   ```

2. Deploy the function:
   ```bash
   supabase functions deploy e2b-test --no-verify-jwt
   ```

## Usage

Send a POST request to the function URL with a JSON payload containing a `message` field:

```bash
curl -X POST 'https://your-project-ref.supabase.co/functions/v1/e2b-test' \
  -H 'Content-Type: application/json' \
  -d '{"message": "What is 2+2?"}'
```

## Response Format

The function returns a JSON object with the following structure:

```json
{
  "response": "The AI's response to your query",
  "success": true
}
```

If an error occurs, the response will include error details:

```json
{
  "response": "Error message",
  "success": false
}
```

## Troubleshooting

If you encounter an error with "Invalid API key", ensure:

1. You've set the correct E2B API key in Supabase secrets
2. The API key is properly formatted (should start with "e2b_")
3. Your account with E2B is active and the API key is valid
4. You've redeployed the function after updating the API key

## Further Information

For more details about E2B and its capabilities, refer to the [E2B documentation](https://e2b.dev/docs). 