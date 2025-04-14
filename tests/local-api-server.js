/**
 * Local API Server for E2B Sandbox Environment Testing
 * 
 * This server provides a local endpoint for testing the E2B Sandbox
 * environment without needing to deploy to Supabase Edge Functions.
 */

// Load environment variables from .env
require('dotenv').config();

// Environment variables
const port = process.env.PORT || 3333;
const API_KEY = process.env.E2B_API_KEY;

// Required modules
const express = require('express');
const cors = require('cors');
const { Sandbox } = require('e2b');

// Create Express application
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Polyfill for Object.hasOwn for older Node.js versions
const hasOwn = (obj, key) => {
  return Object.prototype.hasOwnProperty.call(obj, key);
};

// Sandbox session cache
const sandboxSessions = new Map();

// Check if E2B API key is available
if (!API_KEY) {
  console.warn('\n⚠️ WARNING: E2B_API_KEY environment variable is not set');
  console.warn('The server will not be able to create sandbox environments');
  console.warn('Set your API key with: export E2B_API_KEY=your_key\n');
}

// Format API key for display
const formatApiKey = (key) => {
  if (!key) return 'Not set ⚠️';
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)} ✅`;
};

// Get or create a sandbox session for an organization
async function getOrCreateSandboxSession(organizationId) {
  // Check if we already have a session for this organization
  if (sandboxSessions.has(organizationId)) {
    return sandboxSessions.get(organizationId);
  }
  
  // Validate API key
  const apiKey = API_KEY;
  if (!apiKey) {
    throw new Error('E2B_API_KEY environment variable is not set');
  }
  
  // Create a new sandbox session
  console.log(`Creating new sandbox session for organization: ${organizationId}`);
  
  try {
    const sandbox = new Sandbox({
      apiKey,
      // Optional configuration
      // template: 'base',
      // metadata: { organizationId }
    });
    
    await sandbox.start();
    console.log(`Sandbox session started successfully for ${organizationId}`);
    
    // Store the session for future use
    sandboxSessions.set(organizationId, sandbox);
    return sandbox;
  } catch (error) {
    // Specific handling for API key errors
    if (error.message.includes('Invalid API key') || error.message.includes('authentication')) {
      console.error('❌ E2B authentication failed. Check your API key.');
      throw new Error('Invalid E2B API key. Please check your configuration.');
    }
    console.error(`❌ Failed to create sandbox session: ${error.message}`);
    throw error;
  }
}

// Main API handler
app.post('/api', async (req, res) => {
  try {
    // Extract request data
    const { action, organizationId, payload } = req.body;
    
    // Validate request
    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: action'
      });
    }
    
    // Get organization ID (default to 'test-organization' if not provided)
    const orgId = organizationId || 'test-organization';
    
    // Log request
    console.log(`\n🔹 API Request: ${action} for organization ${orgId}`);
    
    // Handle different actions
    switch (action) {
      case 'execute-sandbox-command': {
        // Execute shell command
        if (hasOwn(payload, 'command')) {
          const sandbox = await getOrCreateSandboxSession(orgId);
          const { exitCode, stdout, stderr } = await sandbox.process.start({
            cmd: payload.command,
          });
          
          console.log(`Command executed with exit code: ${exitCode}`);
          return res.json({
            success: true,
            data: { exitCode, stdout, stderr }
          });
        }
        
        // Browser actions
        if (hasOwn(payload, 'browserAction')) {
          const sandbox = await getOrCreateSandboxSession(orgId);
          
          if (!sandbox.browser) {
            await sandbox.browser.start();
          }
          
          const params = payload.parameters || {};
          let result;
          
          switch (payload.browserAction) {
            case 'navigate':
              await sandbox.browser.goto(params.url);
              result = { message: `Navigated to ${params.url}` };
              break;
              
            case 'click':
              await sandbox.browser.click(params.selector);
              result = { message: `Clicked element ${params.selector}` };
              break;
              
            case 'type':
              await sandbox.browser.type(params.selector, params.text);
              result = { message: `Typed "${params.text}" into ${params.selector}` };
              break;
              
            case 'extract':
              const data = await sandbox.browser.evaluate(params.script);
              result = { data };
              break;
              
            default:
              return res.status(400).json({
                success: false,
                error: `Unknown browser action: ${payload.browserAction}`
              });
          }
          
          return res.json({
            success: true,
            data: result
          });
        }
        
        // File operations
        if (hasOwn(payload, 'fileAction')) {
          const sandbox = await getOrCreateSandboxSession(orgId);
          const params = payload.parameters || {};
          let result;
          
          switch (payload.fileAction) {
            case 'write':
              await sandbox.filesystem.write(params.path, params.content);
              result = { message: `File written to ${params.path}` };
              break;
              
            case 'read':
              const content = await sandbox.filesystem.read(params.path);
              result = { content };
              break;
              
            case 'list':
              const files = await sandbox.filesystem.list(params.path);
              result = { files };
              break;
              
            case 'remove':
              await sandbox.filesystem.remove(params.path);
              result = { message: `Removed ${params.path}` };
              break;
              
            default:
              return res.status(400).json({
                success: false,
                error: `Unknown file action: ${payload.fileAction}`
              });
          }
          
          return res.json({
            success: true,
            data: result
          });
        }
        
        return res.status(400).json({
          success: false,
          error: 'Invalid payload for execute-sandbox-command'
        });
      }
      
      case 'process-request': {
        // Handle natural language processing
        if (!hasOwn(payload, 'request')) {
          return res.status(400).json({
            success: false,
            error: 'Missing request parameter'
          });
        }
        
        // In a real implementation, this would call your agent to process the request
        console.log(`Processing request: ${payload.request}`);
        
        return res.json({
          success: true,
          data: {
            message: `Processed request: ${payload.request}`,
            status: 'COMPLETED',
            result: {
              response: 'This is a mock response from the agent',
              actions: ['Action 1', 'Action 2']
            }
          }
        });
      }
      
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`
        });
    }
  } catch (error) {
    console.error(`❌ API Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/sandbox/read', (req, res) => {
  try {
    // Validate required fields
    const { sessionId, remotePath } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing required field: sessionId' });
    }
    if (!remotePath) {
      return res.status(400).json({ error: 'Missing required field: remotePath' });
    }

    // Check if session exists
    if (!sandboxSessions.has(sessionId)) {
      return res.status(404).json({
        error: 'Session not found',
        sessionId
      });
    }
    
    // Mock file reading functionality
    console.log(`Reading file from path: ${remotePath}`);
    return res.json({
      success: true,
      data: {
        content: `Mock file content for ${remotePath}`
      }
    });
  } catch (error) {
    console.error(`❌ API Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`\n🚀 E2B Sandbox API Server running at http://localhost:${port}/api`);
  console.log(`E2B API Key: ${formatApiKey(API_KEY)}`);
});