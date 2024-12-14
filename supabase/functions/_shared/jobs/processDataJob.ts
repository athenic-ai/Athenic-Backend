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

export class ProcessDataJob<T> {
  private readonly storageService: StorageService;
  private readonly nlpService: NlpService;
  // private tasksService: any;

  constructor(
    // tasksService: any,
    storageService: StorageService = new StorageService(),
    nlpService: NlpService = new NlpService(),
  ) {
    this.storageService = storageService;
    this.nlpService = nlpService;
    // this.tasksService = tasksService;
  }

  async start({ connection, dryRun, dataIn }: {
    connection: any;
    dryRun: boolean;
    dataIn: any;
}): Promise<any> {
    console.log(`Processing data from connection: ${connection} and dryRun: ${dryRun}`);
    let dataContents, objectTypes, objectTypeId;
    try {
      await this.nlpService.initialiseClientCore();
      // -----------Step 1: Get organisation's ID and data----------- 
      const inferOrganisationResult = await this.inferOrganisation({ connection, dataIn });
      let organisationId, organisationData;

      if (inferOrganisationResult.status != 200) {
        throw Error(inferOrganisationResult.message);
      }

      [organisationId, organisationData] = inferOrganisationResult.data;
      console.log(`✅ Completed "Step 1: Get organisation's ID and data", with organisationId: ${organisationId} and organisationData: ${JSON.stringify(organisationData)}`);

      // -----------Step 2: Get object types accessible to the organisation----------- 
      const getObjectTypesResult = await this.getObjectTypes({organisationId: organisationId});
      if (getObjectTypesResult.status != 200) {
        throw Error(getObjectTypesResult.message);
      }
      objectTypes = getObjectTypesResult.data; // List of maps of object types as in the database
      const objectTypesIds = objectTypes.map(item => item.id); // List of strings of the ID of each object type
      objectTypesIds.push("unknown"); // Also add unknown in cases it cannot detect which to return // TODO: handle cases when data falls into this category, eg. setting it as some generic/general object type

      const getObjectMetadataTypesResult = await this.getObjectMetadataTypes({organisationId: organisationId});
      if (getObjectMetadataTypesResult.status != 200) {
        throw Error(getObjectMetadataTypesResult.message);
      }
      const objectMetadataTypes = getObjectMetadataTypesResult.data;

      console.log("AA");

      const objectTypeDescriptions = this.createObjectTypeDescriptions(objectTypes, objectMetadataTypes); // Example output: {"product":{"name":"Product","description":"An item that is sold to users by teams (e.g. Apple Music is sold to users by Apple).","metadata":{"product_marketing_url":{"description":"Marketing URL","type":"string"},"product_types":{"description":"Product types","type":"array","items":{"type":"string"}},"product_ids":{"description":"In the form:\n   \"android/ios/...\"\n      -> \"id\"","type":"object"}}},"feedback":{"name":"Feedback","description":"Feedback from users about topics such as a product, service, experience or even the organisation in general.","metadata":{"feedback_author_name":{"description":"Name/username of the feedback's author.","type":"string"},"feedback_deal_size":{"description":"Estimated or actual deal size of the user submitting the feedback.","type":"number"}}}}
      console.log(`objectTypeDescriptions: ${JSON.stringify(objectTypeDescriptions)}`)

      const [objectMetadataFunctionProperties, objectMetadataFunctionPropertiesRequiredIds] = this.createObjectMetadataFunctionProperties(objectTypes, objectMetadataTypes); // Example output: {"product":{"product_marketing_url":{"description":"Marketing URL","type":"string"},"product_types":{"description":"Product types","type":"array","items":{"type":"string"}}},"feedback":{"feedback_author_name":{"description":"Author name: Name/username of the feedback's author.","type":"string"},"feedback_deal_size":{"description":"Deal size: Estimated or actual deal size of the user submitting the feedback.","type":"number"}}}
      console.log(`objectMetadataFunctionProperties: ${JSON.stringify(objectMetadataFunctionProperties)}`)
      console.log(`objectMetadataFunctionPropertiesRequiredIds: ${JSON.stringify(objectMetadataFunctionPropertiesRequiredIds)}`);

      this.nlpService.setMemberVariables({
        organisationId: organisationId,
        organisationData: organisationData,
        supportedObjectTypeIds: objectTypesIds,
        objectMetadataFunctionProperties: objectMetadataFunctionProperties,
        objectMetadataFunctionPropertiesRequiredIds: objectMetadataFunctionPropertiesRequiredIds,
      });

      console.log(`✅ Completed "Step 2: Get object types accessible to the organisation", with objectTypesIds: ${JSON.stringify(objectTypesIds)}, objectTypeDescriptions: ${JSON.stringify(objectTypeDescriptions)} and objectMetadataFunctionProperties: ${JSON.stringify(objectMetadataFunctionProperties)}`);

      // -----------Step 3: Prepare the actual data contents-----------
      if (dataIn.athenicDataContents) {
        dataContents = dataIn.athenicDataContents;
      } else {
        dataContents = dataIn; // If not sent from Athenic, include everything
      }
      console.log(`✅ Completed "Step 3: Prepare the actual data contents", with dataContents: ${JSON.stringify(dataContents)}`);

      // -----------Step 4: Determine which object type the data relates to-----------
      if (dataIn.athenicMetadata && dataIn.athenicMetadata.objectTypeId) {
        // Add immediately if explictly provided
        objectTypeId = dataIn.athenicMetadata.objectTypeId;
      } else {
        const predictObjectTypeBeingReferencedResult = await this.nlpService.execute({
          text: `You MUST call the 'predictObjectTypeBeingReferenced' function to decide which object type the following data most likely relates to.
            \n\nObject types that can be chosen from:\n${JSON.stringify(objectTypeDescriptions)}
            \n\nData to review:\n${config.stringify(dataContents)}`,
          systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
          functionUsage: "required",
          limitedFunctionSupportList: ["predictObjectTypeBeingReferenced"],
          useLiteModels: true,
        });
        console.log("d");
        console.log("predictObjectTypeBeingReferenced:", predictObjectTypeBeingReferencedResult);
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
        message: `Failed to process data with error: ${error.message}. Please review your data and try again.`,
      };
      return result;
    }

    // -----------Step 5: Process the data using the chosen object type's metadata----------- 
    if (!Array.isArray(dataContents)) {
      console.log(`dataContents is not array so converting it to one (it's currently a ${typeof dataContents})`);
      dataContents = [dataContents]; // Make it a list if not already so that it can be iterated on below
    }
    let dataContentsOutcomes: any[] = []; // If dry run will contain data objects, otherwise will list all failed dataContentsItems
    for (const dataContentsItem of dataContents) {
      try {
        // -----------Step 5a: Process the given data item----------- 
        let processDataPrompt = `You MUST call the 'processDataUsingGivenObjectsMetadataStructure' function to process the following data:\n${config.stringify(dataContentsItem)}`;
        if (dataIn.athenicMetadata && dataIn.athenicMetadata.dataDescription) {
          processDataPrompt += `\n\nTo help, the member has provided the following context about the data:\n${dataIn.athenicMetadata.dataDescription}`;
        }
        const processDataUsingGivenObjectsMetadataStructureResult = await this.nlpService.execute({
          text: processDataPrompt,
          systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
          functionUsage: "required",
          limitedFunctionSupportList: ["processDataUsingGivenObjectsMetadataStructure"],
          useLiteModels: true,
        });
        console.log("d");
        if (processDataUsingGivenObjectsMetadataStructureResult.status != 200) {
          throw Error(processDataUsingGivenObjectsMetadataStructureResult.message);
        }
        const objectData = processDataUsingGivenObjectsMetadataStructureResult.data;
        console.log("objectData:", objectData);
        console.log(`✅ Completed "Step 5a: Process the given data item", with objectData: ${JSON.stringify(objectData)}`);
  
        // -----------Step 5b: If object type demands a parent object, determine which object should be the parent-----------
        if (dataIn.athenicMetadata && dataIn.athenicMetadata.parentObjectId) {
          // Add immediately if explictly provided
          objectData.parent_id = dataIn.athenicMetadata.parentObjectId;
        } else {
          const predictedObjectType = objectTypes.find(obj => obj.id === objectTypeId);
          if (predictedObjectType && predictedObjectType.parent_object_type_id) {
            // Step 5bi: Retrieve all objects of this type
            const parentObjectTypeId = predictedObjectType.parent_object_type_id;
            const getPotentialParentObjectsResult = await this.storageService.getRows('objects', {
              whereOrConditions: [
                { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
                { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
              ],
              whereAndConditions: [
                { column: 'related_type_id', operator: 'eq', value: parentObjectTypeId },
              ],
            });
            const potentialParentObjects = getPotentialParentObjectsResult.data;
            console.log(`potentialParentObjects: ${JSON.stringify(potentialParentObjects)}`);
            console.log(`✅ Completed "Step 5bi: Retrieve all objects of this type", with: ${JSON.stringify(potentialParentObjects)}`);
            if (potentialParentObjects && potentialParentObjects.length) {
              // If there are actually some parent objects found
              const potentialParentObjectsIds = potentialParentObjects.map(item => item.id); // List of strings of the ID of each object type
              console.log("potentialParentObjectsIds", potentialParentObjectsIds);
              this.nlpService.setMemberVariables({
                selectedObjectsIds: potentialParentObjectsIds,
              });
              // Step 5bii: Predict the appropriate object's parent
              console.log("1");
    
              const objectDataCopyLimitedData = structuredClone(objectData); // Create a deep copy
              delete objectDataCopyLimitedData.id; // Remove the `id` key to help avoid the NLP getting confused and choosing this id as the chosen parent id
              delete objectDataCopyLimitedData.owner_organisation_id; // Remove the `owner_organisation_id` key to help avoid the NLP getting confused and taking into account the org name unecessarily
    
              const predictObjectParentResult = await this.nlpService.execute({
                text: `You MUST call the 'predictObjectParent' function to decide which object of type ${parentObjectTypeId} is the most appropriate parent for the given object.
                \n\nObject that needs a parent:\n${JSON.stringify(objectDataCopyLimitedData)}
                \n\nObjects that can be chosen from:\n${JSON.stringify(potentialParentObjects)}`,
                systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
                functionUsage: "required",
                limitedFunctionSupportList: ["predictObjectParent"],
                useLiteModels: true,
              });
              console.log("2");
              console.log("predictObjectParentResult:", predictObjectParentResult);
              console.log(`✅ Completed "Step 5bii: Predict the appropriate object's parent", with: ${JSON.stringify(predictObjectParentResult)}`)
              if (predictObjectParentResult.status == 200 && predictObjectParentResult.data) {
                // Step 5biii: Assign a parent object assuming one could be found
                objectData.parent_id = predictObjectParentResult.data;
                console.log(`✅ Completed "Step 5biii: Assign a parent object assuming one could be found", with: ${JSON.stringify(objectData)}`);
              }
            } else {
              console.log("Not adding parent to object as no objects of suitable type found");
            }
          }
        }
        
        // -----------Step 5c: Save object as appropriate-----------
        if (dryRun) {
          // Not actually saving data if dry run, just returning what would be saved
          dataContentsOutcomes.push(objectData);
        } else {
          const objectsUpdateResult = await this.storageService.updateRow({
            table: "objects",
            keys: {id: objectData.id},
            rowData: objectData,
            mayBeNew: true,
          });
    
          if (objectsUpdateResult.status != 200) {
            throw Error(objectsUpdateResult.message);
          }
        }
        console.log(`✅ Completed "Step 5c: Save object as appropriate", with: dryRun: ${dryRun}`);
      }
      catch (error) {
        dataContentsOutcomes.push(`Failed to process: ${config.stringify(dataContentsItem)}. Error: ${error.message}`);
      }
    }

    const result: FunctionResult = {
      status: 200,
      message: "Successfully processed and stored data.",
      data: dataContentsOutcomes,
    };
    return result;
  }

  private async inferOrganisation({ connection, dataIn }: { connection: string; dataIn: T }): Promise<FunctionResult> {
    try {
      let organisationId;
      if (dataIn.athenicMetadata && dataIn.athenicMetadata.organisationId) {
        // See if organisationId already stored in dataIn (connections such as CSV upload support this)
        organisationId = dataIn.athenicMetadata.organisationId;
      } else if (connection === "email") {
        // Infer organisationId from the domain of the sender if connection is email
        organisationId = dataIn.recipient.split("@")[0];
      } else if (connection === "productfruits") {
        const mappingResult = await this.storageService.getRow({table: "connection_organisation_mapping", keys: {connection: connection, connection_id: dataIn.data.projectCode}});
        organisationId = mappingResult.data.organisation_id;
      }
  
      if (organisationId) {
        const organisationDataResult = await this.storageService.getRow({table: "organisations", keys: {id: organisationId}});
        if (organisationDataResult.data) {
          console.log(`inferOrganisation successful with organisationId: ${organisationId}`)
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
        message: error.message,
      };
      console.error(result.message);
      return result;
    }
  }

  private async getObjectTypes({ organisationId }: { organisationId: string }): Promise<FunctionResult> {
    try {
      console.log("buildStructuredObjectFunctions() called");
      const getObjectTypesResult = await this.storageService.getRows('object_types', {
        whereOrConditions: [
          { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
          { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
        ],
      });
      if (getObjectTypesResult.status != 200) {
        return new Error(getObjectTypesResult.message);
      }
      const objectTypes = getObjectTypesResult.data;
      console.log(`objectTypes: ${JSON.stringify(objectTypes)}`)
      const result: FunctionResult = {
        status: 200,
        message: "Success running getObjectTypes",
        data: objectTypes,
      };
      return result;
    } catch(error) {
      const result: FunctionResult = {
        status: 500,
        message: error.message,
      };
      console.error(result.message);
      return result;
    }
  }

  private async getObjectMetadataTypes({ organisationId }: { organisationId: string }): Promise<FunctionResult> {
    try {
      console.log("getObjectMetadataTypes() called");
      const getObjectMetadataTypesResult = await this.storageService.getRows('object_metadata_types', {
        whereOrConditions: [
          { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
          { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
        ],
      });
      if (getObjectMetadataTypesResult.status != 200) {
        return new Error(getObjectMetadataTypesResult.message);
      }
      const objectMetadataTypes = getObjectMetadataTypesResult.data;
      console.log(`objectMetadataTypes: ${JSON.stringify(objectMetadataTypes)}`)
      const result: FunctionResult = {
        status: 200,
        message: "Success running getObjectMetadataTypes",
        data: objectMetadataTypes,
      };
      return result;
    } catch(error) {
      const result: FunctionResult = {
        status: 500,
        message: error.message,
      };
      console.error(result.message);
      return result;
    }
  }

  private createObjectTypeDescriptions(objectTypes: any[], metadataTypes: any[]) {
    // Returns a map where the keys are each object type's ID, and the values are:
    // - The object type's name
    // - The object type's description
    // - The object type's metadata, which is a map containing metadata info, including cases where related_object_type_id is null
    console.log(`createObjectTypeDescriptions called with objectTypes: ${JSON.stringify(objectTypes)} and metadataTypes: ${JSON.stringify(metadataTypes)}`);
  
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
  
        if (meta.is_array) {
          property.type = "array";
          property.items = { type: meta.data_type };
        } else {
          property.type = meta.data_type;
        }
  
        if (meta.enum) {
          property.enum = meta.enum; // Assuming `meta.enum` is an array of possible values
        }
  
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

  private createObjectMetadataFunctionProperties(
    objectTypes: any[],
    metadataTypes: any[]
  ): [Record<string, Record<string, any>>, Record<string, string[]>] {
    // Creates two maps:  
    // 1. `objectMetadataFunctionProperties` - A map where the key is the object ID and the value is a structured object describing for the AI how to create this object's metadata, including metadata where `related_object_type_id` is `null` and excluding those with `allow_ai_update` explicitly set to `false`.  
    // 2. `objectMetadataFunctionPropertiesRequiredIds` - A map where the key is the metadata ID and the value is a list of all the metadata type ids where `is_required` property is `true` (if allow_ai_update marked as false, these will already be exlcuded from this even if is_required is set to true)
    console.log(
      `createStructuredObjectFunctions called with objectTypes: ${JSON.stringify(
        objectTypes
      )} and metadataTypes: ${JSON.stringify(metadataTypes)}`
    );
  
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
        const description = meta.description
          ? `${meta.name}: ${meta.description}`
          : meta.name;
  
        const property: any = {
          description,
        };
  
        if (meta.is_array) {
          property.type = "array";
          property.items = { type: meta.data_type };
        } else {
          property.type = meta.data_type;
        }
  
        if (meta.enum) {
          property.enum = meta.enum; // Assuming `meta.enum` is an array of possible values
        }
  
        properties[meta.id] = property;
  
        // Add to requiredIds if is_required is true
        if (meta.is_required) {
          requiredIds.push(meta.id);
        }
      });
  
      // Assign to the maps
      objectMetadataFunctionProperties[objectType.id] = properties;
      objectMetadataFunctionPropertiesRequiredIds[objectType.id] = requiredIds;
    });
  
    // Return both maps
    return [objectMetadataFunctionProperties, objectMetadataFunctionPropertiesRequiredIds];
  }
}