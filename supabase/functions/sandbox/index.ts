/// <reference types="https://deno.land/x/deno/cli/types/runtime.d.ts" />
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.14.0";
// Try importing startSession directly
import { startSession } from "https://esm.sh/e2b@1.2.5"; 
// Assuming temp_deploy is sibling to Athenic-Backend
// --- REMOVED TYPE IMPORT FOR NOW TO AVOID LINTER ISSUES ---
// import { E2BTypes } from "../Athenic-Backend/tmp-backup/agents/sandboxEnvironment/types.ts"; 

console.log("Imports loaded...");

// Add debugging to help diagnose deployment issues
console.log("Starting Athenic Sandbox Edge Function with DB session persistence and API fixes...");

// Configure CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Set a timeout for inactive sessions (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Handle CORS preflight requests
function handleCors(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
}

// Helper to get Supabase client (Only needed if other parts of the function use it, not for session logic)
function getSupabaseClient(req: Request): SupabaseClient | null {
  try {
    return createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { 
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
        auth: { persistSession: false } 
      }
    );
  } catch (error) {
    console.error("Failed to create Supabase client:", error);
    return null;
  }
}

// Handle running a command in the sandbox
async function handleRunCommand(req: Request) {
  try {
    console.log("=== SANDBOX COMMAND EXECUTION STARTED ===");
    const e2bApiKey = Deno.env.get('E2B_API_KEY');
    console.log(`E2B API Key configured: ${!!e2bApiKey}`);
    
    if (!e2bApiKey) {
      console.log("E2B API key is not configured!");
      return new Response(
        JSON.stringify({ 
          error: 'E2B_API_KEY not configured',
          details: 'Please set the E2B_API_KEY environment variable' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { command, sessionId, organizationId, templateId = 'base' } = await req.json();
    const sessionIdToUse = sessionId || null; 
    
    console.log(`Running command '${command}' for session ID ${sessionIdToUse || '(new)'} and org ${organizationId}`);
    
    if (!command) {
      console.log("Command is missing in request!");
      return new Response(
        JSON.stringify({ error: 'Command is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Connect or create E2B sandbox using imported startSession function
    console.log(`Attempting to start/connect to E2B session via startSession() with ID: ${sessionIdToUse}`);
    
    let sandbox: any; 
    let isExistingSession = false;

    try {
        isExistingSession = !!sessionIdToUse; 
        
        // Use imported startSession explicitly
        sandbox = await startSession({ // TRYING top-level startSession
            id: sessionIdToUse, 
            apiKey: e2bApiKey,
            template: templateId, 
            onScan: (scan: any) => { 
              console.log(`[E2B Session Scan] ${sessionIdToUse || 'New Session'}: ${scan.status}`);
            }
        });

        // Check if sandbox object and id are valid
        if (!sandbox || typeof sandbox.id === 'undefined' || sandbox.id === null) {
             console.error('CRITICAL: Failed to get valid sandbox object or ID from startSession()');
             console.error(`Received sandbox object keys: ${sandbox ? Object.keys(sandbox).join(', ') : 'null'}`);
             throw new Error('Failed to initialize a valid sandbox session with an ID.');
        }

        console.log(`Successfully obtained E2B sandbox object. ID: ${sandbox.id}`);

        // Verify the ID we got matches what we intended if reconnecting
        if (sessionIdToUse && sandbox.id !== sessionIdToUse) {
             console.warn(`Requested session ${sessionIdToUse}, but got ${sandbox.id}. A new session might have been created.`);
             isExistingSession = false; 
        } else if (sessionIdToUse && sandbox.id === sessionIdToUse) {
             console.log(`Confirmed connection to existing session: ${sandbox.id}`);
          isExistingSession = true;
        }
        
        // Check if the crucial sandbox.process property exists
        if (!sandbox.process?.start) {
             console.error('CRITICAL: Sandbox object is missing the process.start method!');
             console.error(`Sandbox properties: ${Object.keys(sandbox).join(', ')}`);
             throw new Error('Sandbox object lacks required process.start method.');
        }
        
    } catch (error) {
        console.error(`Failed to start or connect to E2B session ${sessionIdToUse || '(new)'}:`, error);
        const errPayload = { 
            error: 'Failed to initialize sandbox session', 
            details: error.message, 
            sessionId: sessionIdToUse 
        };
        console.log(`Returning init error payload: ${JSON.stringify(errPayload)}`);
        return new Response(JSON.stringify(errPayload), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    // Execute the command using sandbox.process.start (NO FALLBACKS)
    try {
              let stdout = '';
              let stderr = '';
      let exitCode = -1;

      console.log(`Executing command via sandbox.process.start: ${command}`);
      
      // Ensure sandbox.process.start exists (Checked during creation, should be safe)
      if (!sandbox.process?.start) {
          // This case should ideally not be reached due to checks above
          throw new Error('Internal Error: sandbox.process.start not available despite checks.');
      }

      // Use sandbox.process.start
      const proc = await sandbox.process.start({
          cmd: command,
          onStdout: (data: string) => { stdout += data; console.log(`[stdout] ${data}`); },
          onStderr: (data: string) => { stderr += data; console.error(`[stderr] ${data}`); },
      });
      exitCode = await proc.wait();
      console.log(`Command finished with exit code: ${exitCode}`);

      // Construct the response payload
      const responsePayload = {
          success: exitCode === 0,
          stdout: stdout,
          stderr: stderr,
          exitCode: exitCode,
          sessionId: sandbox.id, // Use the actual ID from the active sandbox object
          isExistingSession: isExistingSession, 
      };
      
      console.log(`Returning response payload: ${JSON.stringify(responsePayload)}`);

          return new Response(
        JSON.stringify(responsePayload),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
    } catch (error) {
      console.error(`Error executing command in sandbox ${sandbox?.id || sessionIdToUse}:`, error);
      const errorPayload = { 
          error: 'Failed to execute command in sandbox', 
          details: error.message,
          sessionId: sandbox?.id || sessionIdToUse, // Return ID if possible
      };
      console.log(`Returning error payload: ${JSON.stringify(errorPayload)}`);
      return new Response(
        JSON.stringify(errorPayload),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } finally {
      console.log(`Command handling complete for session ${sandbox?.id}. Sandbox NOT closed.`);
    }
  } catch (error) {
    // Outer catch block
    console.error('Unhandled error in handleRunCommand:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Main Deno serve function
serve(async (req: Request) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  
  // Debug log request details at a high level
  console.log(`Request: ${req.method} ${new URL(req.url).pathname}`);
  
  const url = new URL(req.url);
  
  // Route the request to the appropriate handler
  if (req.method === 'POST' && (url.pathname.endsWith('/run') || url.pathname.endsWith('/sandbox/run'))) {
    return handleRunCommand(req);
  } else {
    return new Response(
      JSON.stringify({ error: 'Not Found', path: url.pathname }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

console.log(`Athenic Sandbox Edge Function (persistent) started...`);
