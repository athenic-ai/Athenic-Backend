# Athenic E2B Sandbox Testing Guide

This guide will help you test the E2B Sandbox functionality in Athenic. The E2B Sandbox allows agents to execute commands, browser actions, and file operations in a secure, isolated environment.

## Prerequisites

- Node.js v18 or later
- Access to the Athenic-Backend codebase

## Setup

1. Make sure you have installed all dependencies:

```bash
cd Athenic-Backend
npm install
```

## Testing Options

There are two ways to test the E2B Sandbox functionality:

1. **Local Testing Client**: A mock implementation that simulates the sandbox environment
2. **API Testing Client**: Tests the actual API implementation (requires Supabase Edge Functions to be running)

## Option 1: Local Testing Client

The local testing client simulates the sandbox environment without requiring any external services:

```bash
# Run the local test client
node tests/sandbox-test-client.js
```

This will launch an interactive CLI that allows you to:
- Execute shell commands (simulated)
- Execute browser actions (simulated)
- Execute file operations (simulated)
- View execution history

## Option 2: API Testing Client

The API client tests the actual implementation via the Supabase Edge Functions:

### Starting the Supabase Edge Functions

First, make sure your Supabase Edge Functions are running:

```bash
cd Athenic-Backend/supabase
supabase start
```

### Running the API Client

```bash
# Set environment variables (optional)
export ATHENIC_API_URL=http://localhost:54321/functions/v1/agent-orchestrator-api
export ATHENIC_ORG_ID=your-organization-id

# Run the API client
node tests/sandbox-api-client.js
```

This will launch an interactive CLI that allows you to:
- Execute shell commands via the API
- Execute browser actions via the API
- Execute file operations via the API
- Process natural language requests

## Testing Guide

Here are some examples of what you can test:

### Shell Commands

Try executing basic shell commands:
- `ls` - List files
- `echo "Hello, Athenic!"` - Print a message
- `cat /etc/passwd` - This should be blocked by the security policy

### Browser Actions

Test browser automation:
- Navigate to a URL (e.g., `https://example.com`)
- Click on an element (e.g., `#submit-button`)
- Type text into a form field (e.g., `.search-input`, `Athenic E2B test`)
- Extract data using JavaScript (e.g., `document.title`)

### File Operations

Test file system operations:
- Write a file (e.g., `/workspace/test.txt`, `This is a test file`)
- Read a file (e.g., `/workspace/test.txt`)
- List a directory (e.g., `/workspace`)
- Remove a file (e.g., `/workspace/test.txt`)

### Natural Language Requests

When using the API client, you can also test processing natural language requests:
- "Execute the command 'ls -la' in the sandbox"
- "Open a browser and navigate to example.com"
- "Create a file called test.txt with the content 'Hello World'"

## Security Features

The sandbox includes several security features:
- Allowlisted commands - Only approved commands can be executed
- Allowlisted hosts - Network access is restricted to specific domains
- Resource limits - Prevents abuse of CPU, memory, and execution time

## Troubleshooting

If you encounter issues:

1. **Local Testing Client**:
   - Make sure all dependencies are installed
   - Check if there are any TypeScript errors

2. **API Testing Client**:
   - Ensure Supabase Edge Functions are running
   - Check the correct API URL is set
   - Verify the organization ID is valid

## Next Steps

After testing the E2B Sandbox functionality, you may want to:

1. Extend the sandbox with additional capabilities
2. Integrate the sandbox with the agentic loop
3. Develop more tools that use the sandbox functionality

For any questions or issues, please contact the development team. 