import * as uuid from "jsr:@std/uuid";

// Exporting functions and declarations
// NOTE: must add any you add here to loadFunctions() function in nlpFunctionsBase
export async function initialiseFunctions(baseInstance: any) {
  console.log(`baseInstance.parent.supportedObjectTypeIds: ${baseInstance.parent.supportedObjectTypeIds}`);
  const selectedObjectMetadataFunctionProperties = baseInstance.parent.objectMetadataFunctionProperties[baseInstance.parent.selectedObjectTypeId];
  console.log("selectedObjectMetadataFunctionProperties", selectedObjectMetadataFunctionProperties);
  const functionsToReturn = {
    predictObjectTypeBeingReferenced: {
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
                description: "ID of estimated object type, or 'unknown' if none apply.",
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
          console.log(`predictObjectBeingReferenced called with: ${predictedObjectTypeId}`);
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
            message: "Error in predictProductBeingReferenced: " + error.message,
          };
          return result;
        }
      },
    },
  };
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
            required: ["title"], // TODO: add support for more required values
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
            related_type_id: baseInstance.parent.selectedObjectTypeId,
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
            message: "Error in processDataUsingGivenObjectsMetadataStructure: " + error.message,
          };
          return result;
        }
      },
    };
  }
  return functionsToReturn;
};
