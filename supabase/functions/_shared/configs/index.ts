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

export async function getFieldTypes({ storageService }: { storageService: StorageService }): Promise<FunctionResult> {
  try {
    const getFieldTypesResult = await storageService.getRows('field_types', {
    });
    if (getFieldTypesResult.status != 200) {
      return new Error(getFieldTypesResult.message);
    }
    const fieldTypes = getFieldTypesResult.data;
    const result: FunctionResult = {
      status: 200,
      message: "Success running getFieldTypes",
      data: fieldTypes,
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

export async function getDictionaryTerms({ storageService }: { storageService: StorageService }): Promise<FunctionResult> {
  try {
    const getDictionaryTermsResult = await storageService.getRows('dictionary_terms', {
    });
    if (getDictionaryTermsResult.status != 200) {
      return new Error(getDictionaryTermsResult.message);
    }
    const dictionaryTerms = getDictionaryTermsResult.data;
    const result: FunctionResult = {
      status: 200,
      message: "Success running getDictionaryTerms",
      data: dictionaryTerms,
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
  // Merges two maps of object IDs, ensuring no duplicates and returning null if no IDs exist at all (used in data forms such as are used for related IDs)
  console.log(`mergeObjectIdMaps called with: existingIds: ${JSON.stringify(existingIds)} and newIds: ${JSON.stringify(newIds)}`);
  
  // If no IDs exist at all, return null
  if (!existingIds && !newIds) {
    return null;
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