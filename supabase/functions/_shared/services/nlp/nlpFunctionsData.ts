import * as uuid from "jsr:@std/uuid";

// Exporting functions and declarations
// NOTE: must add this file to loadFunctions() function in nlpFunctionsBase
export async function initialiseFunctions(baseInstance: any) {
  console.log("initialiseFunctions called");
  const functionsToReturn = {};

  let selectedObjectMetadataFunctionProperties;
  let selectedObjectMetadataFunctionPropertiesRequiredIds;
  if (baseInstance.parent.objectMetadataFunctionProperties && baseInstance.parent.selectedObjectTypeId) {
    selectedObjectMetadataFunctionProperties = baseInstance.parent.objectMetadataFunctionProperties[baseInstance.parent.selectedObjectTypeId];
  }
  if (baseInstance.parent.objectMetadataFunctionPropertiesRequiredIds && baseInstance.parent.selectedObjectTypeId) {
    selectedObjectMetadataFunctionPropertiesRequiredIds = baseInstance.parent.objectMetadataFunctionPropertiesRequiredIds[baseInstance.parent.selectedObjectTypeId];
  }
  
  // predictObjectTypeBeingReferenced
  if (baseInstance.parent.supportedObjectTypeIds != null) {
    console.log("baseInstance.parent.supportedObjectTypeIds", baseInstance.parent.supportedObjectTypeIds);
    functionsToReturn.predictObjectTypeBeingReferenced = {
      declaration: {
        type: "function",
        function: {
          name: "predictObjectTypeBeingReferenced",
          description: "Predict which type of object is being referenced based on input.",
          parameters: {
            type: "object",
            strict: true,
            properties: {
              predictedObjectTypeId: {
                type: "string",
                description: "ID of predicted object type, or 'unknown' if none apply.",
                enum: baseInstance.parent.supportedObjectTypeIds
              },
            },
            required: ["predictedObjectTypeId"],
            additionalProperties: false,
          },
        }
      },
      implementation: async ({ predictedObjectTypeId }: { predictedObjectTypeId: string }) => {
        try {
          console.log(`predictObjectTypeBeingReferenced called with: ${predictedObjectTypeId}`);
          const predictedObjectTypeIdProcessed = predictedObjectTypeId === "unknown" ? null : predictedObjectTypeId;
          console.log("predictedObjectTypeIdProcessed", predictedObjectTypeIdProcessed);
          const result: FunctionResult = {
            status: 200,
            message: "Predicted object's type",
            data: predictedObjectTypeIdProcessed,
          };
          return result;
        } catch (error) {
          const result: FunctionResult = {
            status: 500,
            message: "❌ Error in predictProductBeingReferenced: " + error.message,
          };
          return result;
        }
      },
    };
  };

  // predictObjectParent
  if (baseInstance.parent.selectedObjectsIds != null) {
    console.log(`baseInstance.parent.selectedObjectsIds: ${baseInstance.parent.selectedObjectsIds}`);
    functionsToReturn.predictObjectParent = {
      declaration: {
        type: "function",
        function: {
          name: "predictObjectParent",
          description: "Predict which object is the most appropriate parent object of the given object based on which is most related.",
          parameters: {
            type: "object",
            strict: true,
            properties: {
              predictedObjectId: {
                type: "string",
                description: "ID of predicted object type",
                enum: baseInstance.parent.selectedObjectsIds
              },
            },
            required: ["predictedObjectId"],
            additionalProperties: false,
          },
        }
      },
      implementation: async ({ predictedObjectId }: { predictedObjectId: string }) => {
        try {
          console.log(`predictObjectParent called with: ${predictedObjectId}`);
          const result: FunctionResult = {
            status: 200,
            message: "Predicted object's parent",
            data: predictedObjectId,
          };
          return result;
        } catch (error) {
          const result: FunctionResult = {
            status: 500,
            message: "❌ Error in predictObjectParent: " + error.message,
          };
          return result;
        }
      },
    };
  };

  // processDataUsingGivenObjectsMetadataStructure
  if (selectedObjectMetadataFunctionProperties != null) {
    functionsToReturn.processDataUsingGivenObjectsMetadataStructure = {
      declaration: {
        type: "function",
        function: {
          name: "processDataUsingGivenObjectsMetadataStructure",
          description: "Given some data, process it to extract data that matches a given metadata structure. Typically used on data being passed to Athenic to be then stored in the database.",
          parameters: {
            type: "object",
            strict: true,
            properties: selectedObjectMetadataFunctionProperties,
            required: selectedObjectMetadataFunctionPropertiesRequiredIds,
            additionalProperties: false,
          },
        }
      },
      implementation: async (processedMetadata: processedMetadata) => {
        try {
          console.log(`processDataUsingGivenObjectsMetadataStructure called with: ${JSON.stringify(processedMetadata)}`);
          const objectData = {
            id: uuid.v1.generate(),
            owner_organisation_id: baseInstance.parent.organisationId,
            related_object_type_id: baseInstance.parent.selectedObjectTypeId,
            metadata: processedMetadata
          };
          const result: FunctionResult = {
            status: 200,
            message: "Processed data into given object's metadata structure",
            data: objectData,
          };
          return result;
        } catch (error) {
          const result: FunctionResult = {
            status: 500,
            message: "❌ Error in processDataUsingGivenObjectsMetadataStructure: " + error.message,
          };
          return result;
        }
      },
    };
  }

  // searchForObjects
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
            relatedObjectTypeId: {
              type: "string",
              description: "Specify the type of object to search for if appropriate.",
              // TODO: specify enum based on available object types
            },
          },
          required: ["queryText"],
          additionalProperties: false,
        },
      }
    },
    implementation: async ({ queryText, relatedObjectTypeId }: { queryText: string, relatedObjectTypeId: string }) => {
      try {
        console.log(`searchForObjects called with: queryText: ${queryText} and relatedObjectTypeId: ${relatedObjectTypeId}`);

        console.log(`searchForObjects: baseInstance.parent.storageService`, baseInstance.parent.storageService);
        console.log(`searchForObjects: baseInstance.parent.nlpService`, baseInstance.parent);
        const searchRowsResult = await baseInstance.parent.storageService.searchRows({
          table: "objects",
          queryText,
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

  return functionsToReturn;
};
