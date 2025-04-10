/**
 * Mock implementation of the Supabase client for testing
 */

export class SupabaseMock {
  private mockData: Record<string, any[]> = {
    // Add default mock data for different tables
    'organisations': [],
    'object_types': [],
    'object_metadata_types': [],
    'objects': [],
    'field_types': [],
    'dictionary_terms': [],
    'members': [],
  };

  private mockRpcResults: Record<string, any> = {};

  /**
   * Set mock data for a table
   */
  setMockData(table: string, data: any[]) {
    this.mockData[table] = [...data];
    return this;
  }

  /**
   * Set mock RPC function result
   */
  setMockRpcResult(funcName: string, result: any) {
    this.mockRpcResults[funcName] = result;
    return this;
  }

  /**
   * Create a Supabase client mock
   */
  createClient() {
    // Mock query builder with properly scoped variables
    const self = this;
    const queryBuilder = {
      data: null as any[] | null,
      error: null as Error | null,
      select: function() { return this; },
      eq: function() { return this; },
      neq: function() { return this; },
      gt: function() { return this; },
      gte: function() { return this; },
      lt: function() { return this; },
      lte: function() { return this; },
      like: function() { return this; },
      ilike: function() { return this; },
      is: function() { return this; },
      in: function() { return this; },
      or: function() { return this; },
      order: function() { return this; },
      limit: function() { return this; },
      single: function() {
        return { data: this.data?.[0] || null, error: this.error };
      },
      then: function(resolve: (value: { data: any; error: any }) => void) {
        resolve({ data: this.data, error: this.error });
        return Promise.resolve({ data: this.data, error: this.error });
      },
    };

    // Main client mock
    const mockClient = {
      from: function(table: string) {
        queryBuilder.data = self.mockData[table] || [];
        return queryBuilder;
      },

      rpc: function(funcName: string, params: any) {
        const result = self.mockRpcResults[funcName] || null;
        return Promise.resolve({ data: result, error: null });
      },

      // Extend with more mocked methods as needed
    };

    return mockClient;
  }
}

export default SupabaseMock; 