/**
 * Memory Manager
 * 
 * Manages both short-term and long-term memory for the agent system.
 * Provides persistent storage of context, knowledge, and state across operations.
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * MemoryManager class
 * 
 * Responsible for storing and retrieving information across agent operations.
 * Provides different memory types with appropriate retention policies.
 */
export class MemoryManager {
  constructor(
    private supabaseClient: SupabaseClient,
    private organizationId: string
  ) {}

  /**
   * Store information in short-term working memory
   * 
   * @param key Unique identifier for the data
   * @param data The data to store
   * @param ttl Time to live in milliseconds (optional)
   */
  async storeWorkingMemory(key: string, data: any, ttl?: number): Promise<void> {
    // Create memory object in the objects table
    await this.supabaseClient
      .from('objects')
      .upsert({
        related_object_type_id: 'agent_working_memory',
        owner_organisation_id: this.organizationId,
        metadata: {
          title: `Memory: ${key}`,
          created_at: new Date().toISOString(),
          key: key,
          data: data,
          expires_at: ttl ? new Date(Date.now() + ttl).toISOString() : null
        }
      });
  }

  /**
   * Retrieve information from short-term working memory
   * 
   * @param key Unique identifier for the data
   * @returns The stored data or null if not found/expired
   */
  async retrieveWorkingMemory(key: string): Promise<any> {
    const currentTime = new Date().toISOString();
    
    const { data, error } = await this.supabaseClient
      .from('objects')
      .select('metadata')
      .eq('related_object_type_id', 'agent_working_memory')
      .eq('owner_organisation_id', this.organizationId)
      .eq('metadata->key', key)
      .or(`metadata->expires_at.is.null,metadata->expires_at.gt.${currentTime}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) return null;
    return data?.metadata?.data;
  }

  /**
   * Store information in long-term memory
   * 
   * @param concept Descriptive label for the data
   * @param data The data to store
   */
  async storeLongTermMemory(concept: string, data: any): Promise<void> {
    // Generate an embedding for semantic retrieval
    const embedding = await this.generateEmbedding(concept + ' ' + JSON.stringify(data));

    // Create memory object in the objects table
    await this.supabaseClient
      .from('objects')
      .upsert({
        related_object_type_id: 'agent_long_term_memory',
        owner_organisation_id: this.organizationId,
        metadata: {
          title: `Memory: ${concept.substring(0, 50)}`,
          created_at: new Date().toISOString(),
          concept: concept,
          data: data,
          embedding: embedding
        },
        embedding: embedding
      });
  }

  /**
   * Search long-term memory using semantic similarity
   * 
   * @param query The search query
   * @param limit Maximum number of results to return
   * @returns Array of matching memory items
   */
  async searchLongTermMemory(query: string, limit: number = 5): Promise<any[]> {
    // Generate embedding for the query
    const queryEmbedding = await this.generateEmbedding(query);

    // Search using vector similarity via the stored procedure
    const { data, error } = await this.supabaseClient.rpc(
      'match_agent_memories',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: limit,
        p_organization_id: this.organizationId
      }
    );

    if (error) return [];
    return data || [];
  }

  /**
   * Store episodic memory of a completed execution
   * 
   * @param executionContext The execution context to store
   */
  async storeExecution(executionContext: any): Promise<void> {
    await this.supabaseClient
      .from('objects')
      .insert({
        related_object_type_id: 'agent_execution',
        owner_organisation_id: this.organizationId,
        metadata: {
          title: `Execution: ${executionContext.id.substring(0, 8)}`,
          created_at: new Date().toISOString(),
          execution_id: executionContext.id,
          context: executionContext,
          status: executionContext.status
        }
      });
  }

  /**
   * Retrieve a past execution by ID
   * 
   * @param executionId The ID of the execution to retrieve
   * @returns The execution context or null if not found
   */
  async retrieveExecution(executionId: string): Promise<any> {
    const { data, error } = await this.supabaseClient
      .from('objects')
      .select('metadata')
      .eq('related_object_type_id', 'agent_execution')
      .eq('owner_organisation_id', this.organizationId)
      .eq('metadata->execution_id', executionId)
      .single();

    if (error) return null;
    return data?.metadata?.context;
  }

  /**
   * Generate embedding for text using AI model
   * 
   * @param text The text to generate embedding for
   * @returns Vector embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // TODO: Replace with actual embedding generation using OpenAI or similar
    // This is a placeholder that creates a random embedding vector
    return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
  }
} 