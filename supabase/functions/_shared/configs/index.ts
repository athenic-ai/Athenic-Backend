import { EcommerceService } from "../services/ecommerce/ecommerceService";
import { StorageService } from '../services/storage/storageService';
// Sentry stub for Node: accept any args, do nothing
const Sentry = { init: (..._args: any[]) => {}, setTag: (..._args: any[]) => {} };

// Interfaces
export interface FunctionResult<T = unknown> {
  status: number; // HTTP or custom status code
  data: T | null; // The data being returned, or null if there's none or an error
  message: string | null; // A message describing success or the error, or null if not applicable
  references: string | null; // A message describing success or the error, or null if not applicable
}

// Define WhereCondition type for clarity and type safety
export type WhereCondition = {
  column: string;
  operator: "is" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in";
  value: string;
};

// Functions
// stringify function works even if item is not an object (just returns original) or if partially circular (just discards that part)
export function stringify(obj: any): string {
  if (typeof obj !== "object" || obj === null) {
    return String(obj);
  }
  let cache: any[] = [];
  let str = JSON.stringify(obj, function (key, value) {
    if (typeof value === "object" && value !== null) {
      if (cache.indexOf(value) !== -1) {
        return;
      }
      cache.push(value);
    }
    return value;
  });
  cache = [];
  return str;
}

export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    defaultIntegrations: false,
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
  Sentry.setTag('region', process.env.SB_REGION || 'unknown');
  Sentry.setTag('execution_id', process.env.SB_EXECUTION_ID || 'unknown');
}
export { Sentry };

export async function inferOrganisation({ connection, dataIn, req, storageService }: { connection: string; dataIn: any; req: any; storageService: StorageService }): Promise<FunctionResult> {
  try {
    let organisationId;
    if (dataIn.companyMetadata && dataIn.companyMetadata.organisationId) {
      organisationId = dataIn.companyMetadata.organisationId;
    } else if (connection === "email") {
      organisationId = dataIn.recipient.split("@")[0];
    } else if (connection === "productfruits") {
      const mappingResult = await storageService.getRow({table: "connection_organisation_mapping", keys: {connection: connection, connection_id: dataIn.data.projectCode}});
      organisationId = mappingResult.data.organisation_id;
    } else if (connection === "shopify") {
      console.log(`req?.headers: ${stringify(req?.headers)}`);
      if (req?.headers['x-shopify-hmac-sha256']) {
        const hmacHeader = req.headers['x-shopify-hmac-sha256'];
        console.log(`req: ${stringify(req)}}`);
        const rawBody = (req as any).rawBody || JSON.stringify(dataIn);
        const ecommerceService: EcommerceService = new EcommerceService();
        const shopifyCallIsValid = await ecommerceService.verifyWebhook("shopify", rawBody, hmacHeader);
        if (!shopifyCallIsValid) {
          throw new Error("Invalid Shopify webhook signature");
        }
        const shopDomain = req.headers['x-shopify-shop-domain'];
        console.log(`shopDomain found: ${shopDomain}`);
        const mappingResult = await storageService.getRow({table: "connection_organisation_mapping", keys: {connection: connection, connection_id: shopDomain}});
        organisationId = mappingResult.data.organisation_id;
      }
    }
    if (organisationId) {
      return { status: 200, data: { organisationId }, message: null, references: null };
    }
    return { status: 404, data: null, message: "Organisation not found", references: null };
  } catch (error) {
    return { status: 500, data: null, message: (error as Error).message, references: null };
  }
}

export async function getOrganisationObjectTypes({ storageService, organisationId, memberId }: { storageService: StorageService; organisationId: string; memberId: string }): Promise<FunctionResult> {
  try {
    // Compose whereOrConditions with valid operators and values
    const whereOrConditions: WhereCondition[] = [
      { column: 'owner_organisation_id', operator: 'is', value: "" },
      { column: 'owner_member_id', operator: 'is', value: "" },
    ];
    if (organisationId) {
      whereOrConditions.push({ column: 'owner_organisation_id', operator: 'eq', value: organisationId });
    }
    if (memberId) {
      whereOrConditions.push({ column: 'owner_member_id', operator: 'eq', value: memberId });
    }
    const whereAndConditions: WhereCondition[] = [
      { column: 'category', operator: 'neq', value: "company_data" },
    ];
    const getOrganisationObjectTypesResult = await storageService.getRows('object_types', {
      whereAndConditions,
      whereOrConditions,
    });
    if (getOrganisationObjectTypesResult.status !== 200) {
      return {
        status: getOrganisationObjectTypesResult.status,
        data: null,
        message: getOrganisationObjectTypesResult.message,
        references: null
      };
    }
    const objectTypes = getOrganisationObjectTypesResult.data;
    console.log(`objectTypes: ${stringify(objectTypes)}`);
    const result: FunctionResult = {
      status: 200,
      data: objectTypes,
      message: "Success running getOrganisationObjectTypes",
      references: null
    };
    return result;
  } catch(error) {
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    }
    const result: FunctionResult = {
      status: 500,
      data: null,
      message: `❌ ${message}`,
      references: null
    };
    console.error(result.message);
    return result;
  }
}

export async function getObjectMetadataTypes({ storageService, organisationId, memberId }: { storageService: StorageService; organisationId: string; memberId: string }): Promise<FunctionResult> {
  try {
    const whereOrConditions: WhereCondition[] = [
      { column: 'owner_organisation_id', operator: 'is', value: "" },
      { column: 'owner_member_id', operator: 'is', value: "" },
    ];
    if (organisationId) {
      whereOrConditions.push({ column: 'owner_organisation_id', operator: 'eq', value: organisationId || "" });
    }
    if (memberId) {
      whereOrConditions.push({ column: 'owner_member_id', operator: 'eq', value: memberId || "" });
    }
    const getObjectMetadataTypesResult = await storageService.getRows('object_metadata_types', {
      whereOrConditions: whereOrConditions,
    });
    if (getObjectMetadataTypesResult.status !== 200) {
      return {
        status: getObjectMetadataTypesResult.status,
        data: null,
        message: getObjectMetadataTypesResult.message,
        references: null
      };
    }
    const objectMetadataTypes = getObjectMetadataTypesResult.data;
    const result: FunctionResult = {
      status: 200,
      data: objectMetadataTypes,
      message: "Success running getObjectMetadataTypes",
      references: null
    };
    return result;
  } catch(error) {
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    }
    const result: FunctionResult = {
      status: 500,
      data: null,
      message: `❌ ${message}`,
      references: null
    };
    console.error(result.message);
    return result;
  }
}

export async function getFieldTypes({ storageService }: { storageService: StorageService }): Promise<FunctionResult> {
  try {
    const getFieldTypesResult = await storageService.getRows('field_types', {
    });
    if (getFieldTypesResult.status !== 200) {
      return {
        status: getFieldTypesResult.status,
        data: null,
        message: getFieldTypesResult.message,
        references: null
      };
    }
    const fieldTypes = getFieldTypesResult.data;
    const result: FunctionResult = {
      status: 200,
      data: fieldTypes,
      message: "Success running getFieldTypes",
      references: null
    };
    return result;
  } catch(error) {
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    }
    const result: FunctionResult = {
      status: 500,
      data: null,
      message: `❌ ${message}`,
      references: null
    };
    console.error(result.message);
    return result;
  }
}

export async function getDictionaryTerms({ storageService }: { storageService: StorageService }): Promise<FunctionResult> {
  try {
    const getDictionaryTermsResult = await storageService.getRows('dictionary_terms', {
    });
    if (getDictionaryTermsResult.status !== 200) {
      return {
        status: getDictionaryTermsResult.status,
        data: null,
        message: getDictionaryTermsResult.message,
        references: null
      };
    }
    const dictionaryTerms = getDictionaryTermsResult.data;
    const result: FunctionResult = {
      status: 200,
      data: dictionaryTerms,
      message: "Success running getDictionaryTerms",
      references: null
    };
    return result;
  } catch(error) {
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    }
    const result: FunctionResult = {
      status: 500,
      data: null,
      message: `❌ ${message}`,
      references: null
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

export function createObjectMetadataFunctionProperties(
  objectTypes: any[],
  metadataTypes: any[],
  fieldTypes: any[],
  dictionaryTerms: any[]
): [Record<string, Record<string, any>>, Record<string, string[]>] {
  // Creates two maps:  
  // 1. `objectMetadataFunctionProperties` - A map where the key is the object ID and the value is a structured object describing for the AI how to create this object's metadata, including metadata where `related_object_type_id` is `null` and excluding those with `allow_ai_update` explicitly set to `false`.  
  // 2. `objectMetadataFunctionPropertiesRequiredIds` - A map where the key is the metadata ID and the value is a list of all the metadata type ids where `is_required` property is `true` (if allow_ai_update marked as false, these will already be exlcuded from this even if is_required is set to true)

  // Initialize the result maps
  const objectMetadataFunctionProperties: Record<string, Record<string, any>> = {};
  const objectMetadataFunctionPropertiesRequiredIds: Record<string, string[]> = {};

  // Loop through each objectType
  objectTypes.forEach((objectType) => {
    // Filter metadata types relevant to this objectType
    const relatedMetadata = metadataTypes.filter(
      (meta) =>
        (meta.related_object_type_id === objectType.id || meta.related_object_type_id === null) &&
        meta.allow_ai_update !== false // Skip if allow_ai_update is false
    );

    // Initialize properties and required IDs
    const properties: Record<string, any> = {};
    const requiredIds: string[] = [];

    // Populate properties and requiredIds
    relatedMetadata.forEach((meta) => {
      if (meta.allow_ai_update) {
        const property: any = {};
        let description = meta.description
          ? `${meta.name}: ${meta.description}`
          : meta.name;
        if (meta.max_value) {
          description += `\nThe max value is: ${meta.max_value}`;
        }
        if (meta.dictionary_term_type) {
          // 1. List of IDs matching the given type.
          const idsMatchingType = dictionaryTerms
          .filter(term => term.type === meta.dictionary_term_type)
          .map(term => term.id);

          // 2. List of maps with id and description for matching items.
          const mapsMatchingType = dictionaryTerms
          .filter(term => term.type === meta.dictionary_term_type)
          .map(term => ({ id: term.id, description: term.description }));

          description += `\nDescriptions for the enums are: ${JSON.stringify(mapsMatchingType)}`;

          property.enum = idsMatchingType;
        }

        property.description = description;
  
        const fieldTypeMap = fieldTypes.find((entry) => entry.id === meta.field_type_id);

        let dataType = fieldTypeMap.data_type;
        if (dataType === "object") {
          dataType = "string"; // Added this code temporarily until we support json metadata field types being created in this way. Until then, lets jsut create the json by storing it as a string
        }

        // Assign data type by retrieving the data type based on the matching field_type_id
        if (meta.is_required) {
          property.type = dataType; 
        } else {
          property.type = [dataType, "null"]; // How we handle non-required fields in strict mode
        }

        if (fieldTypeMap.is_array) {
          // If true, surround property within an array structure
          const propertyArrContainer: any = {
            type: "array",
            description: `Array of ${meta.name} items`,
            items: property,
          };
          properties[meta.id] = propertyArrContainer;
        } else {
          properties[meta.id] = property;
        }

        // Add all IDs to is_required (as we have to for strict mode - required is now determined via type property)
        requiredIds.push(meta.id);
      } else {
        // Skipping metadata as allow_ai_update is false for objectType.id
      }
    });

    // Assign to the maps
    if (properties) {
      objectMetadataFunctionProperties[objectType.id] = properties;
    }
    objectMetadataFunctionPropertiesRequiredIds[objectType.id] = requiredIds;
  });

  // Return both maps
  return [objectMetadataFunctionProperties, objectMetadataFunctionPropertiesRequiredIds];
}

export function mergeObjectIdMaps(
  existingIds?: Record<string, string[]>,
  newIds?: Record<string, string[]>
): Record<string, string[]> {
  // Merges two maps of object IDs, ensuring no duplicates and returning {} if no IDs exist at all (used in data forms such as are used for related IDs)
  console.log(`mergeObjectIdMaps called with: existingIds: ${JSON.stringify(existingIds)} and newIds: ${JSON.stringify(newIds)}`);
  
  // If no IDs exist at all, return {}
  if (!existingIds && !newIds) {
    return {};
  }

  // Create merged object using existing IDs as base or an empty object
  const mergedIds: Record<string, string[]> = { ...existingIds };

  // If there are new IDs to merge, process each key
  if (newIds) {
    console.log("mergeObjectIdMaps has new ones");
    Object.entries(newIds).forEach(([key, ids]) => {
      console.log(`mergeObjectIdMaps... merging key: ${key} with ids: ${JSON.stringify(ids)}`);
      mergedIds[key] = [
        ...new Set([
          ...(existingIds?.[key] || []), // Include existing IDs or an empty array
          ...(ids || [])                // Include new IDs or an empty array
        ])
      ];
    });
  }

  console.log(`mergeObjectIdMaps now: ${JSON.stringify(mergedIds)}`);
  return mergedIds;
}

export function removeObjectFromObjectIdMap({
  objectIdMap,
  objectType,
  objectId
}: {
  objectIdMap: Record<string, string[]>;
  objectType: string;
  objectId: string;
}): Record<string, string[]> {
  // Creates a copy of the existing IDs object to avoid mutating the original
  const updatedIdMap: Record<string, string[]> = { ...objectIdMap };
  
  // Check if the object type exists in the map
  if (updatedIdMap[objectType]) {
    // Filter out the specified object ID
    updatedIdMap[objectType] = updatedIdMap[objectType].filter(id => id !== objectId);
    
    // If the object type's array is now empty, remove the object type entry
    if (updatedIdMap[objectType].length === 0) {
      delete updatedIdMap[objectType];
    }
  }
  
  return updatedIdMap;
}

// Helper function to remove null and undefined values recursively from any object
export function removeNullValues(obj: any): any {
  console.log(`removeNullValues called with: ${JSON.stringify(obj)}`);
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj
      .filter(item => item != null)  // Uses loose equality to catch both null and undefined
      .map(item => (typeof item === 'object' ? removeNullValues(item) : item));
  }

  console.log(`removeNullValues obj type: ${typeof obj}`);
  
  // Handle objects
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, value]) => value != null)
        .map(([key, value]) => [
          key,
          typeof value === 'object' ? removeNullValues(value) : value
        ])
    );
  }
  console.log(`removeNullValues returning: ${JSON.stringify(obj)}`);
  
  // Return primitive values as is
  return obj;
};

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
 - If function/tool calling, ONLY try to call ones that are supported.
 - Bear in mind how we are defining the following terms:
"organisation" = a business that uses Athenic to help them (e.g. Yahoo, Microsoft, Braun, Nike, Pepsi,...)
"member" = a member, typically an employee, of the organisation who uses Athenic to help them (eg. a Yahoo employee)
"user" = a user/customer of the organisation
"object" = a piece of data stored in the organisation's DB (database)
`;
export const VANILLA_ASSISTANT_SYSTEM_INSTRUCTION = `
${VANILLA_SYSTEM_INSTRUCTION}
\n\nYou may need to create, read, update and delete signals and jobs. When creating signals, deeply analyse a given trigger, doing research like e.g. searching the object database or searching the web to uncover insight(s) that should be signals. If Athenic thinks a job(s) should also be carried out as a consequence of this analysis, do that.
\n\nIterately work through the following task, using Function/Tool Calling and code generation where necessary.
`;

export const SLACK_REDIRECT_URI = "https://gvblzovvpfeepnhifwqh.supabase.co/functions/v1/auth/slack"
// export const NLP_MODELS_LITE = ["microsoft/phi-3-medium-128k-instruct:free", "gpt-4o-mini"];
// export const NLP_MODELS_FULL = ["microsoft/phi-3-medium-128k-instruct:free", "gpt-4o"];
// export const NLP_MODELS_LITE = ["meta-llama/llama-3.2-11b-vision-instruct:free", "microsoft/phi-3-medium-128k-instruct:free", "microsoft/phi-3-mini-128k-instruct:free"];
// export const NLP_MODELS_FULL = ["meta-llama/llama-3.2-11b-vision-instruct:free", "microsoft/phi-3-medium-128k-instruct:free", "microsoft/phi-3-mini-128k-instruct:free"];
export const NLP_MODELS_LITE = ["gpt-4o-mini"];
export const NLP_MODELS_FULL = ["gpt-4o-mini"]; // TODO: change this in prod
export const NLP_EMBEDDING_MODEL = "text-embedding-3-small"; // Note: if you change this model, also change it in the client's code
export const NLP_EMBEDDING_MAX_CHARS = 10000; // Note: if you change this model, also change it in the client's code. OpenAI's text-embedding-3-small has a token limit of 8191, so we're setting this to 10000 to be safe

export const MAX_SEARCH_RESULTS = 200; // Max number of search results that can be returned when querying db

export const URL_DATA_TYPE_WEBHOOK = "webhook";

export const OBJECT_TABLE_NAME = "objects";

export const OBJECT_TYPE_ID_SIGNAL = "signal";
export const OBJECT_TYPE_ID_JOB = "job";
export const OBJECT_TYPE_ID_JOB_RUN = "job_run";
export const OBJECT_TYPE_ID_ASSISTANT = "assistant";
export const OBJECT_TYPE_ID_CONNECTION = "connection";
export const OBJECT_TYPE_ID_MESSAGE_THREAD = "message_thread";
export const OBJECT_TYPE_ID_MESSAGE = "message";

export const OBJECT_METADATA_DEFAULT_TITLE = "title";
export const OBJECT_METADATA_DEFAULT_PARENT_ID = "parent_id";
export const OBJECT_METADATA_DEFAULT_CHILD_IDS = "child_ids";
export const OBJECT_METADATA_DEFAULT_CREATED_AT = "created_at";

export const OBJECT_METADATA_TYPE_ID_MESSAGE_AUTHOR_ID = "author_id";
export const OBJECT_MESSAGE_AUTHOR_ID_VALUE_IF_COMPANY = "company";

export const OBJECT_METADATA_JOB_STATUS = "status";
export const OBJECT_METADATA_JOB_SCHEDULE = "schedule";

export const OBJECT_DICTIONARY_TERM_PLANNED = "planned";
export const OBJECT_DICTIONARY_TERM_DONE = "done";
export const OBJECT_DICTIONARY_TERM_FAILED = "failed";

export const OBJECT_METADATA_JOB_RUN_STATUS = "status";
export const OBJECT_METADATA_JOB_RUN_OUTCOME = "outcome";
export const OBJECT_METADATA_JOB_RUN_OUTPUT = "output";

export const OBJECT_DICTIONARY_TERM_JOB_RUN_COMPLETED = "jobRunCompleted";
export const OBJECT_DICTIONARY_TERM_JOB_RUN_FAILED = "jobRunFailed";