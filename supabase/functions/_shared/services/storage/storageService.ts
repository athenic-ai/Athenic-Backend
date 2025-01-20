import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as config from "../../configs/index.ts";
import { NlpService } from "../nlp/nlpService.ts";

type JsonPath = string[]; // e.g. ['metadata', 'id'] represents metadata->>'id'

type WhereCondition = {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in';
  value: any;
  jsonPath?: JsonPath; // Optional path for JSON/JSONB columns
};

type OrderByCondition = {
  column: string;
  ascending?: boolean; // Defaults to true if not provided
  jsonPath?: JsonPath; // Optional path for JSON/JSONB columns
};

type GetRowsOptions = {
  whereAndConditions?: WhereCondition[]; // All conditions must be true
  whereOrConditions?: WhereCondition[]; // At least one condition must be true
  orderByConditions?: OrderByCondition[];
  limitCount?: number;
};

export class StorageService {
  private supabase: SupabaseClient;

  constructor(
    {
      accessToken,
    }: { accessToken?: string | null } = {}
  ) {
    console.log("Initialising Supabase client");
    // Initialise Supabase client
    try {
      const authJtw = accessToken ? accessToken : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); // JWT token here. Prefer to use user-specific one if passed for RLS, otherwise using master key. Context: https://supabase.com/docs/guides/auth/jwts
      this.supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${authJtw}` } } } 
      )
    } catch (error) {
      console.error("Error initialising Supabase client:", error);
    }
  }

  async getRow({ table, keys }: { 
    table: string; 
    keys: Record<string, any>; // Object where keys are column names and values are their corresponding values
  }) {
    try {  
      // Validate input
      if (!table || Object.keys(keys).length === 0) {
        throw new Error("Table name and at least one key are required.");
      }
  
      // Apply filters dynamically using the .eq method
      let query = this.supabase.from(table).select("*");
      for (const [column, value] of Object.entries(keys)) {
        query = query.eq(column, value);
      }
  
      const { data: rowData, error } = await query.single(); // Use .single() to ensure one row is returned
  
      if (error) {
        throw error;
      }
  
      const result: FunctionResult = {
        status: 200,
        data: rowData,
        message: "Row retrieved successfully",
      };
      return result;
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: `❌ Error in getRow: ${error.message}`,
      };
      console.error(result.message);
      return result;
    }
  }
  
  async getRows(
    table: string, 
    options: GetRowsOptions = {}
  ): Promise<FunctionResult> {
    try {
      const { 
        whereAndConditions = [], // If included, all of those params must be true
        whereOrConditions = [], // If included, at least one of those must be true
        orderByConditions = [], // Eg. orderByConditions: [{ column: 'created_at', ascending: false }],
        limitCount = null // Eg. limitCount: 10,
      } = options;
    
      let query = this.supabase.from(table).select('*');
    
      // Helper function to format column path for JSON/JSONB queries
      const formatColumnPath = (condition: WhereCondition | OrderByCondition): string => {
        if (!condition.jsonPath?.length) {
          return condition.column;
        }
        
        // For JSON/JSONB columns, we need to use the -> operator for nested access
        // and ->> for the final value to get it as text
        const path = condition.jsonPath;
        return `${condition.column}${path.map((key, index) => 
          index === path.length - 1 ? `->>'${key}'` : `->'${key}'`
        ).join('')}`;
      };
  
      // Apply "AND" conditions
      whereAndConditions.forEach((condition) => {
        const columnPath = formatColumnPath(condition);
        query = query[condition.operator](columnPath, condition.value);
      });
    
      // Apply "OR" conditions
      if (whereOrConditions.length > 0) {
        const orQuery = whereOrConditions
          .map((condition) => {
            const columnPath = formatColumnPath(condition);
            return `${columnPath}.${condition.operator}.${condition.value}`;
          })
          .join(',');
        query = query.or(orQuery);
      }
    
      // Apply "orderBy" conditions
      orderByConditions.forEach((condition) => {
        const columnPath = formatColumnPath(condition);
        query = query.order(columnPath, { ascending: condition.ascending ?? true });
      });
    
      // Apply "limit" if provided
      if (limitCount) {
        query = query.limit(limitCount);
      }
      
      const { data, error } = await query;
      
      if (error) {
        throw Error(`Error fetching rows: ${error.message}`);
      }
    
      const result: FunctionResult = {
        status: 200,
        data: data,
        message: "Rows retrieved successfully",
      };
      return result;
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: `❌ Error in getRows: ${error.message}`,
      };
      console.error(result.message);
      return result;
    }
  }

  async searchRows({ 
    table, 
    queryText, 
    matchThreshold,
    matchCount,
    nlpService,
    organisationId, 
    memberId,
    relatedObjectTypeId,
  }: { 
    table: string;
    queryText: string;
    matchThreshold?: number;
    matchCount?: integer;
    nlpService: NlpService;
    organisationId?: string;
    memberId?: string;
    relatedObjectTypeId?: string;
  }): Promise<FunctionResult> {
    try {
      // Generate the embedding for the query text
      const embeddingRes = await nlpService.generateTextEmbedding(queryText);
      if (embeddingRes.status !== 200) {
          throw new Error(embeddingRes.message || "Error embedding data.");
      }
      const queryEmbedding = embeddingRes.data;

      if (!matchThreshold || matchThreshold < -1 || matchThreshold > 1) {
        matchThreshold = 0.2; // Set default value if not specified or not within valid range
      }
      if (!matchCount || matchCount < 0 || matchCount > config.MAX_SEARCH_RESULTS) {
        matchCount = config.MAX_SEARCH_RESULTS; // Set default value if not specified or not within valid range
      }

      // Query the database using the stored procedure
      const { data, error } = await this.supabase.rpc('match_table_rows', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        search_table_name: table,
        filter_org_id: organisationId || null, // If included, gets only rows for that organisation or null. If null, gets rows where null
        filter_member_id: memberId || null, // If included, gets only rows for that organisation or null. If null, gets rows where null
        required_object_type_id: relatedObjectTypeId || null // If included, gets only rows for that object type or null. If null, gets all rows
      });

      if (error) {
        throw new Error(`Database query failed: ${error.message}`);
      }

      const result: FunctionResult = {
        status: 200,
        data: data,
        message: "Row search successful",
      };
      return result;
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: `❌ Error in searchRows: ${error.message}`,
      };
      console.error(result.message);
      return result;
    }
  }    

  async updateRow({
    table,
    keys,
    rowData,
    nlpService,
    mayAlreadyExist = false, // Defaults to false
  }: {
    table: string;
    keys: Record<string, any>; // Object where keys are column names and values are their corresponding values
    rowData: any;
    nlpService: any
    mayAlreadyExist?: boolean;
  }) {
    try {
      // Validate input
      if (!table || Object.keys(keys).length === 0) {
        throw new Error("Table name and at least one key are required.");
      }
  
      let existingRow = null;
  
      if (mayAlreadyExist) {
        const result = await this.getRow({ table, keys });
        if (result.status === 200) {
          existingRow = result.data;
        } else if (result.status !== 404) {
          throw new Error(result.message || "Error fetching existing row.");
        }
      }
  
      // Merge with overwrite fields specified directly
      let mergedRowData = existingRow 
      ? this.mergeData({
          existing: existingRow,
          incoming: rowData,
          overwriteFields: ['embedding']
        }) 
      : { ...keys, ...rowData };

      const currentDate = new Date().toISOString(); // Current date and time in ISO format
      if (!existingRow) {
        mergedRowData.metadata.created_at = currentDate; // Add created_at if not already set
      } else {
        mergedRowData.metadata.updated_at = currentDate; // Add or update updated_at based on created_at existence
      }

      // Generate embeddings value (guide: https://supabase.com/docs/guides/ai/vector-columns)
      const embeddingRes = await nlpService.addEmbeddingToObject(mergedRowData);
      if (embeddingRes.status != 200) {
        throw new Error(embeddingRes.message || "Error embedding data.");
      }
      mergedRowData = embeddingRes.data;
  
      // Perform upsert with the merged data
      const queryBuilder = this.supabase.from(table);
      const { error } = await queryBuilder.upsert(mergedRowData);
  
      if (error) {
        throw error;
      }

      const result: FunctionResult = {
        status: 200,
        message: "Row processed successfully"
      };
      return result;
    } catch (error) {
      console.error("Error in updateRow:", error);
      const result: FunctionResult = {
        status: 500,
        message: "❌ Error processing row: " + error.message,
      };
      return result;
    }
  }

  /**
   * Merges two objects with support for specifying fields that should be overwritten
   * @param existing - The existing object to merge into
   * @param incoming - The incoming object with new values
   * @param overwriteFields - Array of field paths that should be overwritten instead of merged (can also do inner keys like ['user.preferences'])
   * @param currentPath - Internal parameter for tracking nested object paths
   * @returns The merged result
   */
  mergeData({
    existing,
    incoming,
    overwriteFields = [],
    currentPath = ''
  }: {
    existing: any;
    incoming: any;
    overwriteFields?: string[];
    currentPath?: string;
  }): any {
    // If the current path is in overwriteFields, overwrite instead of merging
    if (overwriteFields.includes(currentPath)) {
      return incoming;
    }
  
    if (Array.isArray(existing) && Array.isArray(incoming)) {
      // Merge arrays: combine unique values
      return Array.from(new Set([...existing, ...incoming]));
    } else if (
      typeof existing === 'object' && existing !== null &&
      typeof incoming === 'object' && incoming !== null
    ) {
      // Merge objects recursively
      const merged = { ...existing };
      for (const [key, value] of Object.entries(incoming)) {
        // Build the path for nested properties
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        merged[key] = this.mergeData({
          existing: existing[key],
          incoming: value,
          overwriteFields,
          currentPath: newPath
        });
      }
      return merged;
    }
  
    // Overwrite for non-object, non-array fields
    return incoming;
  }
}
