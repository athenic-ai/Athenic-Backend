import * as uuid from "jsr:@std/uuid";

// Exporting functions and declarations
// NOTE: must add this file when calling nlpFunctionsBase's loadFunctionGroups()
export async function initialiseFunctions(baseInstance: any) {
  console.log("initialiseFunctions called for nlpFunctionsHelpers");
  const functionsToReturn = {};

  let selectedObjectMetadataFunctionProperties;
  let selectedObjectMetadataFunctionPropertiesRequiredIds;
  let processDataFunctionDescription;
  if (baseInstance.parent.objectMetadataFunctionProperties && baseInstance.parent.selectedObjectTypeId) {
    selectedObjectMetadataFunctionProperties = baseInstance.parent.objectMetadataFunctionProperties[baseInstance.parent.selectedObjectTypeId];
  }
  if (baseInstance.parent.objectMetadataFunctionPropertiesRequiredIds && baseInstance.parent.selectedObjectTypeId) {
    selectedObjectMetadataFunctionPropertiesRequiredIds = baseInstance.parent.objectMetadataFunctionPropertiesRequiredIds[baseInstance.parent.selectedObjectTypeId];
  }
  if (baseInstance.parent.processDataFunctionDescription) {
    processDataFunctionDescription = baseInstance.parent.processDataFunctionDescription;
  }
  
  
  // predictObjectTypeBeingReferenced
  if (baseInstance.parent.objectTypes && baseInstance.parent.objectTypeDescriptions) {
    const objectTypesIds = baseInstance.parent.objectTypes.map(item => item.id); // List of strings of the ID of each object type

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
                description: `ID of predicted object type.\n\nDescriptions of object types that can be chosen from:\n${JSON.stringify(baseInstance.parent.objectTypeDescriptions)}`,
                enum: objectTypesIds
              },
            },
            required: ["predictedObjectTypeId"],
            additionalProperties: false,
          },
        }
      },
      implementation: async ({ predictedObjectTypeId }: { predictedObjectTypeId: string }) => {
        try {
          const predictedObjectTypeIdProcessed = predictedObjectTypeId === "unknown" ? null : predictedObjectTypeId;
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
  } else {
    console.log("Failed to add predictObjectTypeBeingReferenced function as missing variable(s)");
  }

  // predictObjectParent
  if (baseInstance.parent.selectedObjectsIds) {
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
  } else {
    console.log("Failed to add predictObjectParent function as missing variable(s)");
  }

  // processDataUsingGivenObjectsMetadataStructure
  if (selectedObjectMetadataFunctionProperties) {
    console.log(`selectedObjectMetadataFunctionProperties are: ${JSON.stringify(selectedObjectMetadataFunctionProperties)}`);
    console.log(`processDataFunctionDescription is: ${processDataFunctionDescription}`);
    functionsToReturn.processDataUsingGivenObjectsMetadataStructure = {
      declaration: {
        type: "function",
        function: {
          name: "processDataUsingGivenObjectsMetadataStructure",
          description: processDataFunctionDescription,
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
  } else {
    console.log("Failed to add selectedObjectMetadataFunctionProperties function as missing variable(s)");
  }

  return functionsToReturn;
};
