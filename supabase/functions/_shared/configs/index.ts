// Interfaces
export interface FunctionResult<T = unknown> {
  status: number; // HTTP or custom status code
  data: T | null; // The data being returned, or null if there's none or an error
  message: string | null; // A message describing success or the error, or null if not applicable
  references: string | null; // A message describing success or the error, or null if not applicable
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

export async function inferOrganisation({ connection, dataIn, storageService }: { connection: string; dataIn: T, storageService: StorageService }): Promise<FunctionResult> {
  try {
    let organisationId;
    if (dataIn.companyMetadata && dataIn.companyMetadata.organisationId) {
      // See if organisationId already stored in dataIn (connections such as CSV upload support this)
      organisationId = dataIn.companyMetadata.organisationId;
    } else if (connection === "email") {
      // Infer organisationId from the domain of the sender if connection is email
      organisationId = dataIn.recipient.split("@")[0];
    } else if (connection === "productfruits") {
      const mappingResult = await storageService.getRow({table: "connection_organisation_mapping", keys: {connection: connection, connection_id: dataIn.data.projectCode}});
      organisationId = mappingResult.data.organisation_id;
    }

    if (organisationId) {
      const organisationDataResult = await storageService.getRow({table: "organisations", keys: {id: organisationId}});
      if (organisationDataResult.data) {
        console.log(`inferOrganisation successful with organisationId: ${organisationId}`)
        const result: FunctionResult = {
          status: 200,
          data: [organisationId, organisationDataResult.data],
        };
        return result;
      } else {
        throw new Error(`Unable to find organisationData for organisationId ${organisationId}`);
      }
    } else {
      throw new Error(`Unable to inferOrganisation from connection ${connection}`);
    }
  } catch (error) {
    const result: FunctionResult = {
      status: 500,
      message: `❌ ${error.message}`,
    };
    console.error(result.message);
    return result;
  }
}

// Enums
// export enum TriBool {
//   True,
//   False,
//   Unknown
// }

// Consts
export const CORS_OPTIONS = {
  origin: ["https://app.getathenic.com/","http://localhost:8000"],
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
export const VANILLA_SYSTEM_INSTRUCTION = `
You are a business data API assistant called Athenic, designed to process incoming business data, answer questions from the employees and do tasks on behalf of the business.
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
export const NLP_EMBEDDING_MODEL = "text-embedding-3-small";
export const NLP_EMBEDDING_CHUNK_SIZE = 8000; // OpenAI's text-embedding-3-small has a token limit
export const NLP_EMBEDDING_OVERLAP = 200;
export const NLP_EMBEDDING_RESPECT_SENTENCES = true;

export const OBJECT_TYPE_ID_CONNECTION = "connection";
export const OBJECT_TYPE_ID_MESSAGE_THREAD = "message_thread";
export const OBJECT_TYPE_ID_MESSAGE = "message";

export const OBJECT_METADATA_DEFAULT_TITLE = "title";
export const OBJECT_METADATA_DEFAULT_CREATED_AT = "created_at";

export const OBJECT_METADATA_TYPE_ID_MESSAGE_AUTHOR_ID = "author_id";
export const OBJECT_MESSAGE_AUTHOR_ID_VALUE_IF_COMPANY = "company";
