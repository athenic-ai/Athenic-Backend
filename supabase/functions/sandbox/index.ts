// This function is public and bypasses JWT verification
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.14.0';

// Add debugging to help diagnose deployment issues
console.log("Starting Athenic Sandbox Edge Function with session persistence...");

// Define CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// Handle CORS preflight requests
function handleCors(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }
  return null;
}

/**
 * Imports and validates the E2B module
 * This helps diagnose issues with the module structure
 */
async function importE2B() {
  try {
    // Import the module from a specific version to ensure compatibility
    const e2bModule = await import('https://esm.sh/e2b@1.2.5');
    
    // Log the module structure to diagnose issues
    console.log("E2B module keys:", Object.keys(e2bModule));
    
    // Check if the module has a default export we should use instead
    if (e2bModule.default) {
      console.log("E2B module has default export, using that instead");
      const defaultExport = e2bModule.default;
      
      // Check if the default export has the Sandbox property
      if (defaultExport.Sandbox && typeof defaultExport.Sandbox.create === 'function') {
        console.log("Using default export which has valid Sandbox.create function");
        return defaultExport;
      }
      
      console.log("Default export properties:", Object.keys(defaultExport));
    }
    
    // Check if the module has the 'Sandbox' property
    if (!e2bModule.Sandbox) {
      console.error("E2B module structure error: 'Sandbox' property missing");
      console.log("Available module properties:", Object.keys(e2bModule));
      
      // Try to extract a valid interface from the module
      const possibleSandboxExports = Object.entries(e2bModule)
        .filter(([_, value]) => {
          return value && 
            typeof value === 'object' && 
            'create' in value && 
            typeof value.create === 'function';
        });
      
      if (possibleSandboxExports.length > 0) {
        console.log("Found potential Sandbox alternative:", possibleSandboxExports[0][0]);
        
        // Create a compatible interface
        return {
          Sandbox: possibleSandboxExports[0][1]
        };
      }
      
      throw new Error("E2B module missing 'Sandbox' property and no alternative found");
    }
    
    // Check if the Sandbox has the create method
    if (typeof e2bModule.Sandbox.create !== 'function') {
      console.error("E2B module structure error: 'Sandbox.create' method missing");
      console.log("Sandbox properties:", Object.keys(e2bModule.Sandbox));
      throw new Error("E2B module missing 'Sandbox.create' method");
    }
    
    return e2bModule;
  } catch (error) {
    console.error("Failed to import E2B module:", error);
    throw error;
  }
}

// Get Supabase client for database access
function getSupabaseClient(req: Request) {
  try {
    // Extract JWT from auth header
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    const supabaseURL = Deno.env.get('SUPABASE_URL') || 'https://gvblzovvpfeepnhifwqh.supabase.co';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY') || '';
    
    return createClient(supabaseURL, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
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
    
    // Parse the request body
    const { command, sessionId, organizationId, templateId = 'base', e2bSessionId = null } = await req.json();
    const sessionIdToUse = sessionId || `session-${Date.now()}`;
    
    console.log(`Running command '${command}' for session ${sessionIdToUse} and org ${organizationId}`);
    console.log(`Client provided e2bSessionId: ${e2bSessionId}`);
    
    if (!command) {
      console.log("Command is missing in request!");
      return new Response(
        JSON.stringify({ error: 'Command is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get Supabase client for database operations
    const supabase = getSupabaseClient(req);
    if (!supabase) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create Supabase client for database operations',
          details: 'Verify your Supabase credentials and JWT token.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Create a consistent session key
    const sessionKey = `${organizationId || 'default'}-${sessionIdToUse}`;
    
    // Get stored working directory from database if it exists
    let workingDirectory = '/home/sandbox';
    let existingE2bSessionId = e2bSessionId; // Use client-provided e2bSessionId if available
    let isExistingSession = !!existingE2bSessionId; // If client provided e2bSessionId, it's an existing session
    let sessionData = null;
    
    try {
      console.log(`Looking for existing session for session key: ${sessionKey}`);
      const { data: existingSession, error: sessionError } = await supabase
        .from('sandbox_sessions')
        .select('*')
        .eq('session_key', sessionKey)
        .single();
      
      if (!sessionError && existingSession) {
        console.log(`Found existing session: ${JSON.stringify(existingSession)}`);
        sessionData = existingSession;
        
        if (existingSession.working_directory) {
          console.log(`Using existing working directory: ${existingSession.working_directory}`);
          workingDirectory = existingSession.working_directory;
        }
        
        // If client didn't provide e2bSessionId, use the one from the database
        if (!existingE2bSessionId && existingSession.e2b_session_id) {
          console.log(`Found existing E2B session ID in database: ${existingSession.e2b_session_id}`);
          existingE2bSessionId = existingSession.e2b_session_id;
          isExistingSession = true;
        }
        
        if (existingSession.paused_session_id) {
          console.log(`Found paused session ID: ${existingSession.paused_session_id}`);
        }
      }
    } catch (error) {
      console.log(`Error checking session: ${error instanceof Error ? error.message : String(error)}`);
      // Continue with default working directory
    }
    
    // Create the sandbox
    let sandbox;
    try {
      const e2b = await importE2B();
      
      console.log("Creating sandbox with apiKey:", !!e2bApiKey);
      
      // First, validate that e2b.Sandbox.create exists
      if (!e2b.Sandbox || typeof e2b.Sandbox.create !== 'function') {
        throw new Error(`Invalid E2B module structure: ${JSON.stringify({
          hasSandbox: !!e2b.Sandbox,
          createIsFunction: typeof e2b.Sandbox?.create === 'function'
        })}`);
      }
      
      // Try to reconnect to existing session if available
      if (isExistingSession && existingE2bSessionId) {
        try {
          console.log(`Attempting to reconnect to existing session: ${existingE2bSessionId}`);
          
          // Simplify reconnection based on E2B documentation
          // E2B docs recommend reusing the same ID via create() for persistence
          try {
            console.log(`Creating sandbox with existing ID: ${existingE2bSessionId}`);
            sandbox = await e2b.Sandbox.create({
              apiKey: e2bApiKey,
              id: existingE2bSessionId,
              template: templateId || 'base',
              // These options are critical for persistence
              keepAlive: true,
              persistent: true
            });
            console.log("Successfully reconnected to existing sandbox session");
            isExistingSession = true;
          } catch (reconnectError) {
            console.log(`Failed to reconnect: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`);
            console.log("Will create a new session instead");
            isExistingSession = false;
            existingE2bSessionId = null;
          }
        } catch (reconnectError) {
          console.log(`Failed to reconnect to existing session: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`);
          console.log("Will create a new session instead");
          isExistingSession = false;
          existingE2bSessionId = null;
        }
      }
      
      // Create a new sandbox if reconnection failed or there was no existing session
      if (!sandbox) {
        console.log("Creating a new sandbox session");
        // Create a new sandbox with the E2B API key
        sandbox = await e2b.Sandbox.create({
          apiKey: e2bApiKey,
          template: templateId || 'base',
          metadata: {
            sessionKey,
            organizationId: organizationId || 'default'
          },
          // These options are critical for persistence
          keepAlive: true,
          persistent: true
        });
        console.log(`New sandbox created with ID: ${sandbox.id}`);
        
        // Store the new session in the database
        try {
          const { error: insertError } = await supabase
            .from('sandbox_sessions')
            .upsert({
              session_key: sessionKey,
              session_id: sessionIdToUse,
              organization_id: organizationId || 'default',
              e2b_session_id: sandbox.id,
              working_directory: workingDirectory,
              last_used: new Date().toISOString(),
              created_at: new Date().toISOString()
            });
          
          if (insertError) {
            console.log(`Failed to store new session in database: ${insertError.message}`);
          } else {
            console.log("Successfully stored new session in database");
            
            // Since this is a new session, mark as existing for future requests
            isExistingSession = true;
            existingE2bSessionId = sandbox.id;
          }
        } catch (dbError) {
          console.log(`Database error when storing new session: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        }
      }
      
      // Deeply validate the sandbox structure before proceeding
      if (!sandbox) {
        throw new Error("Sandbox creation returned undefined");
      }
      
      console.log("Sandbox properties:", Object.keys(sandbox));
      
      // Ensure process and required methods exist
      if (!sandbox.process) {
        console.log("Sandbox is missing process property. Available: " + Object.keys(sandbox).join(', '));
        
        // Check if we have alternative command execution methods
        if (sandbox.commands && typeof sandbox.commands.run === 'function') {
          console.log("Using sandbox.commands.run as alternative to process.start");
          
          // Create compatibility layer
          sandbox.process = {
            start: async (options: any) => {
              console.log("Executing command via commands.run:", options.cmd);
              
              // Split the command into executable and args
              const commandParts = options.cmd.split(/\s+/).filter(Boolean);
              const cmd = commandParts[0];
              const args = commandParts.slice(1);
              
              console.log(`Running command as: cmd="${cmd}", args=[${args.join(', ')}]`);
              
              const result = await sandbox.commands.run({
                cmd: cmd,           // Pass executable name 
                args: args,         // Pass arguments as separate array
                cwd: options.cwd,
                onStdout: options.onStdout,
                onStderr: options.onStderr,
                timeout: options.timeout
              });
              return result;
            }
          };
        } else if (sandbox.pty && typeof sandbox.pty.spawn === 'function') {
          console.log("Using sandbox.pty.spawn as alternative to process.start");
          
          // Create compatibility layer using pty
          sandbox.process = {
            start: async (options: any) => {
              console.log("Executing command via pty.spawn:", options.cmd);
              const cmdParts = options.cmd.split(' ');
              const ptyProcess = await sandbox.pty.spawn(cmdParts[0], cmdParts.slice(1), {
                cwd: options.cwd
              });
              
              let stdout = '';
              let stderr = '';
              
              ptyProcess.output.addEventListener('data', (data) => {
                stdout += data;
                if (options.onStdout) {
                  options.onStdout(data);
                }
              });
              
              const result = await ptyProcess.wait();
              return {
                stdout,
                stderr,
                exitCode: result.exitCode
              };
            }
          };
        } else {
          throw new Error(`Sandbox missing process property and no suitable alternatives found. Available: ${Object.keys(sandbox).join(', ')}`);
        }
      }
      
      if (typeof sandbox.process.start !== 'function') {
        throw new Error(`Sandbox process.start is not a function. Type: ${typeof sandbox.process.start}. Available methods: ${Object.keys(sandbox.process).join(', ')}`);
      }
      
      // Change to working directory if different from default
      if (workingDirectory !== '/home/sandbox') {
        try {
          console.log(`Changing to working directory: ${workingDirectory}`);
          
          // Check if filesystem exists
          if (!sandbox.filesystem) {
            console.log("Warning: sandbox.filesystem is undefined, using direct command");
            await sandbox.process.start({
              cmd: `mkdir -p ${workingDirectory} && cd ${workingDirectory} && pwd`,
              onStdout: (data: string) => {
                console.log(`Directory setup output: ${data}`);
              },
              onStderr: (data: string) => {
                console.error(`Directory setup error: ${data}`);
              }
            });
          } else {
            await sandbox.filesystem.makeDir(workingDirectory, { recursive: true });
            await sandbox.process.start({
              cmd: `cd ${workingDirectory} && pwd`,
              onStdout: (data: string) => {
                console.log(`Directory change output: ${data}`);
              },
              onStderr: (data: string) => {
                console.error(`Directory change error: ${data}`);
              }
            });
          }
        } catch (dirError) {
          console.log(`Failed to change directory: ${dirError instanceof Error ? dirError.message : String(dirError)}`);
          // Continue with the default directory
          workingDirectory = '/home/sandbox';
        }
      }
      
      // Special handling for CD commands to track working directory changes
      const isCdCommand = command.trim().startsWith('cd ');
      let actualCommand = command;
      
      if (isCdCommand) {
        console.log('Processing CD command...');
        const targetDir = command.substring(3).trim();
        
        // Improve CD command handling to be more robust
        if (targetDir.startsWith('/')) {
          // Absolute path - use as is
          actualCommand = `cd "${targetDir}" && pwd`;
        } else if (targetDir === '..') {
          // Going up one directory
          const parentDir = workingDirectory.split('/').slice(0, -1).join('/') || '/';
          actualCommand = `cd "${parentDir}" && pwd`;
        } else if (workingDirectory === '/home/sandbox') {
          // If in home directory, just use the relative path directly
          actualCommand = `cd "${targetDir}" && pwd`;
        } else {
          // Proper path joining with validation
          // Remove trailing slash from workingDirectory if it exists
          const baseDir = workingDirectory.endsWith('/') ? 
            workingDirectory.slice(0, -1) : workingDirectory;
          actualCommand = `cd "${baseDir}/${targetDir}" && pwd`;
        }
      }
      
      // Run the command
      console.log(`Executing command in sandbox: ${actualCommand}`);
      
      try {
        // Instead of using process.start, let's try a more direct approach
        let stdout = '';
        let stderr = '';
        let exitCode = 1;
        
        console.log(`Using sandbox ID: ${sandbox.id}, isExistingSession: ${isExistingSession}`);
        
        // Try multiple approaches to execute the command
        if (sandbox.commands && typeof sandbox.commands.run === 'function') {
          // Direct approach using commands.run
          console.log("Using sandbox.commands.run for execution");
          
          try {
            // Try to use better formatting for commands.run
            console.log("Running command:", actualCommand);

            // Handle the command differently based on the method's signature
            let result;
            let outputStdout = '';
            let outputStderr = '';
            
            if (typeof sandbox.commands.run === 'function') {
              // The API might be different based on the E2B version
              try {
                // Try first with options object including callbacks
                result = await sandbox.commands.run({
                  cmd: actualCommand,
                  onStdout: (data: string) => {
                    outputStdout += data;
                    console.log(`COMMANDS.RUN STDOUT: ${data}`);
                  },
                  onStderr: (data: string) => {
                    outputStderr += data;
                    console.log(`COMMANDS.RUN STDERR: ${data}`);
                  },
                  timeout: 30000 // 30 seconds
                });
              } catch (firstAttemptError) {
                console.log("First attempt failed, trying direct command:", firstAttemptError);
                // Fall back to passing just the command string
                result = await sandbox.commands.run(actualCommand);
              }
            }
            
            // Prioritize collected output, then use result properties
            stdout = outputStdout || (result && result.stdout) || '';
            stderr = outputStderr || (result && result.stderr) || '';
            exitCode = result ? result.exitCode || 0 : 0;
            
            console.log(`commands.run SUCCESS with exit code: ${exitCode}`);
            console.log(`STDOUT: "${stdout}"`);
            console.log(`STDERR: "${stderr}"`);
          } catch (runError) {
            console.error("commands.run failed:", runError);
            stderr = `Error executing command: ${runError instanceof Error ? runError.message : String(runError)}`;
          }
        } else if (sandbox.exec && typeof sandbox.exec === 'function') {
          // Try using exec if available
          console.log("Using sandbox.exec for execution");
          
          try {
            // Define output collectors
            let outputStdout = '';
            let outputStderr = '';
            
            // Check for different exec API patterns
            if (typeof sandbox.exec === 'function') {
              const result = await sandbox.exec(actualCommand, {
                cwd: workingDirectory,
                onStdout: (data: string) => {
                  outputStdout += data;
                  console.log(`STDOUT: ${data}`);
                },
                onStderr: (data: string) => {
                  outputStderr += data;
                  console.log(`STDERR: ${data}`);
                }
              });
              
              stdout = outputStdout || result.stdout || '';
              stderr = outputStderr || result.stderr || '';
              exitCode = result.exitCode;
            }
            
            console.log(`exec succeeded with exit code: ${exitCode}`);
            console.log(`STDOUT: "${stdout}"`);
            console.log(`STDERR: "${stderr}"`);
          } catch (execError) {
            console.error("exec failed:", execError);
            stderr = `Error executing command: ${execError instanceof Error ? execError.message : String(execError)}`;
          }
        } else if (sandbox.process && typeof sandbox.process.exec === 'function') {
          // Try using process.exec if available
          console.log("Using sandbox.process.exec for execution");
          
          try {
            // Define output collectors
            let outputStdout = '';
            let outputStderr = '';
            
            const result = await sandbox.process.exec(actualCommand, {
              cwd: workingDirectory,
              onStdout: (data: string) => {
                outputStdout += data;
                console.log(`STDOUT: ${data}`);
              },
              onStderr: (data: string) => {
                outputStderr += data;
                console.log(`STDERR: ${data}`);
              }
            });
            
            stdout = outputStdout || result.stdout || '';
            stderr = outputStderr || result.stderr || '';
            exitCode = result.exitCode;
            
            console.log(`process.exec succeeded with exit code: ${exitCode}`);
            console.log(`STDOUT: "${stdout}"`);
            console.log(`STDERR: "${stderr}"`);
          } catch (execError) {
            console.error("process.exec failed:", execError);
            stderr = `Error executing command: ${execError instanceof Error ? execError.message : String(execError)}`;
          }
        } else if (sandbox.terminal && typeof sandbox.terminal.exec === 'function') {
          // Try using terminal.exec if available
          console.log("Using sandbox.terminal.exec for execution");
          
          try {
            // Define output collectors
            let outputStdout = '';
            let outputStderr = '';
            
            const result = await sandbox.terminal.exec(actualCommand, {
              cwd: workingDirectory,
              onStdout: (data: string) => {
                outputStdout += data;
                console.log(`STDOUT: ${data}`);
              },
              onStderr: (data: string) => {
                outputStderr += data;
                console.log(`STDERR: ${data}`);
              }
            });
            
            stdout = outputStdout || result.stdout || '';
            stderr = outputStderr || result.stderr || '';
            exitCode = result.exitCode;
            
            console.log(`terminal.exec succeeded with exit code: ${exitCode}`);
            console.log(`STDOUT: "${stdout}"`);
            console.log(`STDERR: "${stderr}"`);
          } catch (terminalError) {
            console.error("terminal.exec failed:", terminalError);
            stderr = `Error executing command: ${terminalError instanceof Error ? terminalError.message : String(terminalError)}`;
          }
        } else {
          // Fallback to our original approach with a modified start method
          console.log("Fallback to modified process.start");
          
          try {
            // Extract command parts but keep as simple strings
            const cmdParts = actualCommand.split(/\s+/).filter(Boolean);
            const cmd = cmdParts[0];
            const cmdArgs = cmdParts.slice(1);
            
            console.log(`Using command: ${cmd}, args: ${JSON.stringify(cmdArgs)}`);
            
            // Define output collectors
            let outputStdout = '';
            let outputStderr = '';
            
            // Construct a plain object with the exact format needed
            const startOptions = {
              cmd: cmd,
              args: cmdArgs.length > 0 ? cmdArgs : [],
              cwd: workingDirectory,
              onStdout: (data: string) => {
                outputStdout += data;
                console.log(`STDOUT: ${data}`);
              },
              onStderr: (data: string) => {
                outputStderr += data;
                console.log(`STDERR: ${data}`);
              }
            };
            
            console.log("process.start options:", JSON.stringify(startOptions));
            const process = await sandbox.process.start(startOptions);
            
            // Wait for process to complete
            exitCode = await process.wait();
            
            // Use the collected output instead of process properties
            stdout = outputStdout;
            stderr = outputStderr;
            
            console.log(`process.start succeeded with exit code: ${exitCode}`);
            console.log(`STDOUT: "${stdout}"`);
            console.log(`STDERR: "${stderr}"`);
          } catch (startError) {
            console.error("process.start failed:", startError);
            stderr = `Error executing command: ${startError instanceof Error ? startError.message : String(startError)}`;
          }
        }
        
        // Process the output and handle special CD command logic
        if (isCdCommand && exitCode === 0) {
          // For CD commands, update the working directory if successful
          const newDir = stdout.trim();
          if (newDir) {
            console.log(`Updating working directory from '${workingDirectory}' to '${newDir}'`);
            workingDirectory = newDir;
            
            // Update database with new working directory
            try {
              await supabase
                .from('sandbox_sessions')
                .update({ 
                  working_directory: newDir,
                  last_used: new Date().toISOString(),
                  e2b_session_id: sandbox.id // Always ensure the session ID is current
                })
                .eq('session_key', sessionKey);
              console.log(`Successfully updated working directory to ${newDir} in database`);
            } catch (dbError) {
              console.log(`Failed to update working directory in database: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
            }
          }
        } else {
          // Update last_used for any command
          try {
            await supabase
              .from('sandbox_sessions')
              .update({ 
                last_used: new Date().toISOString(),
                e2b_session_id: sandbox.id // Always update the E2B session ID
              })
              .eq('session_key', sessionKey);
            
            // REMOVED: Don't pause the session as it breaks persistence
            // E2B's keepAlive and persistent flags handle this automatically
          } catch (updateError) {
            console.log(`Failed to update session last_used: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
          }
          
          // DO NOT close the sandbox - keep it running for persistence
          // Instead just log session status
          console.log(`Keeping sandbox session ${sandbox.id} alive for future commands`);
          
          // Return the command output with the session ID
          console.log('Returning response with sessionId:', sandbox.id);
          return new Response(
            JSON.stringify({
              success: exitCode === 0,
              stdout,
              stderr,
              exitCode,
              persistentSession: true,
              isExistingSession,
              workingDirectory,
              sessionId: sandbox.id // Make sure sandbox.id is correctly populated and not undefined
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (error) {
        console.error("Critical error starting process:", error);
        throw new Error(`Failed to start process: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      console.error("Error creating sandbox:", error);
      return new Response(
        JSON.stringify({
          success: false,
          stderr: `Error creating sandbox: ${error instanceof Error ? error.message : String(error)}`,
          exitCode: 1,
          persistentSession: false,
          isExistingSession: false,
          workingDirectory
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.log(`Unhandled error in handleRunCommand: ${error instanceof Error ? error.message : String(error)}`);
    return new Response(
      JSON.stringify({ 
        success: false,
        stderr: `Unhandled sandbox error: ${error instanceof Error ? error.message : String(error)}`,
        exitCode: 1 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Handle the sandbox status endpoint
async function handleStatusRequest(req: Request) {
  const e2bApiKey = Deno.env.get('E2B_API_KEY');
  let isE2bWorking = false;
  
  if (e2bApiKey) {
    try {
      const e2b = await importE2B();
      isE2bWorking = true;
    } catch (error) {
      console.error("Failed to import E2B:", error);
    }
  }
  
  // Get active sessions count if we have access to database
  let sessionCount = 0;
  let sessionList: Array<any> = [];
  
  try {
    const supabase = getSupabaseClient(req);
    if (supabase) {
      const { data, error } = await supabase
        .from('sandbox_sessions')
        .select('*')
        .order('last_used', { ascending: false });
      
      if (!error && data) {
        sessionCount = data.length;
        sessionList = data.map((s: any) => ({
          key: s.session_key,
          lastUsed: s.last_used,
          workingDir: s.working_directory
        }));
      }
    }
  } catch (error) {
    console.error("Error getting session count:", error);
  }
  
  return new Response(
    JSON.stringify({
      status: isE2bWorking ? 'operational' : 'degraded',
      apiKeyConfigured: !!e2bApiKey,
      apiKeyWorking: isE2bWorking,
      activeSessionCount: sessionCount,
      activeSessions: sessionList,
      version: '0.4.0', // Version bumped to indicate forcing new sandbox sessions
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Handle closing a sandbox session
async function handleCloseSession(req: Request) {
  const { sessionId, sessionKey } = await req.json();
  
  if (!sessionId && !sessionKey) {
    return new Response(
      JSON.stringify({ error: 'Either sessionId or sessionKey is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  const supabase = getSupabaseClient(req);
  if (!supabase) {
    return new Response(
      JSON.stringify({ error: 'Failed to create Supabase client' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    if (sessionKey) {
      await supabase
        .from('sandbox_sessions')
        .delete()
        .eq('session_key', sessionKey);
    } else if (sessionId) {
      await supabase
        .from('sandbox_sessions')
        .delete()
        .eq('e2b_session_id', sessionId);
    }
    
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Failed to close session',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Main handler function for all requests
serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) {
    return corsResponse;
  }
  
  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();
  
  try {
    // Development mode API key check
    const apiKeyHeader = req.headers.get('x-api-key');
    const configuredApiKey = Deno.env.get('SANDBOX_API_KEY') || 'test-api-key-for-development';
    const isDev = Deno.env.get('ENVIRONMENT') === 'development' || true; // Force dev mode for testing
    
    console.log(`API Key check: header=${apiKeyHeader}, configured=${configuredApiKey}, isDev=${isDev}`);
    
    // Skip auth check in development mode or if headers match
    const shouldCheckAuth = !isDev && configuredApiKey && apiKeyHeader !== configuredApiKey;
    
    if (shouldCheckAuth) {
      // Verify if authenticated by checking Supabase JWT
      if (!req.headers.get('authorization')) {
        return new Response(
          JSON.stringify({ code: 401, message: "Missing authorization header" }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Route to appropriate handler
    switch (path) {
      case 'run':
        return await handleRunCommand(req);
      
      case 'status':
        return await handleStatusRequest(req);
      
      case 'close-session':
        return await handleCloseSession(req);
      
      default:
        return new Response(
          JSON.stringify({ 
            error: 'Not found',
            message: 'Endpoint not found. Available endpoints: /run, /status, /close-session' 
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error("Unhandled error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
