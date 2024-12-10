// Interfaces
export interface FunctionResult<T = unknown> {
  status: number; // HTTP or custom status code
  data: T | null; // The data being returned, or null if there's none or an error
  message: string | null; // A message describing success or the error, or null if not applicable
}

// Functions
// stringify function works even if item is not an object (just returns original) or if partially circular (just discards that part)
export function stringify(obj: any): string {
  // Check if the input is not an object or is null
  if (typeof obj !== "object" || obj === null) {
    // Directly return the stringified representation of non-object types
    return String(obj);
  }

  let cache: any[] = [];
  let str = JSON.stringify(obj, function (key, value) {
    if (typeof value === "object" && value !== null) {
      if (cache.indexOf(value) !== -1) {
        // Circular reference found, discard key
        return;
      }
      // Store value in our collection
      cache.push(value);
    }
    return value;
  });
  cache = null; // reset the cache
  return str;
}

// Enums
// export enum TriBool {
//   True,
//   False,
//   Unknown
// }

// Consts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
export const VANILLA_SYSTEM_INSTRUCTION =
`You are a business data API assistant called Athenic, designed to process incoming business data, answer questions from the employees and do tasks on behalf of the business.
Bear in mind how we are defining the following terms:
"organisation" = a business that uses Athenic to help them (e.g. Yahoo, Microsoft, Braun, Nike, Pepsi,...)
"member" = a member, typically an employee, of the organisation who uses Athenic to help them (eg. a Yahoo employee)
"user" = a user/customer of the organisation's product(s)
"object" = a piece of data stored in the organisation's DB (database)
"product" = a type of object, a product is an app/product/brand that the organisation owns and wants to improve (eg. Yahoo Finance)
`;
export const SLACK_REDIRECT_URI = "https://gvblzovvpfeepnhifwqh.supabase.co/functions/v1/auth/slack"
// export const NLP_MODELS_LITE = ["microsoft/phi-3-medium-128k-instruct:free", "gpt-4o-mini"];
// export const NLP_MODELS_FULL = ["microsoft/phi-3-medium-128k-instruct:free", "gpt-4o"];
// export const NLP_MODELS_LITE = ["meta-llama/llama-3.2-11b-vision-instruct:free", "microsoft/phi-3-medium-128k-instruct:free", "microsoft/phi-3-mini-128k-instruct:free"];
// export const NLP_MODELS_FULL = ["meta-llama/llama-3.2-11b-vision-instruct:free", "microsoft/phi-3-medium-128k-instruct:free", "microsoft/phi-3-mini-128k-instruct:free"];
export const NLP_MODELS_LITE = ["gpt-4o-mini"];
export const NLP_MODELS_FULL = ["gpt-4o-mini"];