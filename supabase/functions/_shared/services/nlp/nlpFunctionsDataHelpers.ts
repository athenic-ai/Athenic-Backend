import * as uuid from "jsr:@std/uuid";
import * as config from "../../configs/index.ts";

// Exporting functions and declarations
// NOTE: must add this file when calling nlpFunctionsBase's loadFunctionGroups()
export async function initialiseFunctions(baseInstance: any) {
  console.log("initialiseFunctions called for nlpFunctionsHelpers");
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
  if (baseInstance.parent.objectTypes && baseInstance.parent.objectTypeDescriptions) {
    const objectTypesIds = baseInstance.parent.objectTypes.map(item => item.id); // List of strings of the ID of each object type

    functionsToReturn.predictObjectTypeBeingReferenced = {
      declaration: {
        type: "function",
        function: {
          name: "predictObjectTypeBeingReferenced",
          description: "Predict which type of object is being referenced based on input.",
          strict: true, // As this is here, all properties must be required & additionalProperties set to false
          parameters: {
            type: "object",
            properties: {
              predictedObjectTypeId: {
                type: ["string", "null"],
                description: `ID of predicted object type. Return null if no suitable object type.\n\nDescriptions of object types that can be chosen from:\n${JSON.stringify(baseInstance.parent.objectTypeDescriptions)}`,
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
          const result: FunctionResult = {
            status: 200,
            message: "Predicted object's type",
            data: predictedObjectTypeId,
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
  if (baseInstance.parent.selectedObjectPotentialParentIds) {
    functionsToReturn.predictObjectParent = {
      declaration: {
        type: "function",
        function: {
          name: "predictObjectParent",
          description: "Predict which object is the most appropriate parent object of the given object based on which is most related.",
          strict: true, // As this is here, all properties must be required & additionalProperties set to false
          parameters: {
            type: "object",
            properties: {
              predictedObjectId: {
                type: "string",
                description: "ID of predicted object type",
                enum: baseInstance.parent.selectedObjectPotentialParentIds
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
    console.log("processDataUsingGivenObjectsMetadataStructure called");
    console.log(`nselectedObjectMetadataFunctionProperties: ${JSON.stringify(selectedObjectMetadataFunctionProperties)}`);
    console.log(`objectTypeDescriptions: ${JSON.stringify(baseInstance.parent.objectTypeDescriptions)}`);
    console.log(`selectedObjectTypeId: ${baseInstance.parent.selectedObjectTypeId}`)
    functionsToReturn.processDataUsingGivenObjectsMetadataStructure = {
      declaration: {
        type: "function",
        function: {
          name: "processDataUsingGivenObjectsMetadataStructure",
          description: `Given some data, process it to create an object of type: ${baseInstance.parent.objectTypeDescriptions[baseInstance.parent.selectedObjectTypeId].name}, with description: ${baseInstance.parent.objectTypeDescriptions[baseInstance.parent.selectedObjectTypeId].description}.`,
          strict: true, // As this is here, all properties must be required & additionalProperties set to false
          parameters: {
            type: "object",
            properties: selectedObjectMetadataFunctionProperties,
            required: selectedObjectMetadataFunctionPropertiesRequiredIds,
            additionalProperties: false,
          },
        }
      },
      implementation: async (processedMetadata: processedMetadata) => {
        try {
          console.log(`processDataUsingGivenObjectsMetadataStructure called with: ${config.stringify(processedMetadata)}`);
          const cleanedMetadata = config.removeNullValues(processedMetadata);
          console.log(`cleanedMetadata: ${config.stringify(cleanedMetadata)}`);
          const objectData = {
            id: uuid.v1.generate(),
            owner_organisation_id: baseInstance.parent.organisationId,
            related_object_type_id: baseInstance.parent.selectedObjectTypeId,
            metadata: cleanedMetadata
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
