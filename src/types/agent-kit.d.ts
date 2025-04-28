declare module 'agent-kit-types' {
  export interface NetworkContext {
    id: string;
    state: Record<string, any>;
    tools?: Record<string, any>;
    getSandboxId?: () => string | null;
    setSandboxId?: (id: string) => void;
    getClientId?: () => string | null;
    setClientId?: (id: string) => void;
  }

  export interface StepContext {
    id: string;
    state: Record<string, any>;
    network: NetworkContext;
    name?: string;
  }

  export interface ToolHandler {
    (step: StepContext, params: Record<string, any>): Promise<any>;
  }

  export interface AiToolDefinition {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, {
        type: string;
        description: string;
        [key: string]: any;
      }>;
      required?: string[];
    };
  }

  export interface AIStepFunction {
    prompt: string;
    messages?: Array<{role: string; content: string}>;
    tools?: AiToolDefinition[];
    [key: string]: any;
  }

  export interface Step {
    id: string;
    name?: string;
    ai: {
      invoke: (args: AIStepFunction) => Promise<any>;
    };
    tools: Record<string, ToolHandler>;
    state: Record<string, any>;
    network: NetworkContext;
    waitForEvent: (eventName: string, params?: any) => Promise<any>;
  }
} 