import { jest } from '@jest/globals';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Set longer timeout for all tests since we're dealing with external services
jest.setTimeout(30000);

// Make sure required environment variables exist
if (!process.env.E2B_API_KEY) {
  console.warn('\n⚠️ WARNING: E2B_API_KEY not found in environment. Some tests will be skipped.\n');
}

if (!process.env.E2B_SERVICE_URL) {
  // Default to production URL if not specified
  process.env.E2B_SERVICE_URL = 'https://api.e2b.dev';
  console.log(`Using default E2B service URL: ${process.env.E2B_SERVICE_URL}`);
}

// If we're in CI, we'll handle environment differently
if (process.env.CI) {
  console.log('Running in CI environment');
} 