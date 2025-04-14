/**
 * Capability Manager
 * 
 * Manages specialized capabilities that can be assigned to agents.
 * Each capability defines a set of behaviors and tools that an agent can use.
 */

// Define the structure of a capability
export interface Capability {
  id: string;
  name: string;
  description: string;
  tools: string[];
  prompts: {
    [key: string]: string;
  };
  context: string;
}

export class CapabilityManager {
  private capabilities: Map<string, Capability> = new Map();

  constructor() {
    // Register the built-in capabilities
    this.registerTodoCapability();
  }

  /**
   * Register a new capability
   */
  registerCapability(capability: Capability): void {
    this.capabilities.set(capability.id, capability);
  }

  /**
   * Get a capability by ID
   */
  getCapability(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  /**
   * Check if an agent has a specific capability
   */
  async hasCapability(agentMetadata: any, capabilityId: string): Promise<boolean> {
    if (!agentMetadata || !agentMetadata.capabilities) return false;
    
    // Handle both string and array formats for capabilities
    if (typeof agentMetadata.capabilities === 'string') {
      const capabilities = agentMetadata.capabilities.split(',').map((c: string) => c.trim());
      return capabilities.includes(capabilityId);
    }
    
    if (Array.isArray(agentMetadata.capabilities)) {
      return agentMetadata.capabilities.includes(capabilityId);
    }
    
    return false;
  }

  /**
   * Detect which capabilities are needed based on request context
   */
  detectRequiredCapabilities(request: string): string[] {
    const requiredCapabilities: string[] = [];
    
    // Todo management detection
    if (this.isTodoRequest(request)) {
      requiredCapabilities.push('todo_management');
    }
    
    // Add more capability detection logic as needed
    
    return requiredCapabilities;
  }

  /**
   * Check if the request is related to todo management
   */
  private isTodoRequest(request: string): boolean {
    const todoKeywords = [
      'todo', 'task', 'remind me', 'reminder', 'schedule', 'complete', 
      'finish', 'add a task', 'add task', 'create task', 'create a todo',
      'mark as done', 'mark complete', 'due date', 'priority',
      'delete task', 'remove todo', 'update todo', 'change task',
      'list todos', 'show tasks', 'get my todos', 'what tasks'
    ];
    
    const lowercaseRequest = request.toLowerCase();
    return todoKeywords.some(keyword => lowercaseRequest.includes(keyword));
  }

  /**
   * Register the todo management capability
   */
  private registerTodoCapability(): void {
    this.registerCapability({
      id: 'todo_management',
      name: 'Todo Management',
      description: 'Enables the agent to create, read, update, and delete todos',
      tools: ['todo_create', 'todo_read', 'todo_update', 'todo_delete', 'todo_list'],
      prompts: {
        create: 'Create a new todo with the following details: {details}',
        read: 'Find todo information for: {query}',
        update: 'Update the todo {id} with the following changes: {changes}',
        delete: 'Delete the todo with id: {id}',
        list: 'List all todos matching: {filter}'
      },
      context: `
You are a specialized assistant capable of managing todos.
You can create new todos, list existing ones, update their details, and mark them as complete.
A todo consists of:
- Title: A short name for the todo
- Description: Optional details about what needs to be done
- Due Date: When the todo should be completed by
- Status: Not Started, In Progress, or Completed
- Priority: Low, Medium, or High

When responding to users about todos, be helpful, concise, and focused on their request.
      `
    });
  }
} 