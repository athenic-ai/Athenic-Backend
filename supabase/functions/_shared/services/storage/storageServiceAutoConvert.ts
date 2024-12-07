// import { createClient, SupabaseClient } from "@supabase/supabase-js";

// export class StorageService {
//   private supabase: SupabaseClient;

//   constructor() {
//     // Initialize Supabase client
//     const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
//     const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

//     if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
//       throw new Error("Supabase URL or Anon Key is not set.");
//     }

//     this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
//   }

//   async getCol(colPath: string) {
//     try {
//       console.log(`Fetching collection at path: ${colPath}`);
//       const { data, error } = await this.supabase.from(colPath).select("*");

//       if (error) {
//         console.error("Error fetching collection:", error);
//         throw error;
//       }

//       return data || [];
//     } catch (error) {
//       console.error("Error in getCol:", error);
//       throw error;
//     }
//   }

//   async getDoc(docPath: string) {
//     try {
//       console.log(`Fetching document at path: ${docPath}`);
//       const [table, id] = docPath.split("/");
//       const { data, error } = await this.supabase.from(table).select("*").eq("id", id).single();

//       if (error) {
//         console.error("Error fetching document:", error);
//         return null;
//       }

//       return data;
//     } catch (error) {
//       console.error("Error in getDoc:", error);
//       throw error;
//     }
//   }

//   async getColDocs(
//     colPath: string,
//     options: { whereConditions?: { field: string; operator: string; value: any }[]; orderByConditions?: { field: string; direction: "asc" | "desc" }[]; limitCount?: number }
//   ) {
//     try {
//       let query = this.supabase.from(colPath).select("*");

//       if (options.whereConditions) {
//         options.whereConditions.forEach((condition) => {
//           if (condition.operator === "!=") {
//             query = query.not(condition.field, "is", condition.value);
//           } else {
//             query = query.filter(condition.field, condition.operator, condition.value);
//           }
//         });
//       }

//       if (options.orderByConditions) {
//         options.orderByConditions.forEach((condition) => {
//           query = query.order(condition.field, { ascending: condition.direction === "asc" });
//         });
//       }

//       if (options.limitCount) {
//         query = query.limit(options.limitCount);
//       }

//       const { data, error } = await query;
//       if (error) {
//         console.error("Error fetching collection documents:", error);
//         throw error;
//       }

//       return data || [];
//     } catch (error) {
//       console.error("Error in getColDocs:", error);
//       throw error;
//     }
//   }

//   async updateDoc(docPath: string, docData: any) {
//     try {
//       console.log(`Updating document at path: ${docPath} with data: ${JSON.stringify(docData)}`);
//       const [table, id] = docPath.split("/");
//       const { error } = await this.supabase.from(table).update(docData).eq("id", id);

//       if (error) {
//         console.error("Error updating document:", error);
//         throw error;
//       }

//       console.log(`Document updated successfully at path: ${docPath}`);
//       return true;
//     } catch (error) {
//       console.error("Error in updateDoc:", error);
//       throw error;
//     }
//   }

//   async getProductProjectDocs(options: { organisationId: string; productName: string; getAll?: boolean; includeUnknown?: number }) {
//     try {
//       const { organisationId, productName, getAll = true, includeUnknown = 0 } = options;
//       const colPath = `organisations/${organisationId}/projects`;

//       const whereConditions = [
//         { field: "relatedProduct", operator: "eq", value: productName },
//       ];

//       const orderByConditions = [
//         { field: "id", direction: "desc" },
//       ];

//       const projects = await this.getColDocs(colPath, { whereConditions, orderByConditions });

//       if (includeUnknown >= 2 || (includeUnknown >= 1 && projects.length === 0)) {
//         const unknownProject = await this.getDoc(`${colPath}/unknown`);
//         if (unknownProject) {
//           projects.push(unknownProject);
//         }
//       }

//       return getAll ? projects : projects[0] || null;
//     } catch (error) {
//       console.error("Error in getProductProjectDocs:", error);
//       throw error;
//     }
//   }
// }
