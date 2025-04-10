/**
 * Tools Manager
 * 
 * Manages the registration and execution of tools that agents can use
 * to interact with external systems and perform actions.
 */

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  type: string;
  required: boolean;
  enum?: string[];
  description?: string;
}

/**
 * Tool definition interface
 */
export interface ToolDefinition {
  id: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute?: (params: any) => Promise<any>;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * ToolsManager class
 * 
 * Provides a registry for tools and handles their execution.
 */
export class ToolsManager {
  private tools: Map<string, ToolDefinition> = new Map();
  private toolCategories: Record<string, string[]> = {
    web_interaction: [],
    data_processing: [],
    code_execution: [],
    file_operations: [],
    communication: [],
    database: []
  };

  /**
   * Register a new tool with the system
   * 
   * @param toolDefinition The tool definition to register
   * @param categories Optional categories to associate with the tool
   */
  registerTool(toolDefinition: ToolDefinition, categories: string[] = []): void {
    // Store the tool in the registry
    this.tools.set(toolDefinition.id, toolDefinition);
    
    // Associate tool with categories
    categories.forEach(category => {
      if (this.toolCategories[category]) {
        this.toolCategories[category].push(toolDefinition.id);
      }
    });
    
    // Auto-categorize if no categories provided
    if (categories.length === 0) {
      // Add to a default category based on tool ID/description
      if (toolDefinition.id.includes('browser') || toolDefinition.id.includes('web')) {
        this.toolCategories.web_interaction.push(toolDefinition.id);
      } else if (toolDefinition.id.includes('database')) {
        this.toolCategories.database.push(toolDefinition.id);
      } else if (toolDefinition.id.includes('file')) {
        this.toolCategories.file_operations.push(toolDefinition.id);
      }
    }
  }

  /**
   * Execute a tool with provided parameters
   * 
   * @param toolId The ID of the tool to execute
   * @param parameters Parameters to pass to the tool
   */
  async executeTool(toolId: string, parameters: any): Promise<ToolExecutionResult> {
    // Find the tool in the registry
    const tool = this.tools.get(toolId);
    
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolId}`
      };
    }
    
    // Validate parameters against tool definition
    const validationResult = this.validateParameters(tool, parameters);
    if (!validationResult.valid) {
      return {
        success: false,
        error: `Parameter validation failed: ${validationResult.error}`
      };
    }
    
    // Execute the tool if it has an execute function
    if (tool.execute) {
      try {
        const result = await tool.execute(parameters);
        return {
          success: true,
          result
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    } else {
      return {
        success: false,
        error: `Tool ${toolId} does not have an execution handler`
      };
    }
  }

  /**
   * Get tools by category
   * 
   * @param category The category to retrieve tools for
   * @returns Array of tool definitions
   */
  getToolsByCategory(category: string): ToolDefinition[] {
    const toolIds = this.toolCategories[category] || [];
    return toolIds.map(id => this.tools.get(id)!).filter(Boolean);
  }

  /**
   * Get a specific tool by ID
   * 
   * @param toolId The ID of the tool to retrieve
   * @returns The tool definition or undefined if not found
   */
  getTool(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all available tools
   * 
   * @returns Array of all tool definitions
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Validate parameters against tool definition
   * 
   * @param tool The tool definition
   * @param parameters The parameters to validate
   * @returns Validation result
   */
  private validateParameters(tool: ToolDefinition, parameters: any): { valid: boolean; error?: string } {
    // Check all required parameters are present
    for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
      if (paramDef.required && (parameters[paramName] === undefined || parameters[paramName] === null)) {
        return {
          valid: false,
          error: `Missing required parameter: ${paramName}`
        };
      }
      
      // If parameter is provided, validate its type
      if (parameters[paramName] !== undefined) {
        // Check enum values
        if (paramDef.enum && !paramDef.enum.includes(parameters[paramName])) {
          return {
            valid: false,
            error: `Parameter ${paramName} must be one of: ${paramDef.enum.join(', ')}`
          };
        }
        
        // Basic type checking
        if (paramDef.type === 'string' && typeof parameters[paramName] !== 'string') {
          return {
            valid: false,
            error: `Parameter ${paramName} must be a string`
          };
        } else if (paramDef.type === 'number' && typeof parameters[paramName] !== 'number') {
          return {
            valid: false,
            error: `Parameter ${paramName} must be a number`
          };
        } else if (paramDef.type === 'boolean' && typeof parameters[paramName] !== 'boolean') {
          return {
            valid: false,
            error: `Parameter ${paramName} must be a boolean`
          };
        } else if (paramDef.type === 'object' && (typeof parameters[paramName] !== 'object' || Array.isArray(parameters[paramName]))) {
          return {
            valid: false,
            error: `Parameter ${paramName} must be an object`
          };
        } else if (paramDef.type === 'array' && !Array.isArray(parameters[paramName])) {
          return {
            valid: false,
            error: `Parameter ${paramName} must be an array`
          };
        }
      }
    }
    
    return { valid: true };
  }
} 