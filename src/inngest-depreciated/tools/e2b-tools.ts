import { z } from 'zod';

// Create placeholder for the modules that will be dynamically imported
let agentKitModule: any = null;
let axiosModule: any = null;

// Initialize modules before creating tools
async function initModules() {
  try {
    // Use dynamic imports for ESM compatibility
    agentKitModule = await import('@inngest/agent-kit');
    axiosModule = await import('axios');
    console.log('Successfully loaded AgentKit and axios modules');
  } catch (error) {
    console.error('Failed to initialize modules:', error);
    throw error;
  }
}

// Function to get initialized tools - returns a promise that resolves to the tools
export async function getInitializedTools() {
  // Initialize modules if they haven't been initialized yet
  if (!agentKitModule || !axiosModule) {
    await initModules();
  }
  
  const { createTool } = agentKitModule;
  const axios = axiosModule.default;
  
  /**
   * AgentKit tool for executing code in an E2B sandbox
   */
  const executeCodeInSandbox = createTool({
    name: 'executeCodeInSandbox',
    description: 'Executes code in a secure sandbox environment and streams output to the client.',
    parameters: z.object({
      code: z.string().describe('The code to execute.'),
      template: z.string().optional().default('code-interpreter-v1').describe('The E2B template to use.'),
    }),
    handler: async (input: { code: string; template?: string }, opts: any) => {
      const { code, template = 'code-interpreter-v1' } = input;
      const { step, agent, network } = opts;
      
      // Ensure step is available
      if (!step) {
        return { error: 'Step object is not available. Cannot execute code.' };
      }
      
      // Retrieve clientId from network state
      const clientId = network?.state.kv.get('clientId');
      
      if (!clientId) {
        return { error: 'Client ID not found for streaming. Cannot execute code without a client connection.' };
      }

      let sandboxId: string | null = null;
      
      try {
        // Create a new sandbox instance
        sandboxId = await step.run('create-e2b-sandbox', async () => {
          console.log(`Creating E2B sandbox with template: ${template} for client: ${clientId}`);
          
          // Call the E2B service to create a sandbox
          const e2bServiceUrl = process.env.E2B_SERVICE_URL || 'http://localhost:8002';
          const response = await axios.post(`${e2bServiceUrl}/create-sandbox`, {
            template
          });
          
          return response.data.sandboxId;
        });

        if (!sandboxId) {
          throw new Error('Failed to create sandbox');
        }

        // Store the sandboxId in the network state for potential future use
        if (network?.state.kv) {
          network.state.kv.set('lastSandboxId', sandboxId);
        }

        // Execute the code and stream output to the client
        await step.run('run-e2b-code', async () => {
          console.log(`Running code in sandbox ${sandboxId} for client ${clientId}`);
          
          // Notify the API server that code execution has started
          try {
            const port = process.env.API_SERVER_PORT || '3000';
            await axios.post(`http://localhost:${port}/api/chat/execution-started`, {
              clientId,
              sandboxId,
            });
          } catch (error: any) {
            console.warn(`Failed to notify API server about execution start: ${error.message}`);
            // Continue execution even if notification fails
          }

          // Call the E2B service to execute code and stream output
          const e2bServiceUrl = process.env.E2B_SERVICE_URL || 'http://localhost:8002';
          await axios.post(`${e2bServiceUrl}/execute-stream`, {
            sandboxId,
            code,
            clientId,
            timeout: 30000 // 30 seconds timeout
          });
          
          return { success: true };
        });

        return { 
          success: true, 
          message: 'Code execution completed successfully. Output has been streamed to your terminal.',
          sandboxId 
        };
      } catch (error: any) {
        console.error('E2B Tool Error:', error);
        return { 
          error: `Failed to execute code: ${error.message}`,
          sandboxId: sandboxId || undefined
        };
      } finally {
        // Always clean up sandbox resources even if execution fails
        if (sandboxId) {
          await step.run('close-e2b-sandbox', async () => {
            console.log(`Closing sandbox ${sandboxId}`);
            
            // Call the E2B service to close the sandbox
            const e2bServiceUrl = process.env.E2B_SERVICE_URL || 'http://localhost:8002';
            try {
              await axios.post(`${e2bServiceUrl}/close-sandbox`, {
                sandboxId
              });
            } catch (closeError: any) {
              console.warn(`Failed to close sandbox ${sandboxId}: ${closeError.message}`);
              // Don't throw here, as we're in a finally block
            }
            
            return { closed: true };
          });
        }
      }
    },
  });

  /**
   * Get the current count of active sandboxes
   */
  const getActiveSandboxes = createTool({
    name: 'getActiveSandboxes',
    description: 'Get count of currently active E2B sandboxes.',
    parameters: z.object({}),
    handler: async (_input: any, opts: any) => {
      const { step } = opts;
      
      // Ensure step is available
      if (!step) {
        return { error: 'Step object is not available.' };
      }
      
      const count = await step.run('get-active-sandboxes', async () => {
        // Call the E2B service to get active sandbox count
        const e2bServiceUrl = process.env.E2B_SERVICE_URL || 'http://localhost:8002';
        const response = await axios.get(`${e2bServiceUrl}/active-sandboxes`);
        return response.data.count;
      });
      
      return { 
        count,
        message: `There are currently ${count} active sandbox instances.`
      };
    },
  });

  /**
   * Clean up all active sandboxes
   */
  const cleanupSandboxes = createTool({
    name: 'cleanupSandboxes',
    description: 'Clean up all active E2B sandbox instances.',
    parameters: z.object({}),
    handler: async (_input: any, opts: any) => {
      const { step } = opts;
      
      // Ensure step is available
      if (!step) {
        return { error: 'Step object is not available.' };
      }
      
      await step.run('cleanup-all-sandboxes', async () => {
        // Call the E2B service to clean up all sandboxes
        const e2bServiceUrl = process.env.E2B_SERVICE_URL || 'http://localhost:8002';
        await axios.post(`${e2bServiceUrl}/cleanup-all-sandboxes`);
        return { success: true };
      });
      
      return { 
        success: true,
        message: 'All sandbox instances have been cleaned up.'
      };
    },
  });

  // Return the tools
  return {
    executeCodeInSandbox,
    getActiveSandboxes,
    cleanupSandboxes
  };
}

// Initialize the tools immediately, but handle errors
initModules().catch(error => {
  console.error('Failed to initialize e2b tools:', error);
});

// Add this export for directly calling the handler 
export const executeCodeDirectly = async (
  code: string, 
  template: string = 'code-interpreter-v1',
  clientId: string,
  step: any
): Promise<any> => {
  if (!axiosModule) {
    await initModules();
  }
  
  const axios = axiosModule.default;
  let sandboxId: string | null = null;
  
  try {
    // Create a new sandbox instance - DIRECTLY, not via step.run
    console.log(`Creating E2B sandbox with template: ${template} for client: ${clientId}`);
    
    // Call the E2B service to create a sandbox
    const e2bServiceUrl = process.env.E2B_SERVICE_URL || 'http://localhost:8002';
    const createResponse = await axios.post(`${e2bServiceUrl}/create-sandbox`, {
      template
    });
    
    sandboxId = createResponse.data.sandboxId;

    if (!sandboxId) {
      throw new Error('Failed to create sandbox');
    }

    console.log(`Running code in sandbox ${sandboxId} for client ${clientId}`);
    
    // Notify the API server that code execution has started
    try {
      const port = process.env.API_SERVER_PORT || '3000';
      await axios.post(`http://localhost:${port}/api/chat/execution-started`, {
        clientId,
        sandboxId,
      });
    } catch (notifyError: any) {
      console.warn(`Failed to notify API server about execution start: ${notifyError.message}`);
      // Continue execution even if notification fails
    }

    // IMPORTANT: We'll use sandboxId as the clientId for WebSocket connections
    // This ensures the frontend connects to the same ID the backend is streaming to
    await axios.post(`${e2bServiceUrl}/execute-stream`, {
      sandboxId,
      code,
      clientId: sandboxId, // Use sandboxId as clientId to ensure consistent websocket connection
      timeout: 30000 // 30 seconds timeout
    });
    
    return { 
      success: true, 
      message: 'Code execution completed successfully. Output has been streamed to your terminal.',
      sandboxId 
    };
  } catch (error: any) {
    console.error('E2B Tool Error:', error);
    return { 
      error: `Failed to execute code: ${error.message}`,
      sandboxId: sandboxId || undefined
    };
  } finally {
    // Always clean up sandbox resources even if execution fails
    if (sandboxId) {
      console.log(`Closing sandbox ${sandboxId}`);
      
      // Call the E2B service to close the sandbox
      const e2bServiceUrl = process.env.E2B_SERVICE_URL || 'http://localhost:8002';
      try {
        await axios.post(`${e2bServiceUrl}/close-sandbox`, {
          sandboxId
        });
      } catch (closeError: any) {
        console.warn(`Failed to close sandbox ${sandboxId}: ${closeError.message}`);
        // Don't throw here, as we're in a finally block
      }
    }
  }
};

// For backwards compatibility and direct calling
export const e2bTools = {
  // These are placeholders that will be properly initialized by the time they're used
  executeCodeInSandbox: {
    call: async ({ code, template }: { code: string; template?: string }, 
                { step, network }: any) => {
      if (!network?.state?.data) {
        return { error: 'Network state is not available' };
      }
      
      let clientId;
      
      // Try to get clientId from different sources
      if (network?.state?.kv?.get && typeof network.state.kv.get === 'function') {
        clientId = network.state.kv.get('clientId');
      }
      
      if (!clientId && network?.state?.data?.clientId) {
        clientId = network.state.data.clientId;
      }
      
      if (!clientId && network?.state?.data?.session?.clientId) {
        clientId = network.state.data.session.clientId;
      }
      
      if (!clientId) {
        return { error: 'Client ID not found for streaming. Cannot execute code without a client connection.' };
      }
      
      return executeCodeDirectly(code, template || 'code-interpreter-v1', clientId, step);
    }
  },
  getActiveSandboxes: null,
  cleanupSandboxes: null
} as any;

// Immediately initialize the actual tools
getInitializedTools().then(tools => {
  (e2bTools as any).executeCodeInSandbox = tools.executeCodeInSandbox;
  (e2bTools as any).getActiveSandboxes = tools.getActiveSandboxes;
  (e2bTools as any).cleanupSandboxes = tools.cleanupSandboxes;
  console.log('E2B tools successfully initialized');
}).catch(error => {
  console.error('Failed to initialize e2b tools:', error);
});

export default e2bTools; 