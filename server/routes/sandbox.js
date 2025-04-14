/**
 * E2B Sandbox API Routes
 * 
 * These routes provide an API for running commands in the E2B sandbox environment.
 */

const express = require('express');
const e2b = require('e2b');
const { Sandbox } = e2b;
const router = express.Router();

// Validate API key middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  
  // In production, this should check against a secure store
  if (!apiKey || apiKey !== process.env.ATHENIC_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

/**
 * Run a command in the E2B sandbox
 * 
 * POST /api/sandbox/run
 * 
 * Request body:
 * {
 *   "command": "ls -la",
 *   "envVars": {}          // Optional environment variables
 * }
 */
router.post('/run', validateApiKey, async (req, res) => {
  const { command } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }
  
  let sandbox = null;
  
  try {
    // Check for E2B_API_KEY
    if (!process.env.E2B_API_KEY) {
      return res.status(500).json({ 
        error: 'E2B_API_KEY not configured',
        details: 'Please set the E2B_API_KEY environment variable'
      });
    }
    
    // Create E2B sandbox
    sandbox = await Sandbox.create('base', {
      apiKey: process.env.E2B_API_KEY,
      metadata: {
        ORGANIZATION_ID: req.body.organizationId || 'default',
        SESSION_ID: req.body.sessionId || Date.now().toString()
      }
    });
    
    // Run the command
    const result = await sandbox.commands.run(command);
    
    // Return the result
    res.json({
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    });
  } catch (error) {
    console.error('E2B error:', error.message);
    
    res.status(500).json({
      error: 'Failed to execute command',
      details: error.message
    });
  } finally {
    // Clean up session
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch (error) {
        console.error('Failed to close sandbox:', error.message);
      }
    }
  }
});

/**
 * Get sandbox status and information
 * 
 * GET /api/sandbox/status
 */
router.get('/status', validateApiKey, async (req, res) => {
  try {
    // In a real implementation, you might check the E2B service status
    // or return information about active sessions
    
    res.json({
      status: 'operational',
      apiKeyConfigured: !!process.env.E2B_API_KEY,
      version: '0.1.0'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get sandbox status',
      details: error.message
    });
  }
});

module.exports = router; 