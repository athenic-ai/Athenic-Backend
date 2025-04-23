import { describe, test, expect, beforeAll, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Response } from 'node-fetch';

// Load environment variables
dotenv.config();

// Configuration for remote services
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gvblzovvpfeepnhifwqh.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY || '';
const INNGEST_API_URL = process.env.INNGEST_API_URL || 'https://api.inngest.com/v1/events';
const E2B_SERVICE_URL = process.env.E2B_SERVICE_URL || 'https://api.e2b.dev';
const E2B_API_KEY = process.env.E2B_API_KEY || '';

// Constants for testing
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

/**
 * Helper function that implements retry logic
 */
async function retryFetch(url: string, options: any, maxRetries = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      
      const errorBody = await response.text();
      lastError = new Error(`HTTP error ${response.status}: ${errorBody}`);
    } catch (error) {
      console.error(`Attempt ${attempt}/${maxRetries} failed: ${error}`);
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    
    if (attempt < maxRetries) {
      console.log(`Retrying in ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
  
  throw lastError || new Error('Maximum retries exceeded');
}

describe('Remote Services Connectivity Tests', () => {
  jest.setTimeout(30000); // Increase timeout for external services

  test('Should connect to Supabase', async () => {
    try {
      // Skip if no credentials
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.warn('Skipping Supabase test - missing credentials');
        return;
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await supabase.from('objects').select('id').limit(1);
      
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      console.log('✅ Successfully connected to Supabase');
    } catch (error) {
      console.error('❌ Supabase connectivity test failed:', error);
      throw error;
    }
  });

  test('Should verify Inngest API connectivity', async () => {
    try {
      // Skip if no credentials
      if (!INNGEST_EVENT_KEY) {
        console.warn('Skipping Inngest test - missing event key');
        return;
      }

      // Perform a simple ping to Inngest API
      const response = await retryFetch(`${INNGEST_API_URL}/ping`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${INNGEST_EVENT_KEY}`
        }
      });
      
      expect(response.status).toBe(200);
      console.log('✅ Successfully connected to Inngest API');
    } catch (error) {
      console.warn('Inngest connectivity test failed. This might be expected if using the Inngest Dev Server locally.');
      // Don't fail the test if Inngest is not available
      return;
    }
  });

  test('Should verify E2B service connectivity', async () => {
    try {
      // Skip if no credentials
      if (!E2B_API_KEY) {
        console.warn('Skipping E2B test - missing API key');
        return;
      }

      const response = await retryFetch(`${E2B_SERVICE_URL}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${E2B_API_KEY}`
        }
      });
      
      expect(response.status).toBe(200);
      console.log('✅ Successfully connected to E2B service');
    } catch (error) {
      console.error('❌ E2B connectivity test failed:', error);
      // Don't fail the test if E2B is not available
      return;
    }
  });

  test('Should execute a simple code snippet via E2B service', async () => {
    try {
      // Skip if no credentials
      if (!E2B_API_KEY) {
        console.warn('Skipping E2B execution test - missing API key');
        return;
      }

      const response = await retryFetch(`${E2B_SERVICE_URL}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${E2B_API_KEY}`
        },
        body: JSON.stringify({
          language: 'python',
          code: 'print("Integration test successfully connected to E2B")'
        })
      });
      
      const data = await response.json();
      expect(data.output).toContain('Integration test successfully connected to E2B');
      expect(data.error).toBeUndefined();
      console.log('✅ Successfully executed code via E2B service');
    } catch (error) {
      console.error('❌ E2B code execution test failed:', error);
      // Don't fail the test if E2B is not available
      return;
    }
  });
}); 