// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.5";
// Import e2b differently for Deno compatibility
import { startSession } from "https://esm.sh/e2b@0.12.0";

// Environment variables for Supabase
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// For testing/development - in production this should be a secure API key
const apiKey = Deno.env.get('ATHENIC_API_KEY') || 'test-api-key-for-development';
// For local development always enable development mode
const isDevelopment = true;

// Store active E2B sessions
const sandboxSessions = new Map();

// Default security policy for the sandbox
const defaultSecurityPolicy = {
  allowedHosts: [
    'api.openai.com',
    'api.shopify.com',
    'supabase.co',
    'githubusercontent.com',
    'npmjs.org'
  ],
  allowedCommands: [
    'node',
    'npm',
    'npx',
    'curl',
    'wget',
    'git clone',
    'git checkout',
    'ls',
    'cat',
    'grep',
    'find',
    'echo',
    'mkdir',
    'cp',
    'mv'
  ],
  resourceLimits: {
    cpuLimit: 2,
    memoryMB: 2048,
    timeoutSec: 300
  }
};

// Handle HTTP requests
serve(async (req) => {
  try {
    // Handle preflight CORS requests
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
        }
      });
    }

    // Only handle POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Only POST method is allowed' 
      }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Skip authentication in development mode
    // For production, uncomment this and set isDevelopment to false
    /*
    if (!isDevelopment) {
      // In production, require proper authentication
      const providedApiKey = req.headers.get('X-API-Key') || req.headers.get('Authorization');
      
      if (!providedApiKey || providedApiKey !== apiKey) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Unauthorized access',
          msg: 'Error: Missing or invalid API key'
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }
    */

    // Parse request body
    const requestData = await req.json();
    const { action, organizationId, payload } = requestData;

    // Validate request data
    if (!action || !organizationId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: action, organizationId'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Process different actions
    let result;
    
    switch (action) {
      case 'process-request':
        if (!payload.request) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Missing required field: payload.request'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        // Process natural language request
        result = await processRequest(supabase, payload.request, organizationId);
        break;
        
      case 'execute-sandbox-command':
        // Execute command in sandbox
        result = await executeSandboxCommand(supabase, organizationId, payload);
        break;
        
      case 'start-job':
        if (!payload.jobId) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Missing required field: payload.jobId'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        // Fetch job details from database
        const { data: job, error: jobError } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', payload.jobId)
          .single();
        
        if (jobError) {
          return new Response(JSON.stringify({
            success: false,
            error: `Error fetching job: ${jobError.message}`
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        // Start job execution
        result = { status: 'Job started', jobId: job.id };
        break;
        
      case 'query-status':
        // Query execution status
        result = { status: 'Execution in progress' };
        break;
        
      default:
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
    }
    
    // Return successful response
    return new Response(JSON.stringify({
      success: true,
      data: result
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    // Handle errors
    console.error('Error processing request:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
});

// Process natural language request
async function processRequest(supabase, request, organizationId) {
  console.log(`Processing request: ${request} for org: ${organizationId}`);
  
  // Initialize a real E2B session for processing
  try {
    // Get or create sandbox session
    const sessionManager = await getOrCreateSandboxSession(supabase, organizationId);
    
    // Execute a command to process the request
    const result = await sessionManager.session.process.run({
      cmd: `echo "Processing request: ${request}" && node -e "console.log('Request processed successfully')"`,
      onStdout: (data) => console.log(`[${organizationId}] stdout:`, data),
      onStderr: (data) => console.log(`[${organizationId}] stderr:`, data)
    });
    
    return {
      response: `Processing successful: ${request}`,
      type: 'processed',
      details: result
    };
  } catch (e) {
    console.error("Error processing request with E2B:", e);
    // Fallback to demo mode response
    return {
      response: `I received your request: "${request}". I'm currently running in demo mode with limited capabilities.`,
      type: 'general'
    };
  }
}

// Execute commands in the sandbox
async function executeSandboxCommand(supabase, organizationId, payload) {
  try {
    // Get or create sandbox session
    const sessionManager = await getOrCreateSandboxSession(supabase, organizationId);
    
    // Execute the appropriate command
    if (payload.command) {
      // Execute shell command
      console.log(`Executing command: ${payload.command}`);
      
      // Clear output buffers before executing new command
      sessionManager.clearOutput();
      
      // Use process.start for better command handling including cd and other shell commands
      const process = await sessionManager.session.process.start({
        cmd: payload.command,
        onStdout: (data) => {
          console.log(`[${organizationId}] stdout:`, data);
          sessionManager.output += data;
        },
        onStderr: (data) => {
          console.log(`[${organizationId}] stderr:`, data);
          sessionManager.error += data;
        }
      });
      
      const exitCode = await process.wait();
      
      // For cd commands, we need to verify the directory change worked
      if (payload.command.trim().startsWith('cd ') && exitCode === 0) {
        // Run pwd to confirm new working directory
        const pwdProcess = await sessionManager.session.process.start({
          cmd: 'pwd',
          onStdout: (data) => {
            console.log(`[${organizationId}] current dir:`, data.trim());
          },
          onStderr: () => {}
        });
        await pwdProcess.wait();
      }
      
      return {
        success: exitCode === 0,
        output: sessionManager.output,
        error: sessionManager.error,
        exitCode
      };
    } else if (payload.browserAction) {
      // Execute browser action
      console.log(`Executing browser action: ${payload.browserAction}`);
      
      let result;
      
      // Initialize browser if it doesn't exist
      if (!sessionManager.browser) {
        console.log("Initializing browser...");
        sessionManager.browser = await sessionManager.session.browser.launch();
      }
      
      switch (payload.browserAction) {
        case 'navigate':
          result = await sessionManager.session.browser.goto(payload.parameters.url);
          break;
          
        case 'click':
          result = await sessionManager.session.browser.click(payload.parameters.selector);
          break;
          
        case 'type':
          result = await sessionManager.session.browser.type(
            payload.parameters.selector, 
            payload.parameters.text
          );
          break;
          
        case 'extract':
          result = await sessionManager.session.browser.evaluate(payload.parameters.script);
          break;
          
        default:
          throw new Error(`Unsupported browser action: ${payload.browserAction}`);
      }
      
      return {
        success: true,
        result
      };
    } else if (payload.fileAction) {
      // Execute file operation
      console.log(`Executing file operation: ${payload.fileAction}`);
      
      let result;
      switch (payload.fileAction) {
        case 'write':
          await sessionManager.session.filesystem.write(
            payload.parameters.path, 
            payload.parameters.content
          );
          
          result = {
            success: true,
            path: payload.parameters.path,
            message: "File written successfully",
            bytes: payload.parameters.content.length
          };
          break;
          
        case 'read':
          const content = await sessionManager.session.filesystem.read(payload.parameters.path);
          
          result = {
            content,
            path: payload.parameters.path,
            size: content.length
          };
          break;
          
        case 'list':
          const files = await sessionManager.session.filesystem.list(payload.parameters.path);
          
          result = {
            files,
            path: payload.parameters.path,
            count: files.length
          };
          break;
          
        case 'remove':
          await sessionManager.session.filesystem.remove(payload.parameters.path);
          
          result = {
            success: true,
            path: payload.parameters.path,
            message: "File removed successfully"
          };
          break;
          
        default:
          throw new Error(`Unsupported file operation: ${payload.fileAction}`);
      }
      
      return {
        success: true,
        result
      };
    } else {
      throw new Error('No command, browser action, or file operation specified');
    }
  } catch (error) {
    console.error(`Error executing sandbox command: ${error}`);
    return {
      success: false,
      error: error.message || String(error),
      stack: error.stack || "No stack trace available"
    };
  }
}

// Helper function to get or create a sandbox session
async function getOrCreateSandboxSession(supabase, organizationId) {
  // Check if a session already exists
  let sessionManager = sandboxSessions.get(organizationId);
  
  if (!sessionManager || !sessionManager.session) {
    console.log(`Creating new E2B sandbox for organization: ${organizationId}`);
    
    try {
      // Create a new E2B session
      const session = await startSession({
        template: 'athenic-agent', // Use a custom template
        envVars: {
          ORGANIZATION_ID: organizationId,
          SESSION_ID: crypto.randomUUID()
        }
      });
      
      // Store session with additional metadata
      sessionManager = {
        id: session.id,
        created: new Date(),
        session: session,
        browser: null,
        output: "",
        error: "",
        // Capture output buffers
        clearOutput: () => {
          sessionManager.output = "";
          sessionManager.error = "";
        }
      };
      
      // Store in session map
      sandboxSessions.set(organizationId, sessionManager);
      
      // Log creation in Supabase
      try {
        await supabase.from('objects').insert({
          related_object_type_id: 'agent_execution',
          owner_organisation_id: organizationId,
          metadata: {
            title: `E2B Sandbox session created`,
            created_at: new Date().toISOString(),
            execution_id: session.id,
            context: {
              operation: 'session_created',
              sessionId: session.id
            },
            status: 'active'
          }
        });
      } catch (logError) {
        console.error('Failed to log sandbox creation:', logError);
      }
      
      console.log(`Created E2B sandbox with ID: ${session.id}`);
    } catch (error) {
      console.error(`Failed to create E2B session: ${error}`);
      throw new Error(`Failed to initialize E2B sandbox: ${error.message}`);
    }
  }
  
  // Clear output buffers before each command
  sessionManager.clearOutput();
  
  return sessionManager;
} 