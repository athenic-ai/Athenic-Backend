/**
 * Type declarations for Supabase
 */

// Simple declaration for the supabase client
declare module '@supabase/supabase-js' {
  export interface SupabaseClient {
    from: (table: string) => {
      insert: (data: any) => Promise<{ data: any; error: any }>;
      select: (columns?: string) => any;
      update: (data: any) => any;
      delete: () => any;
      eq: (column: string, value: any) => any;
      // Add other methods as needed
    };
    
    // Add other Supabase methods as needed
  }
  
  export function createClient(url: string, key: string): SupabaseClient;
} 