# MCP Setup and Configuration Guide

This guide provides instructions on setting up and configuring MCP (Model Context Protocol) support in the Athenic backend.

## Overview

The MCP implementation consists of several components:

1. **E2B MCP Manager** - A service that deploys and manages MCP servers in E2B sandboxes
2. **Credentials Utility** - Utility functions for secure storage of sensitive credentials
3. **MCP Connections Edge Function** - A Supabase Edge Function that provides a REST API for MCP connections
4. **Database Schema** - SQL migrations that set up the necessary database objects

## Setup Instructions

### 1. Set Up Environment Variables

Add the following environment variables to your `.env` file or deployment environment:

```
# E2B API Key for sandbox management
E2B_API_KEY=your_e2b_api_key

# Credential encryption key for securing sensitive data
CREDENTIAL_ENCRYPTION_KEY=your_encryption_key

# For Edge Functions
ENCRYPT_SALT=your_encryption_salt
```

### 2. Apply Database Migrations

Run the following command to apply the database migrations:

```bash
# First, make sure your migration history is clean
supabase db reset

# Then apply migrations
supabase migration up
```

If you encounter issues with migrations, you can manually apply the SQL:

```bash
# Connect to your Supabase database and run the SQL from:
# supabase/migrations/20250417000000_create_mcp_server_types.sql
```

### 3. Deploy Edge Functions

Deploy the MCP Connections Edge Function:

```bash
# Make sure you have the CORS configuration set up
mkdir -p supabase/functions/_shared/configs
# Create the CORS configuration file (cors.ts) in that directory

# Create the import map
touch supabase/import_map.json

# Deploy the function
supabase functions deploy mcp-connections
```

## Using the MCP API

### Available Endpoints

The MCP Connections Edge Function provides the following endpoints:

- `GET /mcp-server-definitions` - Get a list of available MCP server types
- `GET /mcp-connections?account_id=<account_id>` - Get a list of MCP connections for an account
- `POST /mcp-connections/install` - Install a new MCP server connection
- `DELETE /mcp-connections/:connection_id` - Delete an MCP connection

### Example: Installing an MCP Server

To install an MCP server, send a POST request to the install endpoint:

```javascript
const response = await fetch('https://your-project.supabase.co/functions/v1/mcp-connections/install', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseApiKey}`
  },
  body: JSON.stringify({
    mcp_server_id: 'cc6bef2a-ea38-4634-9bb3-f2f197de74a3', // GitHub API server
    account_id: 'your-account-id',
    title: 'My GitHub Connection',
    provided_credential_schema: {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'your-github-token'
    }
  })
});

const data = await response.json();
console.log(data);
```

## Troubleshooting

### Common Issues

1. **Database Migration Errors**: If you encounter issues with migrations, try using `supabase db reset` to clean the migration history before applying new migrations.

2. **Edge Function Deployment Errors**: Make sure you have the CORS configuration file and import map set up correctly.

3. **Encryption Errors**: Ensure the `CREDENTIAL_ENCRYPTION_KEY` environment variable is set and consistent across environments.

4. **E2B Sandbox Issues**: Check that your E2B API key is valid and has sufficient permissions.

### Logs

To view edge function logs, use:

```bash
supabase functions logs
```

## Next Steps

After setting up the MCP implementation, you can:

1. Create a UI for managing MCP connections in the Athenic frontend
2. Integrate MCP servers with AI agents in the backend
3. Develop custom MCP servers for specific use cases

## References

- [MCP Documentation](https://modelcontextprotocol.io)
- [E2B Documentation](https://github.com/e2b-dev/e2b)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) 