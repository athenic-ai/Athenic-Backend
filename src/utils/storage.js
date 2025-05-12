/**
 * Storage service for interacting with Supabase database
 */
export class StorageService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient 
   */
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Get a row by ID from a table
   * @param {object} params 
   * @param {string} params.table - Table name
   * @param {object} params.keys - Keys to match (e.g., { id: 'abc-123' })
   */
  async getRow({ table, keys }) {
    try {
      let query = this.supabase.from(table).select('*');
      
      // Add filters for each key
      Object.entries(keys).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      
      const { data, error } = await query.single();
      
      if (error) {
        console.error(`Error getting row from ${table}:`, error);
        return { status: 404, message: error.message };
      }
      
      return { status: 200, data };
    } catch (error) {
      console.error(`Error in getRow for ${table}:`, error);
      return { status: 500, message: error.message };
    }
  }

  /**
   * Insert or update a row in a table
   * @param {object} params 
   * @param {string} params.table - Table name
   * @param {object} params.rowData - Data to insert/update
   * @param {boolean} [params.mayAlreadyExist=false] - Whether the row may already exist
   */
  async updateRow({ table, rowData, mayAlreadyExist = false }) {
    try {
      let result;
      
      if (mayAlreadyExist) {
        // Update if exists, or insert if not
        const { data, error } = await this.supabase
          .from(table)
          .upsert(rowData)
          .select();
        
        result = { data: data?.[0], error };
      } else {
        // New row, just insert
        const { data, error } = await this.supabase
          .from(table)
          .insert(rowData)
          .select();
        
        result = { data: data?.[0], error };
      }
      
      if (result.error) {
        console.error(`Error updating row in ${table}:`, result.error);
        return { status: 400, message: result.error.message };
      }
      
      return { status: 200, data: result.data };
    } catch (error) {
      console.error(`Error in updateRow for ${table}:`, error);
      return { status: 500, message: error.message };
    }
  }

  /**
   * Delete a row from a table
   * @param {object} params 
   * @param {string} params.table - Table name
   * @param {object} params.keys - Keys to match (e.g., { id: 'abc-123' })
   */
  async deleteRow({ table, keys }) {
    try {
      let query = this.supabase.from(table).delete();
      
      // Add filters for each key
      Object.entries(keys).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      
      const { error } = await query;
      
      if (error) {
        console.error(`Error deleting row from ${table}:`, error);
        return { status: 400, message: error.message };
      }
      
      return { status: 200, message: `Row successfully deleted from ${table}` };
    } catch (error) {
      console.error(`Error in deleteRow for ${table}:`, error);
      return { status: 500, message: error.message };
    }
  }
} 