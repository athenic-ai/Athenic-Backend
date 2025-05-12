import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { logger } from './logger.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Create a lazy initialization function instead of exiting immediately
let supabaseClient = null;

export const getSupabaseClient = () => {
  if (supabaseClient) return supabaseClient;
  
  if (!supabaseUrl || !supabaseKey) {
    logger.warn('Missing SUPABASE_URL or SUPABASE_KEY environment variables. Supabase features will not work.');
    // Return a mock client or throw an error when a method is called
    return {
      from: () => {
        throw new Error('Supabase client not initialized due to missing environment variables');
      },
      // Add other methods as needed
    };
  }
  
  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
};

// For backward compatibility with existing imports
export const supabase = new Proxy({}, {
  get: (target, prop) => {
    const client = getSupabaseClient();
    return client[prop];
  }
});

export default supabase; 