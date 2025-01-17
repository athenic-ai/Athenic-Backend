import * as uuid from "jsr:@std/uuid";

// Exporting functions and declarations
// NOTE: must add this file when calling nlpFunctionsBase's loadFunctionGroups()
export async function initialiseFunctions(baseInstance: any) {
  console.log("initialiseFunctions called for nlpFunctionsData");
  const functionsToReturn = {};

  // upsertData
  if (baseInstance.parent.organisationId && baseInstance.parent.organisationData && baseInstance.parent.objectTypes && baseInstance.parent.objectMetadataTypes && baseInstance.parent.objectTypeDescriptions && baseInstance.parent.fieldTypes && baseInstance.parent.dictionaryTerms && baseInstance.parent.selectedObject) {
    const objectTypesIds = baseInstance.parent.objectTypes.map(item => item.id); // List of strings of the ID of each object type

    functionsToReturn.upsertData = {
      declaration: {
        type: "function",
        function: {
          name: "upsertData",
          description: "Given some data, add it to the database (either by creating a new object, or updating an existing similar one).",
          parameters: {
            type: "object",
            strict: true,
            properties: {
              objectTypeId: {
                type: "string",
                description: `Type ID of the object that will be upserted.\n\nDescriptions of object types that can be chosen from:\n${JSON.stringify(baseInstance.parent.objectTypeDescriptions)}`,
                enum: objectTypesIds
              },
              dataContents: {
                type: "string",
                description: "Full contents of the data that will be upserted.",
              },
              dataDescription: {
                type: "string",
                description: "Any relevant context about the circumstances surrounding the data that will be upserted.",
              },
            },
            required: ["objectTypeId", "dataContents"],
            additionalProperties: false,
          },
        }
      },
      implementation: async ({ objectTypeId, dataContents, dataDescription }: { objectTypeId: string, dataContents: string, dataDescription: string }) => {
        try {
          console.log(`Upserting data with objectTypeId: ${objectTypeId}\ndataContents: ${dataContents}\ndataDescription: ${dataDescription}`);
          const upsertDataJob: UpsertDataJob = new UpsertDataJob();
    
          const dataIn = {
            "companyMetadata": {
              "organisationId": baseInstance.parent.organisationId,
              "memberId": baseInstance.parent.memberId ?? null,
              "objectTypeId": objectTypeId,
              "dataDescription": dataDescription,
              "requiredMatchThreshold": 0.8, // TODO: potentially add support for the AI to set this based on what it thinks (BUT note if it's not added, data will never be merged with existing data)
              "newRelatedIds": {
                [baseInstance.parent.selectedObject.related_object_type_id]: [baseInstance.parent.selectedObject.id],
              },
              processDataFunctionDescription: `Given some data, critically analyse it as the Athenic AI, and then create a ${objectTypeDescriptions[config.OBJECT_TYPE_ID_SIGNAL].name} object type based on your analysis. For context: ${objectTypeDescriptions[config.OBJECT_TYPE_ID_SIGNAL].description}`,
            },
            "companyDataContents": config.stringify(dataContents)
          };
    
          if (relevantData) {
            dataIn.companyDataContents += `\n\nRelevant data: ${config.stringify(relevantData)}.`;
          }
    
          console.log(`upsertDataJob.start() from upsertSignalJob with dataIn: ${config.stringify(dataIn)}`);
          const processSignalDataJobResult = await upsertDataJob.start({
            connection: "company", 
            dryRun: false, 
            dataIn,
            organisationId: baseInstance.parent.organisationId,
            organisationData: baseInstance.parent.organisationData,
            memberId: baseInstance.parent.memberId,
            objectTypes: baseInstance.parent.objectTypes,
            objectMetadataTypes: baseInstance.parent.objectMetadataTypes,
            objectTypeDescriptions: baseInstance.parent.objectTypeDescriptions,
            fieldTypes: baseInstance.parent.fieldTypes,
            dictionaryTerms: baseInstance.parent.dictionaryTerms
          }); 
    
          // TODO: Decide whether any jobs need to be created/updated. If so, it will call the relevant job creation/updating function and also store a reference to the job in this signal (and visa versa) via the related_ids column
    
          const result: FunctionResult = {
            status: 200,
            message: "Successfully upserted signal.",
          };
          return result;
        } catch (error) {
          console.log(`❌ Failed to upsert signal with error: ${error.message}.`);
          const result: FunctionResult = {
            status: 500,
            message: `❌ Failed to upsert signal with error: ${error.message}.`,
          };
          return result;
        }
      },
    };
  } else {
    console.log("Failed to add upsertData function as missing variable(s)");
  }

  // searchForObjects
  if (baseInstance.parent.objectTypes && baseInstance.parent.objectTypeDescriptions) {
    const objectTypesIds = baseInstance.parent.objectTypes.map(item => item.id); // List of strings of the ID of each object type

    functionsToReturn.searchForObjects = {
      declaration: {
        type: "function",
        function: {
          name: "searchForObjects",
          description: "Search for objects using the given semantic search query.",
          parameters: {
            type: "object",
            strict: true,
            properties: {
              queryText: {
                type: "string",
                description: "Search query",
              },
              matchThreshold: {
                type: "number",
                description: "If appropriate, specify how similar the embeddings have to be to count as a match. A value of 1 is most similar, and a value of -1 is most dissimilar. 0.2 is good for finding fairly similar objects.",
              },
              matchCount: {
                type: "integer",
                description: "If appropriate, specify the maximum number of objects to return.",
              },
              relatedObjectTypeId: {
                type: "string",
                description: `If appropriate to only search for a specific type of object, the object types that can be chosen from are:\n${JSON.stringify(baseInstance.parent.objectTypeDescriptions)}`,
                enum: objectTypesIds,
              },
            },
            required: ["queryText"],
            additionalProperties: false,
          },
        }
      },
      implementation: async ({ queryText, matchThreshold, matchCount, relatedObjectTypeId }: { queryText: string, matchThreshold?: number, matchCount?: number, relatedObjectTypeId?: string }) => {
        try {
          console.log(`searchForObjects called with: queryText: ${queryText}, relatedObjectTypeId: ${relatedObjectTypeId}, matchThreshold: ${matchThreshold}, matchCount: ${matchCount}`);

          const searchRowsResult = await baseInstance.parent.storageService.searchRows({
            table: "objects",
            queryText,
            matchThreshold,
            matchCount,
            nlpService: baseInstance.parent,
            relatedObjectTypeId,
            organisationId: baseInstance.parent.organisationId,
            memberId: baseInstance.parent.memberId,
          });
          if (searchRowsResult.status != 200) {
            throw Error(searchRowsResult.message);
          }

          const result: FunctionResult = {
            status: 200,
            message: searchRowsResult.message,
            data: searchRowsResult.data,
          };
          return result;
        } catch (error) {
          console.log(`❌ Error in searchForObjects: ${error.message}`);
          const result: FunctionResult = {
            status: 500,
            message: "❌ Error in searchForObjects: " + error.message,
          };
          return result;
        }
      },
    };
  } else {
    console.log("Failed to add searchForObjects function as missing variable(s)");
  }

  return functionsToReturn;
};
