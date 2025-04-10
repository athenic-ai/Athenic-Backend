/**
 * Agent Orchestrator API
 * 
 * This Supabase Edge Function provides an API interface for the Agent Orchestration Layer.
 * It handles user requests, initiates task execution, and returns results.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.5';
import { AgentOrchestrator } from '../orchestrator/index.ts';

// Environment variables for Supabase and AI model provider
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Define request body types
interface RequestBody {
  action: 'process-request' | 'start-job' | 'query-status';
  organizationId: string;
  payload: {
    request?: string;
    jobId?: string;
    options?: Record<string, any>;
  };
}

interface ResponseBody {
  success: boolean;
  data?: any;
  error?: string;
}

// Mock model provider for now
// In a real implementation, this would be an OpenAI or similar client
const modelProvider = {
  generateText: async (prompt: string) => {
    // Placeholder implementation
    return `Response to: ${prompt}`;
  },
  generateEmbedding: async (text: string) => {
    // Placeholder implementation
    return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
  }
};

// Serve HTTP requests
serve(async (req: Request) => {
  try {
    // Get request body
    const body: RequestBody = await req.json();
    
    // Validate request
    if (!body.action || !body.organizationId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: action, organizationId'
        } as ResponseBody),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Create agent orchestrator
    const orchestrator = new AgentOrchestrator(
      supabase as any,
      {
        modelProvider,
        organizationId: body.organizationId
      }
    );
    
    let result: any;
    
    // Process the action
    switch (body.action) {
      case 'process-request':
        if (!body.payload.request) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: payload.request'
            } as ResponseBody),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        
        result = await orchestrator.handleUserRequest(body.payload.request);
        break;
        
      case 'start-job':
        if (!body.payload.jobId) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: payload.jobId'
            } as ResponseBody),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        
        // Fetch the job from the database
        const { data: job, error: jobError } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', body.payload.jobId)
          .single();
        
        if (jobError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Error fetching job: ${jobError.message}`
            } as ResponseBody),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        
        // Start the job execution
        result = await orchestrator.startAgenticLoop([job]);
        break;
        
      case 'query-status':
        // This would query the status of an ongoing execution
        // For now, return a placeholder response
        result = {
          status: 'Placeholder status for future implementation'
        };
        break;
        
      default:
        return new Response(
          JSON.stringify({
            success: false,
            error: `Unknown action: ${body.action}`
          } as ResponseBody),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
    
    // Return successful response
    return new Response(
      JSON.stringify({
        success: true,
        data: result
      } as ResponseBody),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    // Handle unexpected errors
    console.error('Error processing request:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      } as ResponseBody),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}); 