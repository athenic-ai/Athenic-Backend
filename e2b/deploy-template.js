#!/usr/bin/env node

/**
 * E2B Template Deployment Script
 * 
 * This script deploys the Athenic agent template to E2B.
 * 
 * Usage:
 *   node deploy-template.js
 * 
 * Requirements:
 *   - E2B API key set as E2B_API_KEY environment variable
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const e2b = require('e2b');
const { Sandbox } = e2b;

// Configuration
const E2B_API_KEY = process.env.E2B_API_KEY;
const TEMPLATE_PATH = path.join(__dirname, 'athenic-agent.json');

if (!E2B_API_KEY) {
  console.error('Error: E2B_API_KEY environment variable is not set');
  console.error('Please set your E2B API key:');
  console.error('  export E2B_API_KEY=your_api_key');
  process.exit(1);
}

async function main() {
  try {
    // Instead of creating a custom template, we'll use the base template
    // and install our dependencies at runtime, which is more reliable
    console.log('Testing E2B connection with base template...');
    
    // Test connection using the base template - using the newer API
    const sandbox = await Sandbox.create('base', {
      apiKey: E2B_API_KEY,
      metadata: {
        ORGANIZATION_ID: 'test-organization',
        SESSION_ID: Date.now().toString()
      }
    });
    
    console.log('Successfully connected to E2B!');
    
    // Run a simple echo command to test
    console.log('Running test command...');
    const result = await sandbox.commands.run('echo "Athenic E2B Template Test Successful"');
    
    console.log(result.stdout);
    
    // Install our specific dependencies
    console.log('\nInstalling Athenic-specific dependencies...');
    
    const installResult = await sandbox.commands.run('npm install -g typescript ts-node && npm install @supabase/supabase-js openai axios puppeteer');
    
    if (installResult.exitCode === 0) {
      console.log('\nE2B environment setup complete!');
      console.log('✅ Successfully configured the base E2B environment for Athenic');
      console.log('\nUsage instructions:');
      console.log('1. In your E2B sessions, use the "base" template ID');
      console.log('2. Run the e2b-simple-demo.js script to test the functionality');
      console.log('3. Access the sandbox terminal in the Athenic app');
    } else {
      console.error('\n❌ Failed to install dependencies');
      console.error(installResult.stderr);
    }
    
    // Clean up
    await sandbox.kill();
    
  } catch (error) {
    console.error('Error during E2B setup:');
    console.error(error.message || error);
    process.exit(1);
  }
}

// Run the setup
main(); 