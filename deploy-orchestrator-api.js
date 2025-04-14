#!/usr/bin/env node

/**
 * Supabase Edge Function Deployment Script
 * 
 * This script deploys the agent-orchestrator-api edge function to Supabase.
 * 
 * Usage:
 *   node deploy-orchestrator-api.js
 * 
 * Requirements:
 *   - Supabase CLI installed
 *   - Logged in to Supabase CLI
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const EDGE_FUNCTION_PATH = path.join(__dirname, 'supabase', 'functions', 'agent-orchestrator-api');
const ENV_VARS = [
  'ATHENIC_API_KEY',
  'IS_DEVELOPMENT'
];

// Check if Supabase CLI is installed
try {
  execSync('supabase --version', { stdio: 'ignore' });
} catch (error) {
  console.error('Supabase CLI is not installed or not in PATH.');
  console.error('Please install it: https://supabase.com/docs/guides/cli');
  process.exit(1);
}

// Deploy the function
function deployFunction() {
  console.log('Deploying agent-orchestrator-api edge function...');
  
  try {
    // Ensure the function directory exists
    if (!fs.existsSync(EDGE_FUNCTION_PATH)) {
      console.error(`Error: Function directory not found: ${EDGE_FUNCTION_PATH}`);
      process.exit(1);
    }
    
    // Deploy the function
    const command = `supabase functions deploy agent-orchestrator-api --project-ref=${process.env.SUPABASE_PROJECT_REF || ''}`;
    console.log(`Running: ${command}`);
    execSync(command, { stdio: 'inherit' });
    
    console.log('\nEdge function deployed successfully!');
    
    // Set environment variables
    let missingVars = false;
    for (const envVar of ENV_VARS) {
      if (process.env[envVar]) {
        const secretCommand = `supabase secrets set ${envVar}=${process.env[envVar]} --project-ref=${process.env.SUPABASE_PROJECT_REF || ''}`;
        console.log(`Setting environment variable: ${envVar}`);
        execSync(secretCommand, { stdio: 'inherit' });
      } else {
        console.warn(`Warning: Environment variable ${envVar} is not set`);
        missingVars = true;
      }
    }
    
    if (missingVars) {
      console.warn('\nSome environment variables are not set. You can set them manually:');
      console.warn('supabase secrets set VARIABLE=value');
    }
    
    console.log('\nDeployment complete!');
    console.log('You can test the function with the sandbox-api-client.js script:');
    console.log('node tests/sandbox-api-client.js');
  } catch (error) {
    console.error('Error deploying function:');
    console.error(error.message);
    process.exit(1);
  }
}

// Execute deployment
deployFunction(); 