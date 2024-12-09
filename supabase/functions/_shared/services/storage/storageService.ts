import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as config from "../../configs/index.ts";

type WhereCondition = {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in';
  value: any;
};

type OrderByCondition = {
  column: string;
  ascending?: boolean; // Defaults to true if not provided
};

type GetRowsOptions = {
  whereAndConditions?: WhereCondition[]; // All conditions must be true
  whereOrConditions?: WhereCondition[]; // At least one condition must be true
  orderByConditions?: OrderByCondition[];
  limitCount?: number;
};

export class StorageService {
  private supabase: SupabaseClient;

  constructor({ accessToken }: { accessToken?: string | null } = {}) {
    console.log("Initialising Supabase client");
    // Initialise Supabase client
    try {
      console.log(`A: ${Deno.env.get('SUPABASE_URL')}`);
      console.log(`B: ${Deno.env.get('SUPABASE_ANON_KEY')}}`)
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
      console.log(`Getting row from table: ${table} with keys: ${JSON.stringify(keys)}`);
  
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
  
      console.log(result.message);
      return result;
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: `Error in getRow: ${error.message}`,
      };
      console.error(result.message);
      return result;
    }
  }
  
  async getRows(
    table: string, 
    options: GetRowsOptions = {}
  ): Promise<any[]> {
    try {
      const { 
        whereAndConditions = [], // If included, all of those params must be true
        whereOrConditions = [], // If included, at least one of those must be true
        orderByConditions = [], // Eg. orderByConditions: [{ column: 'created_at', ascending: false }],
        limitCount = null // Eg. limitCount: 10,
      } = options;
    
      console.log(`getRows called with table: ${table}, options: ${JSON.stringify(options)}`);
      let query = this.supabase.from(table).select('*');
    
      // Apply "AND" conditions
      whereAndConditions.forEach((condition) => {
        query = query[condition.operator](condition.column, condition.value);
      });
    
      // Apply "OR" conditions
      if (whereOrConditions.length > 0) {
        const orQuery = whereOrConditions
          .map((condition) => `${condition.column}.${condition.operator}.${condition.value}`)
          .join(',');
        query = query.or(orQuery);
      }
    
      // Apply "orderBy" conditions
      orderByConditions.forEach((condition) => {
        query = query.order(condition.column, { ascending: condition.ascending ?? true });
      });
    
      // Apply "limit" if provided
      if (limitCount) {
        query = query.limit(limitCount);
      }
  
      console.log(`Ready to execute query: ${JSON.stringify(query)}`);
    
      const { data, error } = await query;
  
      console.log(`getRows result: ${JSON.stringify(data)}`);
    
      if (error) {
        console.error('Error fetching rows:', error);
        throw error;
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
        message: `Error in getRows: ${error.message}`,
      };
      console.error(result.message);
      return result;
    }
  }

  async updateRow({ table, keys, rowData, mayBeNew = false }: { 
    table: string; 
    keys: Record<string, any>; // Object where keys are column names and values are their corresponding values
    rowData: any; 
    mayBeNew?: boolean; // Optional parameter with a default value
  } = {
    mayBeNew: false, // Default value if not provided
  }) {
    try {  
      console.log(
        `Processing row in table: ${table} with keys: ${JSON.stringify(keys)}, ` +
        `data: ${JSON.stringify(rowData)}, mayBeNew: ${mayBeNew}`
      );
  
      const queryBuilder = this.supabase.from(table);
  
      if (mayBeNew) {
        // Perform an upsert (only doing if mayBeNew, as upsert doesn't support only updating some columns)
        const { error } = await queryBuilder.upsert({ ...keys, ...rowData });
  
        if (error) {
          throw error;
        }
        console.log(`Row upserted successfully in table: ${table}`);
      } else {
        // Perform an update
        let query = queryBuilder.update(rowData);
        for (const [key, value] of Object.entries(keys)) {
          query = query.eq(key, value);
        }
  
        const { error } = await query;
        if (error) {
          throw error;
        }
        console.log(`Row updated successfully in table: ${table}`);
      }
  
      const result: FunctionResult = {
        status: 200,
        message: "Row processed successfully"
      };
      return result;
    } catch (error) {
      console.error("Error in updateOrUpsertRow:", error);
      const result: FunctionResult = {
        status: 500,
        message: "Error processing row: " + error.message,
      };
      return result;
    }
  }  

  
}
