import { serve } from 'https://deno.land/std@0.131.0/http/server.ts';
import { CapabilityManager } from './capability-manager.ts';
import { TodoTools } from './todo-tools.ts';

// ========== Memory Manager ==========
class MemoryManager {
  constructor(options: any = {}) {
    console.log('MemoryManager initialized');
  }

  async storeWorkingMemory(key: string, data: any, ttl?: number) {
    console.log(`Storing working memory: ${key}`);
    return true;
  }

  async retrieveWorkingMemory(key: string) {
    console.log(`Retrieving working memory: ${key}`);
    return { 
      key, 
      value: 'Retrieved memory data', 
      timestamp: new Date().toISOString() 
    };
  }

  async searchLongTermMemory(query: string, limit: number = 5) {
    console.log(`Searching long-term memory: ${query}, limit: ${limit}`);
    return [
      { id: '1', concept: 'Related memory 1', data: { content: 'Memory content 1' } },
      { id: '2', concept: 'Related memory 2', data: { content: 'Memory content 2' } }
    ];
  }
}

// ========== Tools Manager ==========
class ToolsManager {
  private tools: Map<string, any> = new Map();

  constructor() {
    console.log('ToolsManager initialized');
  }

  registerTool(toolSpec: any) {
    console.log(`Registering tool: ${toolSpec.id}`);
    this.tools.set(toolSpec.id, toolSpec);
    return true;
  }

  async executeTool(toolId: string, params: any) {
    console.log(`Executing tool ${toolId} with params:`, params);
    const tool = this.tools.get(toolId);
    
    if (!tool) {
      return { 
        success: false, 
        error: `Tool not found: ${toolId}` 
      };
    }
    
    if (tool.execute) {
      try {
        return await tool.execute(params);
      } catch (error) {
        return { 
          success: false, 
          error: `Tool execution error: ${error.message}` 
        };
      }
    }
    
    return { 
      success: true, 
      result: 'Tool execution completed (mock)' 
    };
  }
  
  getToolById(toolId: string) {
    return this.tools.get(toolId);
  }
  
  getTools() {
    return Array.from(this.tools.values());
  }
}

// ========== Sandbox Environment ==========
class SandboxEnvironment {
  private readonly sessionId: string;
  
  constructor(options: any = {}) {
    this.sessionId = `session-${Date.now()}`;
    console.log('SandboxEnvironment initialized with session ID:', this.sessionId);
  }

  async initialize() {
    console.log('Initializing sandbox environment');
    return true;
  }

  async executeCommand(command: string, args: any = {}) {
    console.log(`Executing command: ${command}`, args);
    return {
      success: true,
      output: `Command ${command} executed successfully`,
      exitCode: 0
    };
  }

  async cleanup() {
    console.log('Cleaning up sandbox environment');
    return true;
  }
}

// ========== Executive Agent ==========
class ExecutiveAgent {
  constructor(private memoryManager?: MemoryManager, private capabilityManager?: CapabilityManager) {
    console.log('ExecutiveAgent initialized');
  }

  async interpretTask(input: string) {
    console.log(`Interpreting task: ${input}`);
    
    // Detect if this is a todo-related task
    const requiredCapabilities = this.capabilityManager?.detectRequiredCapabilities(input) || [];
    const isTodoTask = requiredCapabilities.includes('todo_management');
    
    return {
      taskDescription: input,
      userIntent: isTodoTask ? 'manage_todos' : 'process_request',
      requiredKnowledge: isTodoTask ? ['todos'] : ['general'],
      requiredCapabilities
    };
  }

  async synthesizeResults(executionResult: any, userIntent: string) {
    const response = {
      summary: 'Task completed',
      result: executionResult
    };
    
    if (userIntent === 'manage_todos' && executionResult.success) {
      response.summary = this.formatTodoResponse(executionResult);
    }
    
    return response;
  }
  
  private formatTodoResponse(result: any): string {
    if (!result || !result.data) return 'Completed todo operation';
    
    if (Array.isArray(result.data)) {
      if (result.data.length === 0) {
        return 'No todos found matching your criteria.';
      }
      return `Found ${result.data.length} todos.`;
    }
    
    // Single todo operation
    const operation = result.operation || 'processed';
    const todoTitle = result.data.metadata?.title || 'Todo';
    
    switch (operation) {
      case 'create':
        return `Created new todo "${todoTitle}"`;
      case 'update':
        return `Updated todo "${todoTitle}"`;
      case 'delete':
        return `Deleted todo successfully`;
      default:
        return `${operation} todo "${todoTitle}"`;
    }
  }
}

// ========== Knowledge Agent ==========
class KnowledgeAgent {
  constructor(private memoryManager?: MemoryManager) {
    console.log('KnowledgeAgent initialized');
  }

  async gatherKnowledge(taskDescription: string, requiredTypes: string[]) {
    console.log(`Gathering knowledge for: ${taskDescription}, types: ${requiredTypes}`);
    
    if (requiredTypes.includes('todos')) {
      // Gather knowledge specific to todo management
      return {
        contextualInfo: `Todo management context for: ${taskDescription}`,
        sources: ['database', 'memory'],
        todoContext: true
      };
    }
    
    return {
      contextualInfo: `Retrieved knowledge for: ${taskDescription}`,
      sources: ['database', 'memory']
    };
  }

  async analyzeObject(object: any) {
    return {
      summary: 'Object analysis',
      significance: 'medium',
      recommendations: []
    };
  }
}

// ========== Planner Agent ==========
class PlannerAgent {
  constructor(private memoryManager?: MemoryManager, private capabilityManager?: CapabilityManager) {
    console.log('PlannerAgent initialized');
  }

  async createPlan(taskInterpretation: any, relevantKnowledge: any) {
    console.log('Creating plan for task:', taskInterpretation);
    
    const { requiredCapabilities = [] } = taskInterpretation;
    
    // Check if this is a todo management task
    if (requiredCapabilities.includes('todo_management')) {
      return this.createTodoPlan(taskInterpretation, relevantKnowledge);
    }
    
    // Default plan for general tasks
    return {
      steps: [
        { id: '1', action: 'initiate', tool: 'system', parameters: {} },
        { id: '2', action: 'process', tool: 'database', parameters: {} },
        { id: '3', action: 'complete', tool: 'system', parameters: {} }
      ],
      estimatedTime: '5m',
      riskLevel: 'low'
    };
  }
  
  private createTodoPlan(taskInterpretation: any, relevantKnowledge: any) {
    const { taskDescription } = taskInterpretation;
    const lowerTask = taskDescription.toLowerCase();
    
    // Simple task classification - in a real implementation, this would use more sophisticated NLP
    let operation = 'list';
    if (lowerTask.includes('create') || lowerTask.includes('add') || lowerTask.includes('new')) {
      operation = 'create';
    } else if (lowerTask.includes('update') || lowerTask.includes('change') || lowerTask.includes('edit')) {
      operation = 'update';
    } else if (lowerTask.includes('delete') || lowerTask.includes('remove')) {
      operation = 'delete';
    } else if (lowerTask.includes('find') || lowerTask.includes('get') || lowerTask.includes('show me')) {
      operation = 'read';
    }
    
    // Create appropriate plan based on the operation
    switch (operation) {
      case 'create':
        return {
          steps: [
            { id: '1', action: 'extract_todo_details', tool: 'system', parameters: {} },
            { id: '2', action: 'create_todo', tool: 'todo_create', parameters: {} }
          ],
          estimatedTime: '2m',
          riskLevel: 'low',
          operation: 'create'
        };
      case 'read':
        return {
          steps: [
            { id: '1', action: 'extract_todo_query', tool: 'system', parameters: {} },
            { id: '2', action: 'find_todo', tool: 'todo_read', parameters: {} }
          ],
          estimatedTime: '1m',
          riskLevel: 'low',
          operation: 'read'
        };
      case 'update':
        return {
          steps: [
            { id: '1', action: 'extract_todo_id', tool: 'system', parameters: {} },
            { id: '2', action: 'extract_todo_changes', tool: 'system', parameters: {} },
            { id: '3', action: 'update_todo', tool: 'todo_update', parameters: {} }
          ],
          estimatedTime: '2m',
          riskLevel: 'low',
          operation: 'update'
        };
      case 'delete':
        return {
          steps: [
            { id: '1', action: 'extract_todo_id', tool: 'system', parameters: {} },
            { id: '2', action: 'delete_todo', tool: 'todo_delete', parameters: {} }
          ],
          estimatedTime: '1m',
          riskLevel: 'low',
          operation: 'delete'
        };
      case 'list':
      default:
        return {
          steps: [
            { id: '1', action: 'extract_filter_criteria', tool: 'system', parameters: {} },
            { id: '2', action: 'list_todos', tool: 'todo_list', parameters: {} }
          ],
          estimatedTime: '1m',
          riskLevel: 'low',
          operation: 'list'
        };
    }
  }

  async decomposeJob(job: any) {
    return [
      { title: 'Sub-task 1', priority: 'high' },
      { title: 'Sub-task 2', priority: 'medium' }
    ];
  }
}

// ========== Executor Agent ==========
class ExecutorAgent {
  constructor(private memoryManager?: MemoryManager, private toolsManager?: ToolsManager) {
    console.log('ExecutorAgent initialized');
  }

  async executePlan(executionPlan: any, executionContext: any) {
    console.log('Executing plan:', executionPlan);
    
    const results = [];
    const operation = executionPlan.operation || 'default';
    
    // Execute each step in the plan
    for (const step of executionPlan.steps) {
      console.log(`Executing step ${step.id}: ${step.action}`);
      
      let stepResult;
      if (step.tool && this.toolsManager) {
        // Execute tool-based step
        stepResult = await this.toolsManager.executeTool(step.tool, {
          ...step.parameters,
          ...executionContext,
          operation
        });
      } else {
        // Execute system step
        stepResult = await this.executeSystemStep(step.action, step.parameters, executionContext);
      }
      
      results.push({
        stepId: step.id,
        action: step.action,
        status: stepResult.success ? 'completed' : 'failed',
        result: stepResult
      });
      
      // If a step fails, stop execution
      if (!stepResult.success) {
        break;
      }
    }
    
    return {
      success: results.every(r => r.status === 'completed'),
      results,
      operation,
      data: results[results.length - 1]?.result?.data,
      completedAt: new Date().toISOString()
    };
  }
  
  private async executeSystemStep(action: string, parameters: any, context: any) {
    // Handle system steps like extracting information from user input
    switch (action) {
      case 'extract_todo_details':
        // In a real implementation, this would use NLP to extract todo details
        return {
          success: true,
          data: {
            title: 'Sample Todo',
            description: 'This is a sample todo extracted from user input',
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'todo_status_not_started',
            priority: 'todo_priority_medium'
          }
        };
      case 'extract_todo_query':
        return {
          success: true,
          data: {
            search_term: 'sample'
          }
        };
      case 'extract_todo_id':
        return {
          success: true,
          data: {
            id: 'sample-id'
          }
        };
      case 'extract_todo_changes':
        return {
          success: true,
          data: {
            status: 'todo_status_in_progress'
          }
        };
      case 'extract_filter_criteria':
        return {
          success: true,
          data: {
            status: null,
            priority: null
          }
        };
      default:
        return {
          success: true,
          data: null
        };
    }
  }
}

// ========== Agent Orchestrator ==========
class AgentOrchestrator {
  private executiveAgent: ExecutiveAgent;
  private knowledgeAgent: KnowledgeAgent;
  private plannerAgent: PlannerAgent;
  private executorAgent: ExecutorAgent;
  private memoryManager: MemoryManager;
  private toolsManager: ToolsManager;
  private capabilityManager: CapabilityManager;

  constructor(private supabaseClient: any, options: any = {}) {
    console.log('AgentOrchestrator initialized');
    
    // Initialize core managers
    this.memoryManager = new MemoryManager();
    this.toolsManager = new ToolsManager();
    this.capabilityManager = new CapabilityManager();
    
    // Initialize tools
    if (this.supabaseClient) {
      const todoTools = new TodoTools(this.supabaseClient);
      todoTools.registerTools(this.toolsManager);
    }
    
    // Initialize specialized agents
    this.executiveAgent = new ExecutiveAgent(this.memoryManager, this.capabilityManager);
    this.knowledgeAgent = new KnowledgeAgent(this.memoryManager);
    this.plannerAgent = new PlannerAgent(this.memoryManager, this.capabilityManager);
    this.executorAgent = new ExecutorAgent(this.memoryManager, this.toolsManager);
  }

  async handleUserRequest(request: string, context: any = {}) {
    console.log(`Processing user request: ${request}`, context);
    
    try {
      // 1. Executive agent interprets the request
      const taskInterpretation = await this.executiveAgent.interpretTask(request);
      
      // 2. Knowledge agent gathers relevant information
      const relevantKnowledge = await this.knowledgeAgent.gatherKnowledge(
        taskInterpretation.taskDescription,
        taskInterpretation.requiredKnowledge
      );
      
      // 3. Planner agent creates execution plan
      const executionPlan = await this.plannerAgent.createPlan(
        taskInterpretation,
        relevantKnowledge
      );
      
      // 4. Create execution context
      const executionContext = {
        organisation_id: context.organisationId || 'default-org',
        member_id: context.memberId,
        assistantId: context.assistantId,
        user_request: request
      };
      
      // 5. Executor agent implements the plan
      const executionResult = await this.executorAgent.executePlan(
        executionPlan,
        executionContext
      );
      
      // 6. Executive agent synthesizes results for user
      const synthesizedResult = await this.executiveAgent.synthesizeResults(
        executionResult,
        taskInterpretation.userIntent
      );
      
      return {
        success: true,
        result: synthesizedResult.summary,
        details: synthesizedResult.result,
        requiredCapabilities: taskInterpretation.requiredCapabilities || []
      };
    } catch (error) {
      console.error('Error processing request:', error);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  async startAgenticLoop(initialJobs: any[] = []) {
    console.log(`Starting agentic loop with ${initialJobs.length} initial jobs`);
    
    return {
      status: 'running',
      jobsStarted: initialJobs.length
    };
  }
  
  async getCapabilityForAssistant(assistantId: string): Promise<string[]> {
    if (!this.supabaseClient || !assistantId) {
      return [];
    }
    
    try {
      // Get the assistant object from the database
      const { data, error } = await this.supabaseClient
        .from('objects')
        .select('metadata')
        .eq('id', assistantId)
        .eq('related_object_type_id', 'assistant')
        .single();
      
      if (error || !data) {
        console.error('Error getting assistant:', error);
        return [];
      }
      
      // Extract capabilities from metadata
      const capabilities = data.metadata?.capabilities || '';
      
      if (typeof capabilities === 'string') {
        return capabilities.split(',').map((c: string) => c.trim()).filter(Boolean);
      }
      
      if (Array.isArray(capabilities)) {
        return capabilities.filter(Boolean);
      }
      
      return [];
    } catch (error) {
      console.error('Error getting assistant capabilities:', error);
      return [];
    }
  }
}

function initializeAgentSystem(options: any = {}) {
  console.log('Initializing agent system with options:', options);
  return new AgentOrchestrator(options.supabaseClient, options);
}

async function processRequest(request: string, context: any = {}) {
  const orchestrator = initializeAgentSystem({
    supabaseClient: context.supabaseClient
  });
  
  return orchestrator.handleUserRequest(request, context);
}

async function createJob(jobDetails: any) {
  console.log('Creating job:', jobDetails);
  return {
    id: `job-${Date.now()}`,
    status: 'created'
  };
}

async function getJobStatus(jobId: string) {
  console.log('Getting job status:', jobId);
  return {
    id: jobId,
    status: 'pending'
  };
}

serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;
  
  try {
    let responseBody: any = { error: 'Unknown endpoint' };
    
    if (path === '/api/request') {
      const requestData = await req.json();
      responseBody = await processRequest(requestData.request, requestData.context);
    } else if (path === '/api/job') {
      const jobData = await req.json();
      responseBody = await createJob(jobData);
    } else if (path === '/api/job/status') {
      const { jobId } = await req.json();
      responseBody = await getJobStatus(jobId);
    }
    
    return new Response(JSON.stringify(responseBody), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}); 