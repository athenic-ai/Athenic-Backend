import * as uuid from "jsr:@std/uuid";

// Exporting functions and declarations
// NOTE: must add this file when calling nlpFunctionsBase's loadFunctionGroups()
export async function initialiseFunctions(baseInstance: any) {
  console.log("initialiseFunctions called for nlpFunctionsData");
  const functionsToReturn = {};

  // searchForObjects
  if (baseInstance.parent.supportedObjectTypeIds != null) {
    functionsToReturn.searchForObjects = {
      declaration: {
        type: "function",
        function: {
          name: "searchForObjects",
          description: "Search for objects matching the given search query.",
          parameters: {
            type: "object",
            strict: true,
            properties: {
              queryText: {
                type: "string",
                description: "Query text to search for objects.",
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
                description: `If appropriate to only search for a specific type of object, the object types that can be chosen from are:\n${JSON.stringify(baseInstance.parent.supportedObjectTypeDescriptions)}`,
                enum: baseInstance.parent.supportedObjectTypeIds,
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
  }

  return functionsToReturn;
};
