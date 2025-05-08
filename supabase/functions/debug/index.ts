// @ts-ignore
import { Sandbox } from 'npm:@e2b/code-interpreter';
// @ts-ignore
import { corsHeaders } from '../_shared/configs/cors.ts';

// API Configuration
const E2B_API_KEY = Deno.env.get('E2B_API_KEY') || '';

/**
 * Debug endpoint for testing E2B API
 * This function is intended for development/debugging only
 */
Deno.serve(async (req) => {
  // Add more CORS headers to bypass authentication for debugging
  const responseHeaders = {
    ...corsHeaders,
    'Content-Type': 'application/json',
    // Allow access from any origin for debugging
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  };
  
  // Handle CORS for preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: responseHeaders });
  }
  
  try {
    console.log("Creating E2B sandbox...");
    
    // Create an E2B sandbox
    const sandbox = await Sandbox.create({
      apiKey: E2B_API_KEY,
      timeoutMs: 5 * 60 * 1000, // 5 minutes timeout for debugging
    });
    
    console.log(`Created E2B sandbox with ID: ${sandbox.sandboxId}`);
    
    // Introspect the sandbox object to understand what methods are available
    const properties = Object.getOwnPropertyNames(sandbox);
    console.log("Sandbox properties:", properties);
    
    // Check for expose method
    console.log("sandbox.expose is a function:", typeof sandbox.expose === 'function');
    
    // Check for network property and its methods
    if (sandbox.network) {
      console.log("sandbox.network properties:", Object.getOwnPropertyNames(sandbox.network));
      console.log("sandbox.network.startProxy is a function:", typeof sandbox.network.startProxy === 'function');
    } else {
      console.log("sandbox.network is not available");
    }
    
    // Check for container property and its methods
    if (sandbox.container) {
      console.log("sandbox.container properties:", Object.getOwnPropertyNames(sandbox.container));
      console.log("sandbox.container.exposePort is a function:", typeof sandbox.container.exposePort === 'function');
    } else {
      console.log("sandbox.container is not available");
    }
    
    // Test process methods
    console.log("sandbox.process properties:", Object.getOwnPropertyNames(sandbox.process));

    // Attempt to find potential port exposure methods by inspecting all methods
    const allMethods = [];
    for (const propName of properties) {
      const prop = sandbox[propName];
      if (typeof prop === 'object' && prop !== null) {
        const nestedProps = Object.getOwnPropertyNames(prop);
        for (const nestedProp of nestedProps) {
          if (typeof prop[nestedProp] === 'function') {
            const methodName = `sandbox.${propName}.${nestedProp}`;
            if (nestedProp.includes('port') || nestedProp.includes('proxy') || nestedProp.includes('expose')) {
              allMethods.push(`${methodName} - POTENTIAL PORT EXPOSURE METHOD`);
            } else {
              allMethods.push(methodName);
            }
          }
        }
      } else if (typeof prop === 'function') {
        const methodName = `sandbox.${propName}`;
        if (propName.includes('port') || propName.includes('proxy') || propName.includes('expose')) {
          allMethods.push(`${methodName} - POTENTIAL PORT EXPOSURE METHOD`);
        } else {
          allMethods.push(methodName);
        }
      }
    }
    
    console.log("All available methods:", allMethods);
    
    // Kill the sandbox when we're done
    await sandbox.kill();
    
    return new Response(
      JSON.stringify({
        status: 'success',
        message: 'E2B API inspection complete. Check function logs for details.',
        sandboxId: sandbox.sandboxId,
        properties,
        has_expose: typeof sandbox.expose === 'function',
        has_network_startProxy: sandbox.network && typeof sandbox.network.startProxy === 'function',
        has_container_exposePort: sandbox.container && typeof sandbox.container.exposePort === 'function',
        available_methods: allMethods
      }),
      { headers: responseHeaders }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      }),
      { headers: responseHeaders, status: 500 }
    );
  }
}); 