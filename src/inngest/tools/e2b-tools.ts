import { createTool } from '@inngest/agent-kit';
import { z } from 'zod';
import axios from 'axios';

// Fix the import path to match the configured alias in tsconfig.json
import {
  createSandbox,
  runCodeAndStream,
  closeSandbox,
  getActiveSandboxCount,
  cleanupAllSandboxes
} from '@e2b/e2b-service';

// Add proper types for step and network
type StepContext = {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
  event?: {
    data: {
      clientId?: string;
      [key: string]: any;
    };
  };
  agent?: {
    useTools: <T>(tools: any[], fn: (args: { tools: any }) => Promise<T>) => Promise<T>;
  };
};

type NetworkContext = {
  state: {
    kv: {
      get: (key: string) => any;
      set: (key: string, value: any) => void;
    };
  };
};

/**
 * AgentKit tool for executing code in an E2B sandbox
 * 
 * This tool allows agents to:
 * 1. Create a sandbox
 * 2. Execute code in the sandbox and stream output to the client
 * 3. Close the sandbox when finished
 * 
 * The tool handles these steps in sequence and ensures proper resource cleanup.
 */
export const executeCodeInSandbox = createTool({
  name: 'executeCodeInSandbox',
  description: 'Executes code in a secure sandbox environment and streams output to the client.',
  parameters: z.object({
    code: z.string().describe('The code to execute.'),
    template: z.string().optional().default('code-interpreter-v1').describe('The E2B template to use.'),
  }),
  handler: async ({ code, template = 'code-interpreter-v1' }, { step, network }: { step: StepContext, network?: NetworkContext }) => {
    // Retrieve clientId from network state or event data
    const clientId = network?.state.kv.get('clientId') || step?.event?.data?.clientId;
    
    if (!clientId) {
      return { error: 'Client ID not found for streaming. Cannot execute code without a client connection.' };
    }

    let sandboxId: string | null = null;
    
    try {
      // Create a new sandbox instance
      sandboxId = await step?.run('create-e2b-sandbox', async () => {
        console.log(`Creating E2B sandbox with template: ${template} for client: ${clientId}`);
        return await createSandbox(template);
      });

      if (!sandboxId) {
        throw new Error('Failed to create sandbox');
      }

      // Store the sandboxId in the network state for potential future use
      if (network?.state.kv) {
        network.state.kv.set('lastSandboxId', sandboxId);
      }

      // Execute the code and stream output to the client
      await step?.run('run-e2b-code', async () => {
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

        if (sandboxId) {
          await runCodeAndStream(sandboxId, code, clientId);
        }
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
        await step?.run('close-e2b-sandbox', async () => {
          console.log(`Closing sandbox ${sandboxId}`);
          if (sandboxId) {
            await closeSandbox(sandboxId);
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
export const getActiveSandboxes = createTool({
  name: 'getActiveSandboxes',
  description: 'Get count of currently active E2B sandboxes.',
  parameters: z.object({}),
  handler: async (_, { step }: { step: StepContext }) => {
    const count = await step?.run('get-active-sandboxes', () => {
      return getActiveSandboxCount();
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
export const cleanupSandboxes = createTool({
  name: 'cleanupSandboxes',
  description: 'Clean up all active E2B sandbox instances.',
  parameters: z.object({}),
  handler: async (_, { step }: { step: StepContext }) => {
    await step?.run('cleanup-all-sandboxes', async () => {
      await cleanupAllSandboxes();
      return { success: true };
    });
    
    return { 
      success: true,
      message: 'All sandbox instances have been cleaned up.'
    };
  },
});

// Export the tools for use in Inngest functions
export const e2bTools = {
  executeCodeInSandbox,
  getActiveSandboxes,
  cleanupSandboxes
};

export default e2bTools; 