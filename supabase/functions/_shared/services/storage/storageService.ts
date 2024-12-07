import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as config from "../../configs/index.ts";

export class StorageService {
  private supabase: SupabaseClient;

  constructor(params: {accessToken: string}) {
    console.log("Initialising Supabase client");
    // Initialise Supabase client
    try {
      console.log(`A: ${Deno.env.get('SUPABASE_URL')}`);
      console.log(`B: ${Deno.env.get('SUPABASE_ANON_KEY')}}`)
      this.supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${params.accessToken}` } } } // Passing the JWT token here. Context: https://supabase.com/docs/guides/auth/jwts
      )
    } catch (error) {
      console.error("Error initialising Supabase client:", error);
    }
  }

  async updateRow(params: { 
    table: string; 
    keys: Record<string, any>; // Object where keys are column names and values are their corresponding values
    rowData: any; 
    mayBeNew?: boolean; // Optional parameter with a default value
  } = {
    mayBeNew: false, // Default value if not provided
  }) {
    try {
      const { table, keys, rowData, mayBeNew = false } = params; // Apply default value here too
  
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
  
      const result: FunctionResult = { status: 200 };
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
