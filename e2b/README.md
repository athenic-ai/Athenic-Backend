# Athenic E2B Sandbox Integration

This directory contains the configuration and deployment files for setting up the Athenic agent sandbox environment using E2B.

## What is E2B?

E2B (Execution Environment for Bots) provides secure, isolated environments for AI agents to run code and interact with the web. It's used in Athenic to:

- Run agent operations in isolated sandbox environments
- Execute terminal commands securely
- Interact with web browsers
- Access file systems in a controlled manner

## Setup

To use the E2B sandbox functionality, you need to:

1. Sign up for an E2B account at [e2b.dev](https://e2b.dev)
2. Get your API key from the E2B dashboard
3. Set up your environment variables (see below)
4. Deploy the Athenic agent template to your E2B account

### Environment Variables

To run the sandbox, you'll need to set the following environment variables:

```bash
# Set your E2B API key (required)
export E2B_API_KEY=your_api_key_here

# Optional variables
export ATHENIC_API_KEY=your_athenic_api_key  # Required for production
```

You can use our setup script to configure the environment:

```bash
# Run the setup script
source ./scripts/setup-e2b-env.sh
```

### Deploying the Template

To deploy the template:

```bash
# Make sure your E2B_API_KEY is set
cd ~/Documents/Beech/Development/Athenic/Athenic-Backend
node e2b/deploy-template.js
```

After deployment, the template ID will be displayed. Make note of this ID.

## Testing

You can test the sandbox using our test scripts:

```bash
# Simple demonstration
node tests/e2b-simple-demo.js

# Interactive client for more complex testing
node tests/e2b-standalone-client.js
```

## Integration with Athenic

The E2B integration is used in Athenic to:

1. Run agent operations securely
2. Execute terminal commands
3. Automate web browsing
4. Manage files
5. Interact with APIs

### Example Usage

Here's a simple example of how to use E2B in your code:

```javascript
const { Session } = require('e2b');

async function runCommand(cmd) {
  const session = new Session({
    id: 'athenic-agent',  // Use the template name
    apiKey: process.env.E2B_API_KEY,
    envVars: {
      ORGANIZATION_ID: 'your-org-id',
      SESSION_ID: 'your-session-id'
    }
  });
  
  await session.open();
  
  const process = await session.process.start({
    cmd: cmd,
    onStdout: console.log,
    onStderr: console.error
  });
  
  const exitCode = await process.wait();
  await session.close();
  
  return exitCode;
}
```

## Troubleshooting

Common issues:

1. **"Template not found" error**: 
   - Make sure you've deployed the template with `node e2b/deploy-template.js`
   - Check that you're using the correct template name ('athenic-agent' or 'base')

2. **"API key invalid" error**: 
   - Verify your E2B API key is correctly set with `echo $E2B_API_KEY`
   - Try regenerating your API key in the E2B dashboard

3. **"Failed to create E2B session" error**: 
   - Check your network connection
   - Verify the E2B service is available 
   - Make sure your account has sufficient credits

4. **"Resource limit exceeded" error**:
   - Reduce the CPU/memory requirements in your configuration
   - Upgrade your E2B plan if necessary

## Adding Custom Capabilities

To add custom capabilities to the sandbox environment:

1. Modify the `athenic-agent.json` template configuration
2. Update the setup commands to install additional dependencies
3. Re-deploy the template with `node e2b/deploy-template.js`

## API Reference

For more details on the E2B API, see the [official E2B documentation](https://e2b.dev/docs). 