import { EcommerceService } from "../services/ecommerce/ecommerceService.ts";
import * as Sentry from 'https://deno.land/x/sentry/index.mjs'

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
 
export function initSentry() {
  Sentry.init({
    dsn: Deno.env.get('SENTRY_DSN'),
    defaultIntegrations: false,
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  })

  // Set region and execution_id as custom tags
  Sentry.setTag('region', Deno.env.get('SB_REGION') || 'unknown')
  Sentry.setTag('execution_id', Deno.env.get('SB_EXECUTION_ID') || 'unknown')
}
export { Sentry } // Export this variable so it can then be used

export async function inferOrganisation({ connection, dataIn, req, storageService }: { connection: string; dataIn: T; req: express.Request; storageService: StorageService }): Promise<FunctionResult> {
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
    } else if (connection === "shopify") {
      // If this is a Shopify webhook request
      console.log(`req?.headers: ${this.stringify(req?.headers)}`);
      if (req?.headers['x-shopify-hmac-sha256']) {
        const hmacHeader = req.headers['x-shopify-hmac-sha256'];

        console.log(`req: ${this.stringify(req)}}`);
        
        // For Express request, we need to access the raw body differently
        // Make sure you've configured the raw body parser middleware
        const rawBody = (req as any).rawBody || JSON.stringify(dataIn);
        
        // Verify webhook
        const ecommerceService: EcommerceService = new EcommerceService();
        const shopifyCallIsValid = await ecommerceService.verifyWebhook("shopify", rawBody, hmacHeader);
        if (!shopifyCallIsValid) {
          throw new Error("Invalid Shopify webhook signature");
        }

        // Extract shop domain
        const shopDomain = req.headers['x-shopify-shop-domain'];

        console.log(`shopDomain found: ${shopDomain}`);

        const mappingResult = await storageService.getRow({table: "connection_organisation_mapping", keys: {connection: connection, connection_id: shopDomain}});
        organisationId = mappingResult.data.organisation_id;
      }
    }

    if (organisationId) {
      const organisationDataResult = await storageService.getRow({table: "organisations", keys: {id: organisationId}});
      if (organisationDataResult.data) {
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

export async function getOrganisationObjectTypes({ storageService, organisationId, memberId }: { storageService: StorageService; organisationId: string; memberId: string }): Promise<FunctionResult> {
  try {
    const whereAndConditions = [
      { column: 'category', operator: 'neq', value: "company_data" }, // Only include entries where category is an organisation category
    ];
    const whereOrConditions = [
      { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
      { column: 'owner_member_id', operator: 'is', value: null }, // Include default entries where owner member not set
    ];
    if (organisationId) {
      whereOrConditions.push({ column: 'owner_organisation_id', operator: 'eq', value: organisationId }); // Include entries created by the org
    }
    if (memberId) {
      whereOrConditions.push({ column: 'owner_member_id', operator: 'eq', value: memberId }); // Include entries created by the member
    }
    const getOrganisationObjectTypesResult = await storageService.getRows('object_types', {
      whereAndConditions,
      whereOrConditions,
    });
    if (getOrganisationObjectTypesResult.status != 200) {
      return new Error(getOrganisationObjectTypesResult.message);
    }
    const objectTypes = getOrganisationObjectTypesResult.data;
    console.log(`objectTypes: ${this.stringify(objectTypes)}`);
    const result: FunctionResult = {
      status: 200,
      message: "Success running getOrganisationObjectTypes",
      data: objectTypes,
    };
    return result;
  } catch(error) {
    const result: FunctionResult = {
      status: 500,
      message: `❌ ${error.message}`,
    };
    console.error(result.message);
    return result;
  }
}

export async function getObjectMetadataTypes({ storageService, organisationId, memberId }: { storageService: StorageService; organisationId: string; memberId: string }): Promise<FunctionResult> {
  try {
    const whereOrConditions = [
      { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
      { column: 'owner_member_id', operator: 'is', value: null }, // Include default entries where owner member not set
    ];
    if (organisationId) {
      whereOrConditions.push({ column: 'owner_organisation_id', operator: 'eq', value: organisationId }); // Include entries created by the org
    }
    if (memberId) {
      whereOrConditions.push({ column: 'owner_member_id', operator: 'eq', value: memberId }); // Include entries created by the member
    }
    const getObjectMetadataTypesResult = await storageService.getRows('object_metadata_types', {
      whereOrConditions: whereOrConditions,
    });
    if (getObjectMetadataTypesResult.status != 200) {
      return new Error(getObjectMetadataTypesResult.message);
    }
    const objectMetadataTypes = getObjectMetadataTypesResult.data;
    const result: FunctionResult = {
      status: 200,
      message: "Success running getObjectMetadataTypes",
      data: objectMetadataTypes,
    };
    return result;
  } catch(error) {
    const result: FunctionResult = {
      status: 500,
      message: `❌ ${error.message}`,
    };
    console.error(result.message);
    return result;
  }
}

export function createObjectTypeDescriptions(objectTypes: any[], metadataTypes: any[]) {
  // TODO: possibly remove this and reuse createObjectMetadataFunctionProperties instead?
  // Returns a map where the keys are each object type's ID, and the values are:
  // - The object type's name
  // - The object type's description
  // - The object type's metadata, which is a map containing metadata info, including cases where related_object_type_id is null

  return objectTypes.reduce((result, objectType) => {
    // Find related metadata for the current object type or metadata with a null related_object_type_id
    const relatedMetadata = metadataTypes.filter(
      (meta) => meta.related_object_type_id === objectType.id || meta.related_object_type_id === null
    );

    // Transform related metadata into the desired format
    const metadataMap = relatedMetadata.reduce((acc, meta) => {
      const description = meta.description || meta.name;
      const property: any = {
        description,
      };

      property.fieldType = meta.field_type_id; // TODO: check this is displaying as expected and consider also/instead of including the underlying data type


      acc[meta.id] = property;
      return acc;
    }, {} as Record<string, any>);

    // Add the object type entry to the result map
    result[objectType.id] = {
      name: objectType.name,
      description: objectType.description,
      metadata: metadataMap,
    };

    return result;
  }, {} as Record<string, any>);
}

export function mergeRelatedIds(
  existingIds?: Record<string, string[]>,
  newIds?: Record<string, string[]>
): Record<string, string[]> {
  console.log(`mergeRelatedIds called with: existingIds: ${JSON.stringify(existingIds)} and newIds: ${JSON.stringify(newIds)}`);
  
  // If no IDs exist at all, return null
  if (!existingIds && !newIds) {
    return null;
  }

  // Create merged object using existing IDs as base or an empty object
  const mergedIds: Record<string, string[]> = { ...existingIds };

  // If there are new IDs to merge, process each key
  if (newIds) {
    console.log("mergeRelatedIds has new ones");
    Object.entries(newIds).forEach(([key, ids]) => {
      console.log(`mergeRelatedIds... merging key: ${key} with ids: ${JSON.stringify(ids)}`);
      mergedIds[key] = [
        ...new Set([
          ...(existingIds?.[key] || []), // Include existing IDs or an empty array
          ...(ids || [])                // Include new IDs or an empty array
        ])
      ];
    });
  }

  console.log(`mergeRelatedIds now: ${JSON.stringify(mergedIds)}`);
  return mergedIds;
}

// Enums
// export enum TriBool {
//   True,
//   False,
//   Unknown
// }

// Consts
export const CORS_OPTIONS = {
  origin: ["https://app.getathenic.com","http://localhost:8000"],
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
export const VANILLA_SYSTEM_INSTRUCTION = `
 - You are a business data API assistant called Athenic, designed to process incoming business data, answer questions from the employees and do work on behalf of the business.
 - Bear in mind that Athenic is a hyper-intelligent AI business brain, with the smarts of all of the most clever business and technology brains, and so it should think and act accordingly.
 - Be professional, avoid arguments, and focus on being helpful.
 - Bear in mind how we are defining the following terms:
"organisation" = a business that uses Athenic to help them (e.g. Yahoo, Microsoft, Braun, Nike, Pepsi,...)
"member" = a member, typically an employee, of the organisation who uses Athenic to help them (eg. a Yahoo employee)
"user" = a user/customer of the organisation
"object" = a piece of data stored in the organisation's DB (database)
`;
export const ASSISTANT_SYSTEM_INSTRUCTION = `
${VANILLA_SYSTEM_INSTRUCTION}
\n\nIterately work through the following task, using Function/Tool Calling and code generation where necessary.
`;
export const SLACK_REDIRECT_URI = "https://gvblzovvpfeepnhifwqh.supabase.co/functions/v1/auth/slack"
// export const NLP_MODELS_LITE = ["microsoft/phi-3-medium-128k-instruct:free", "gpt-4o-mini"];
// export const NLP_MODELS_FULL = ["microsoft/phi-3-medium-128k-instruct:free", "gpt-4o"];
// export const NLP_MODELS_LITE = ["meta-llama/llama-3.2-11b-vision-instruct:free", "microsoft/phi-3-medium-128k-instruct:free", "microsoft/phi-3-mini-128k-instruct:free"];
// export const NLP_MODELS_FULL = ["meta-llama/llama-3.2-11b-vision-instruct:free", "microsoft/phi-3-medium-128k-instruct:free", "microsoft/phi-3-mini-128k-instruct:free"];
export const NLP_MODELS_LITE = ["gpt-4o-mini"];
export const NLP_MODELS_FULL = ["gpt-4o"]; // TODO: change this in prod
export const NLP_EMBEDDING_MODEL = "text-embedding-3-small"; // Note: if you change this model, also change it in the client's code
export const NLP_EMBEDDING_MAX_CHARS = 10000; // Note: if you change this model, also change it in the client's code. OpenAI's text-embedding-3-small has a token limit of 8191, so we're setting this to 10000 to be safe

export const MAX_SEARCH_RESULTS = 200; // Max number of search results that can be returned when querying db

export const URL_DATA_TYPE_WEBHOOK = "webhook";

export const OBJECT_TABLE_NAME = "objects";

export const OBJECT_TYPE_ID_SIGNAL = "signal";
export const OBJECT_TYPE_ID_JOB = "job";
export const OBJECT_TYPE_ID_CONNECTION = "connection";
export const OBJECT_TYPE_ID_MESSAGE_THREAD = "message_thread";
export const OBJECT_TYPE_ID_MESSAGE = "message";

export const OBJECT_METADATA_DEFAULT_TITLE = "title";
export const OBJECT_METADATA_DEFAULT_PARENT_ID = "parent_id";
export const OBJECT_METADATA_DEFAULT_CREATED_AT = "created_at";

export const OBJECT_METADATA_TYPE_ID_MESSAGE_AUTHOR_ID = "author_id";
export const OBJECT_MESSAGE_AUTHOR_ID_VALUE_IF_COMPANY = "company";
