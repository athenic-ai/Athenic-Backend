/**
 * Todo Management Tools
 * 
 * Provides tools for creating, reading, updating, and deleting todo objects
 * in the database. These tools are registered with the ToolsManager and used
 * by the agent system when handling todo-related requests.
 */

export interface TodoData {
  title: string;
  description?: string;
  due_date?: string;
  status: string;
  priority?: string;
}

export interface TodoFilter {
  status?: string;
  priority?: string;
  due_before?: string;
  due_after?: string;
  search_term?: string;
}

export class TodoTools {
  constructor(private supabaseClient: any) {}

  /**
   * Register all todo-related tools with the ToolsManager
   */
  registerTools(toolsManager: any) {
    toolsManager.registerTool({
      id: 'todo_create',
      name: 'Create Todo',
      description: 'Creates a new todo item',
      execute: this.createTodo.bind(this)
    });

    toolsManager.registerTool({
      id: 'todo_read',
      name: 'Read Todo',
      description: 'Retrieves a specific todo by ID',
      execute: this.readTodo.bind(this)
    });

    toolsManager.registerTool({
      id: 'todo_update',
      name: 'Update Todo',
      description: 'Updates an existing todo',
      execute: this.updateTodo.bind(this)
    });

    toolsManager.registerTool({
      id: 'todo_delete',
      name: 'Delete Todo',
      description: 'Deletes a todo',
      execute: this.deleteTodo.bind(this)
    });

    toolsManager.registerTool({
      id: 'todo_list',
      name: 'List Todos',
      description: 'Lists todos with optional filtering',
      execute: this.listTodos.bind(this)
    });
  }

  /**
   * Creates a new todo
   */
  async createTodo(params: { organisation_id: string; member_id?: string; data: TodoData }) {
    const { organisation_id, member_id, data } = params;

    // Validate required fields
    if (!data.title) {
      return { success: false, error: 'Todo title is required' };
    }

    // Set default values
    const todoData: TodoData = {
      title: data.title,
      description: data.description || '',
      status: data.status || 'todo_status_not_started',
      priority: data.priority || 'todo_priority_medium',
      due_date: data.due_date
    };

    // Create the todo object
    const { data: todoObject, error } = await this.supabaseClient
      .from('objects')
      .insert({
        related_object_type_id: 'todo',
        owner_organisation_id: organisation_id,
        owner_member_id: member_id || null,
        metadata: {
          title: todoData.title,
          description: todoData.description,
          status: todoData.status,
          priority: todoData.priority,
          due_date: todoData.due_date,
          created_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: todoObject };
  }

  /**
   * Reads a specific todo by ID
   */
  async readTodo(params: { id: string; organisation_id: string }) {
    const { id, organisation_id } = params;

    const { data, error } = await this.supabaseClient
      .from('objects')
      .select('*')
      .eq('id', id)
      .eq('related_object_type_id', 'todo')
      .eq('owner_organisation_id', organisation_id)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  }

  /**
   * Updates an existing todo
   */
  async updateTodo(params: { id: string; organisation_id: string; data: Partial<TodoData> }) {
    const { id, organisation_id, data } = params;

    // Get the current todo data
    const { data: todoObject, error: fetchError } = await this.supabaseClient
      .from('objects')
      .select('*')
      .eq('id', id)
      .eq('related_object_type_id', 'todo')
      .eq('owner_organisation_id', organisation_id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    // Merge the current metadata with the updated data
    const updatedMetadata = {
      ...todoObject.metadata,
      ...data
    };

    // Update the todo object
    const { data: updatedTodo, error } = await this.supabaseClient
      .from('objects')
      .update({ metadata: updatedMetadata })
      .eq('id', id)
      .eq('related_object_type_id', 'todo')
      .eq('owner_organisation_id', organisation_id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: updatedTodo };
  }

  /**
   * Deletes a todo
   */
  async deleteTodo(params: { id: string; organisation_id: string }) {
    const { id, organisation_id } = params;

    const { error } = await this.supabaseClient
      .from('objects')
      .delete()
      .eq('id', id)
      .eq('related_object_type_id', 'todo')
      .eq('owner_organisation_id', organisation_id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Lists todos with optional filtering
   */
  async listTodos(params: { organisation_id: string; member_id?: string; filter?: TodoFilter }) {
    const { organisation_id, member_id, filter = {} } = params;

    // Start building the query
    let query = this.supabaseClient
      .from('objects')
      .select('*')
      .eq('related_object_type_id', 'todo')
      .eq('owner_organisation_id', organisation_id);

    // Apply member-specific filter if provided
    if (member_id) {
      query = query.eq('owner_member_id', member_id);
    }

    // Apply filters
    if (filter.status) {
      query = query.filter('metadata->status', 'eq', filter.status);
    }

    if (filter.priority) {
      query = query.filter('metadata->priority', 'eq', filter.priority);
    }

    if (filter.due_before) {
      query = query.filter('metadata->due_date', 'lte', filter.due_before);
    }

    if (filter.due_after) {
      query = query.filter('metadata->due_date', 'gte', filter.due_after);
    }

    if (filter.search_term) {
      // This is a simple text search - could be enhanced with vector search for better results
      query = query.filter('metadata->title', 'ilike', `%${filter.search_term}%`);
    }

    // Execute the query
    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  }
} 