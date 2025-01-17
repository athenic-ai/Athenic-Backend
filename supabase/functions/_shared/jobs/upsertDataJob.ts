// import { defineSecret } from "firebase-functions/params";
// import { Readable } from "stream";
// import csv from "csv-parser";
// import NLPGeminiPlugin from "../plugins/nlp/nlpGeminiPlugin";
// const geminiApiKeySecret = defineSecret("GEMINI_API_KEY");

import * as config from "../../_shared/configs/index.ts";
import { StorageService } from "../services/storage/storageService.ts";
import { NlpService } from "../services/nlp/nlpService.ts";

interface OrganisationData {
  [key: string]: any;
}

export class UpsertDataJob<T> {
  private readonly storageService: StorageService;
  private readonly nlpService: NlpService;

  constructor(
    storageService: StorageService = new StorageService(),
    nlpService: NlpService = new NlpService(),
  ) {
    this.storageService = storageService;
    this.nlpService = nlpService;
  }

  async start({ connection, dryRun, dataIn, organisationId, organisationData, memberId, objectTypes, objectMetadataTypes, objectTypeDescriptions, fieldTypes, dictionaryTerms }: {
    connection: any;
    dryRun: boolean;
    dataIn: any;
    organisationId?: string;
    organisationData?: OrganisationData;
    memberId?: string;
    objectTypes?: any[];
    objectMetadataTypes?: any[];
    objectTypeDescriptions?: any;
    fieldTypes?: any[];
    dictionaryTerms?: any[];
}): Promise<any> {
    console.log(`Processing data from connection: ${connection} and dryRun: ${dryRun} and dataIn: ${JSON.stringify(dataIn)}`);

    let dataContents, objectTypeId;
    try {
      await this.nlpService.initialiseClientCore();
      await this.nlpService.initialiseClientOpenAi();

      // -----------Step 1: Get organisation's ID and data----------- 
      if (!organisationId || !organisationData) {
        const inferOrganisationResult = await config.inferOrganisation({ connection, dataIn, storageService: this.storageService });

        if (inferOrganisationResult.status != 200) {
          throw Error(inferOrganisationResult.message);
        }
  
        [organisationId, organisationData] = inferOrganisationResult.data;
      }
      console.log(`✅ Completed "Step 1: Get organisation's ID and data", with organisationId: ${organisationId} and organisationData: ${JSON.stringify(organisationData)}`);

      // -----------Step 2: Get object types accessible to the organisation----------- 
      if (!objectTypes) {
        const getObjectTypesResult = await config.getObjectTypes({storageService: this.storageService, organisationId: organisationId});
        if (getObjectTypesResult.status != 200) {
          throw Error(getObjectTypesResult.message);
        }
        objectTypes = getObjectTypesResult.data; // List of maps of object types as in the database  
      }
      const objectTypesIds = objectTypes
        .filter(item => item.category === "organisation_data_standard") // Filter by category NOTE: this line is untested
        .map(item => item.id); // List of strings of the ID of each object type of the organisation_data_standard category

      if (!objectMetadataTypes) {
        const getObjectMetadataTypesResult = await config.getObjectMetadataTypes({storageService: this.storageService, organisationId: organisationId});
        if (getObjectMetadataTypesResult.status != 200) {
          throw Error(getObjectMetadataTypesResult.message);
        }
        objectMetadataTypes = getObjectMetadataTypesResult.data;
      }

      if (!fieldTypes) {
        const getFieldTypesResult = await this.getFieldTypes();
        if (getFieldTypesResult.status != 200) {
          throw Error(getFieldTypesResult.message);
        }
        fieldTypes = getFieldTypesResult.data;
      }

      if (!dictionaryTerms) {
        const getDictionaryTermsResult = await this.getDictionaryTerms();
        if (getDictionaryTermsResult.status != 200) {
          throw Error(getDictionaryTermsResult.message);
        }
        dictionaryTerms = getDictionaryTermsResult.data;
      }

      if (!objectTypeDescriptions) {
        objectTypeDescriptions = config.createObjectTypeDescriptions(objectTypes, objectMetadataTypes); // Example output: {"product":{"name":"Product","description":"An item that is sold to users by teams (e.g. Apple Music is sold to users by Apple).","metadata":{"marketing_url":{"description":"Marketing URL","type":"string"},"types":{"description":"Product types","type":"array","items":{"type":"string"}},"ids":{"description":"In the form:\n   \"android/ios/...\"\n      -> \"id\"","type":"object"}}},"feedback":{"name":"Feedback","description":"Feedback from users about topics such as a product, service, experience or even the organisation in general.","metadata":{"author_name":{"description":"Name/username of the feedback's author.","type":"string"},"feedback_deal_size":{"description":"Estimated or actual deal size of the user submitting the feedback.","type":"number"}}}}
      }

      const [objectMetadataFunctionProperties, objectMetadataFunctionPropertiesRequiredIds] = this.createObjectMetadataFunctionProperties(objectTypes, objectMetadataTypes, fieldTypes, dictionaryTerms); // Example output: {"product":{"marketing_url":{"description":"Marketing URL","type":"string"},"types":{"description":"Product types","type":"array","items":{"type":"string"}}},"feedback":{"author_name":{"description":"Author name: Name/username of the feedback's author.","type":"string"},"feedback_deal_size":{"description":"Deal size: Estimated or actual deal size of the user submitting the feedback.","type":"number"}}}

      this.nlpService.setMemberVariables({
        organisationId,
        organisationData,
        objectTypes,
        objectMetadataTypes,
        objectTypeDescriptions,
        objectMetadataFunctionProperties,
        objectMetadataFunctionPropertiesRequiredIds,
        fieldTypes,
        dictionaryTerms,
      });

      console.log(`✅ Completed "Step 2: Get object types accessible to the organisation", with objectTypesIds: ${JSON.stringify(objectTypesIds)}, objectTypeDescriptions: ${JSON.stringify(objectTypeDescriptions)} and objectMetadataFunctionProperties: ${JSON.stringify(objectMetadataFunctionProperties)}`);

      // -----------Step 3: Prepare the actual data contents-----------
      if (dataIn.companyDataContents) {
        dataContents = dataIn.companyDataContents;
      } else {
        dataContents = dataIn; // If not sent from Athenic, include everything
      }
      console.log(`✅ Completed "Step 3: Prepare the actual data contents", with dataContents: ${config.stringify(dataContents)}`);
      
      // -----------Step 4: Determine which object type the data relates to-----------
      if (dataIn.companyMetadata && dataIn.companyMetadata.objectTypeId) {
        // Add immediately if explictly provided
        objectTypeId = dataIn.companyMetadata.objectTypeId;
      } else {
        const predictObjectTypeBeingReferencedResult = await this.nlpService.execute({
          promptParts: [{"type": "text", "text": `You MUST call the 'predictObjectTypeBeingReferenced' function to decide which object type the following data most likely relates to.
            \n\nData to review:\n${config.stringify(dataContents)}`}],
          systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
          functionUsage: "required",
          functionsIncluded: ["predictObjectTypeBeingReferenced"],
          useLiteModels: true,
        });
        if (predictObjectTypeBeingReferencedResult.status != 200) {
          throw Error(predictObjectTypeBeingReferencedResult.message);
        }
        objectTypeId = predictObjectTypeBeingReferencedResult.data;
      }
      this.nlpService.setMemberVariables({
        selectedObjectTypeId: objectTypeId,
      });
      console.log(`✅ Completed "Step 4: Determine which object type the data relates to", with objectTypeId: ${objectTypeId}`);
    } catch (error) {
      // If haven't even managed to get past this stage, assume it's a critical error and return at this stage
      const result: FunctionResult = {
        status: 500,
        message: `❌ Failed to process data with error: ${error.message}. Please review your data and try again.`,
      };
      return result;
    }

    // -----------Step 5: Process the data using the chosen object type's metadata----------- 
    if (!Array.isArray(dataContents)) {
      console.log(`dataContents is not array so converting it to one (it's currently a ${typeof dataContents})`);
      dataContents = [dataContents]; // Make it a list if not already so that it can be iterated on below
    }
    let dataContentsOutcomes: any[] = []; // If dry run will contain data objects
    let dataContentsFailures: any[] = []; // Lists all failed dataContentsItems
    for (const dataContentsItem of dataContents) {
      try {
        // -----------Step 5a: Process the given data item----------- 
        let processDataPrompt = `You MUST call the 'processDataUsingGivenObjectsMetadataStructure' function to process the following data:\n${config.stringify(dataContentsItem)}
        \n\nTo help, the object type you will be creating is called , and its description is: ${objectTypeDescriptions[objectTypeId].description}.`;
        if (dataIn.companyMetadata && dataIn.companyMetadata.dataDescription) {
          processDataPrompt += `\n\nTo help, here's some context about the data:\n${dataIn.companyMetadata.dataDescription}`;
        }
        
        const processDataUsingGivenObjectsMetadataStructureResult = await this.nlpService.execute({
          promptParts: [{"type": "text", "text": processDataPrompt}],
          systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
          functionUsage: "required",
          functionsIncluded: ["processDataUsingGivenObjectsMetadataStructure"],
          useLiteModels: true,
        });
        if (processDataUsingGivenObjectsMetadataStructureResult.status != 200) {
          throw Error(processDataUsingGivenObjectsMetadataStructureResult.message);
        }
        const newObjectData = processDataUsingGivenObjectsMetadataStructureResult.data;
        if (!newObjectData) {
          throw Error("Failed to process data using the given object's metadata structure");
        }
        console.log(`✅ Completed "Step 5a: Process the given data item", with newObjectData: ${JSON.stringify(newObjectData)}`);
  
        // -----------Step 5b: If object type demands a parent object, determine which object should be the parent-----------
        if (dataIn.companyMetadata && dataIn.companyMetadata.parentObjectId) {
          // Add immediately if explictly provided
          newObjectData.parent_id = dataIn.companyMetadata.parentObjectId;
          console.log(`✅ Completed "Step 5b: Auto assigned object's parent", with: parent id: ${newObjectData.parent_id}`);
        } else {
          const predictedObjectType = objectTypes.find(obj => obj.id === objectTypeId);
          if (predictedObjectType && predictedObjectType.parent_object_type_id) {
            console.log("Starting Step 5bi");
            // Step 5bi: Retrieve all objects of this type
            const parentObjectTypeId = predictedObjectType.parent_object_type_id;
            const getPotentialParentObjectsResult = await this.storageService.getRows('objects', {
              whereOrConditions: [
                { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
                { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
              ],
              whereAndConditions: [
                { column: 'related_object_type_id', operator: 'eq', value: parentObjectTypeId },
              ],
            });
            const potentialParentObjects = getPotentialParentObjectsResult.data;
            console.log(`✅ Completed "Step 5bi: Retrieve all objects of this type", with: ${JSON.stringify(potentialParentObjects)}`);
            if (potentialParentObjects && potentialParentObjects.length) {
              // If there are actually some parent objects found
              const potentialParentObjectsIds = potentialParentObjects.map(item => item.id); // List of strings of the ID of each object type
              this.nlpService.setMemberVariables({
                selectedObjectsIds: potentialParentObjectsIds,
              });
              // Step 5bii: Predict the appropriate object's parent
    
              const newObjectDataCopyLimitedData = structuredClone(newObjectData); // Create a deep copy
              delete newObjectDataCopyLimitedData.id; // Remove the `id` key to help avoid the NLP getting confused and choosing this id as the chosen parent id
              delete newObjectDataCopyLimitedData.owner_organisation_id; // Remove the `owner_organisation_id` key to help avoid the NLP getting confused and taking into account the org name unecessarily
    
              const predictObjectParentResult = await this.nlpService.execute({
                promptParts: [{"type": "text", "text": `You MUST call the 'predictObjectParent' function to decide which object of type ${parentObjectTypeId} is the most appropriate parent for the given object.
                \n\nObject that needs a parent:\n${JSON.stringify(newObjectDataCopyLimitedData)}
                \n\nObjects that can be chosen from:\n${JSON.stringify(potentialParentObjects)}`}],
                systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
                functionUsage: "required",
                functionsIncluded: ["predictObjectParent"],
                useLiteModels: true,
              });
              console.log(`✅ Completed "Step 5bii: Predict the appropriate object's parent", with: ${JSON.stringify(predictObjectParentResult)}`)
              if (predictObjectParentResult.status == 200 && predictObjectParentResult.data) {
                // Step 5biii: Assign a parent object assuming one could be found
                newObjectData.parent_id = predictObjectParentResult.data;
                console.log(`✅ Completed "Step 5biii: Assign a parent object assuming one could be found", with: ${JSON.stringify(newObjectData)}`);
              }
            } else {
              console.log("Not adding parent to object as no objects of suitable type found");
            }
          } else {
            console.log(`Not adding parent to object as predictedObjectType: ${predictedObjectType} and/or predictedObjectType.parent_object_type_id: ${predictedObjectType.parent_object_type_id}`);
          }
        }
        
        // -----------Step 5c: Save object as appropriate-----------
        if (dryRun) {
          // Not actually saving data if dry run, just returning what would be saved
          dataContentsOutcomes.push(newObjectData);
        } else {
          let objectToUpdate;

          if (dataIn.companyMetadata && dataIn.companyMetadata.requiredMatchThreshold) {
            // If requiredMatchThreshold specified, means source is open for the new data to be merged with an existing object
            const searchRowsResult = await this.storageService.searchRows({
              table: "objects",
              queryText: JSON.stringify(newObjectData),
              matchThreshold: dataIn.companyMetadata.requiredMatchThreshold,
              matchCount: 1, // TODO: potentially add support for merging multiple objects if multiple are returned from search. Currently just uses the first if multiple.
              nlpService: this.nlpService,
              relatedObjectTypeId: newObjectData.related_object_type_id,
              organisationId,
              memberId,
            });
            if (searchRowsResult.status != 200) {
              throw Error(searchRowsResult.message);
            }
            if (searchRowsResult.data && searchRowsResult.data[0] && searchRowsResult.data[0].related_object_type_id === newObjectData.related_object_type_id) {
              objectToUpdate = searchRowsResult.data[0]; // Assign the object to update if one has been found and it's of the same type
            }
          }
          let objectThatWasStored;
          if (objectToUpdate) {
            console.log(`Saving object by updating existing object: ${JSON.stringify(objectToUpdate)}`);
            // Update existing object
            let processDataPrompt = `You MUST call the 'processDataUsingGivenObjectsMetadataStructure' function to update a given object considering new data:
            \n\nExisting object's data:${config.stringify(objectToUpdate)}
            \n\nNew data:${config.stringify(newObjectData)}`;
            const mergedObjectResult = await this.nlpService.execute({
              promptParts: [{"type": "text", "text": processDataPrompt}],
              systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
              functionUsage: "required",
              functionsIncluded: ["processDataUsingGivenObjectsMetadataStructure"],
              useLiteModels: true,
            });
            if (mergedObjectResult.status != 200) {
              throw Error(mergedObjectResult.message);
            }
            const mergedObjectData = mergedObjectResult.data;
            if (!mergedObjectData) {
              throw Error("Failed to merge data using the given object's metadata structure");
            }

            // Add new metadata to object already stored in DB (as want to retain data like created_at and parent_id)
            const objectUpdateResult = await this.storageService.updateRow({
              table: "objects",
              keys: {id: objectToUpdate.id},
              rowData: {
                metadata: mergedObjectData.metadata,
                related_ids: dataIn.companyMetadata?.newRelatedIds ?? null,
                updated_at: new Date(),
              },
              nlpService: this.nlpService,
              mayAlreadyExist: true,
            });
            if (objectUpdateResult.status != 200) {
              throw Error(objectUpdateResult.message);
            }
            objectThatWasStored = objectToUpdate;
          } else {
            console.log(`Saving object by creating new object with ID: ${newObjectData.id}`);

            // Just in case newObjectData already has some related_ids, merge them with the new ones
            newObjectData.related_ids = newObjectData.related_ids || (dataIn.companyMetadata && dataIn.companyMetadata.newRelatedIds)
              ? {
                  ...(newObjectData.related_ids || {}), // Use an empty object if related_ids is undefined
                  ...Object.keys(dataIn.companyMetadata.newRelatedIds || {}).reduce((acc, key) => {
                    acc[key] = [
                      ...((newObjectData.related_ids && newObjectData.related_ids[key]) || []), // Existing values or an empty array
                      ...(dataIn.companyMetadata.newRelatedIds?.[key] || []), // New values or an empty array
                    ];
                    return acc;
                  }, {} as Record<string, string[]>),
                }
              : null;

            // Create new object
            const objectCreateResult = await this.storageService.updateRow({
              table: "objects",
              keys: {id: newObjectData.id},
              rowData: newObjectData,
              nlpService: this.nlpService,
              mayAlreadyExist: false,
            });
            if (objectCreateResult.status != 200) {
              throw Error(objectCreateResult.message);
            }

            // Update the object's parent, if it exists, with new child_id value
            if (newObjectData.parent_id) {
              const objectParentUpdateResult = await this.storageService.updateRow({
                table: "objects",
                keys: {id: newObjectData.parent_id},
                rowData: {
                  child_ids: {[newObjectData.related_object_type_id]: [newObjectData.id]},
                },
                nlpService: this.nlpService,
                mayAlreadyExist: true,
              });
              if (objectParentUpdateResult.status != 200) {
                throw Error(objectParentUpdateResult.message);
              }
            } else {
              console.log("No parent so not updating any other object");
            }

            objectThatWasStored = newObjectData;
          }
          if (dataIn.companyMetadata && dataIn.companyMetadata.newRelatedIds) {
            // Iterate through each type and its related IDs in the map
            for (const [relatedObjectType, relatedIds] of Object.entries(dataIn.companyMetadata.newRelatedIds)) {
              // For each ID in the list for this type
              for (const relatedId of relatedIds) {
                  // Update the related object with the new related_id value
                  console.log(`Update the related object with the new related_id value: ${relatedId} (type: ${relatedObjectType})`);
                  const relatedObjectUpdateResult = await this.storageService.updateRow({
                      table: "objects",
                      keys: {id: relatedId},
                      rowData: {
                          related_ids: {
                              [objectThatWasStored.related_object_type_id]: [objectThatWasStored.id],
                          },
                      },
                      nlpService: this.nlpService,
                      mayAlreadyExist: true,
                  });
                  if (relatedObjectUpdateResult.status != 200) {
                      throw Error(relatedObjectUpdateResult.message);
                  }
              }
            }
          }

          this.nlpService.setMemberVariables({
            selectedObject: objectThatWasStored,
          });

          const assistantPrompt = `${config.ASSISTANT_SYSTEM_INSTRUCTION}
          \nBear in mind:
          \n\n - New data has just been stored in Athenic. Critically analyse this data as the Athenic AI, making tool calls when necessary, and then store one signal object type based on your analysis, and also store any jobs you also think need to be done based on this analysis.
          \n\n - For context, signals are described as:\n${objectTypeDescriptions[config.OBJECT_TYPE_ID_SIGNAL].description}.
          \n\n - For context, jobs are described as:\n${objectTypeDescriptions[config.OBJECT_TYPE_ID_JOB].description}.
          \n\n - Don't ask for clarification or approval before taking action, as the your reply won't be seen by the member. Just make your best guess.
          \n\n - Data that has just been stored:\n${config.stringify(objectThatWasStored)}.`

          return await this.nlpService.executeThread({
            prompt: assistantPrompt,
          });
        }
        console.log(`✅ Completed "Step 5c: Save object as appropriate", with: dryRun: ${dryRun}`);
      }
      catch (error) {
        dataContentsFailures.push(`Failed to process data with error: ${error.message}.\n Data: ${config.stringify(dataContentsItem)}.`);
      }
    }

    if (dataContentsFailures.length) {
      console.error(`Failed to process data:\n\n${dataContentsFailures.join("\n")}`);
      const result: FunctionResult = {
        status: 500,
        message: "Failed to process data. The data that failed was:\n\n" + dataContentsFailures.join("\n"),
        data: dryRun ? dataContentsOutcomes : null,
      };
      return result;
    } else {
      const result: FunctionResult = {
        status: 200,
        message: dryRun ? "Successfully processed data." : "Successfully processed and stored data.",
        data: dryRun ? dataContentsOutcomes : null,
      };
      return result;
    }
  }

  private async getFieldTypes(): Promise<FunctionResult> {
    try {
      const getFieldTypesResult = await this.storageService.getRows('field_types', {
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

  private async getDictionaryTerms(): Promise<FunctionResult> {
    try {
      const getDictionaryTermsResult = await this.storageService.getRows('dictionary_terms', {
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

  private createObjectMetadataFunctionProperties(
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
          property.type = fieldTypeMap.data_type; // Assign data type by retrieving the data type based on the matching field_type_id
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

          // Add to requiredIds if is_required is true
          if (meta.is_required) {
            requiredIds.push(meta.id);
          }
        } else {
          // Skipping metadata as allow_ai_update is false for objectType.id
        }
      });
  
      // Assign to the maps
      if (properties) {
        objectMetadataFunctionProperties[objectType.id] = properties;
      }
      if (requiredIds) {
        objectMetadataFunctionPropertiesRequiredIds[objectType.id] = requiredIds;
      }
    });
  
    // Return both maps
    return [objectMetadataFunctionProperties, objectMetadataFunctionPropertiesRequiredIds];
  }
}