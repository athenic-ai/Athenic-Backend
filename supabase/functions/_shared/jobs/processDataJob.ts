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
  private storageService: StorageService;
  private nlpService: NlpService;
  // private tasksService: any;

  constructor(
    // tasksService: any,
    storageService: StorageService = new StorageService(),
    nlpService: NLPService = new NlpService(),
  ) {
    this.storageService = storageService;
    this.nlpService = nlpService;
    // this.tasksService = tasksService;
  }

  async start({ connection, dataType, dryRun, data }: {
    connection: any;
    dataType: any;
    data: any;
    dryRun: boolean;
}): Promise<any> {
    console.log(`Processing data from connection: ${connection}`);
    try {
      const inferOrganisationResult = await this.inferOrganisation({ connection, data });
      let organisationId, organisationData;

      if (inferOrganisationResult.status != 200) {
        throw Error(inferOrganisationResult.message);
      }

      [organisationId, organisationData] = inferOrganisationResult.data;
      console.log(`Use these: organisationId: ${organisationId} and organisationData: ${JSON.stringify(organisationData)}`);

      const buildStructuredObjectFunctionsResult = await this.buildStructuredObjectFunctions({organisationId: organisationId});

      if (buildStructuredObjectFunctionsResult.status != 200) {
        throw Error(buildStructuredObjectFunctionsResult.message);
      }

      const structuredObjectFunctions = buildStructuredObjectFunctionsResult.data;

      console.log("a");
      this.nlpService.setMemberVariables({organisationId: organisationId});
      console.log("b");
      await this.nlpService.initialiseClientCore();
      console.log("c");
      const nlpServiceMathsTestResult = await this.nlpService.execute({
        text: "hello, whats 2+3",
        // text: "Some data needs to be processed and stored in the DB. Process this data by choosing the most appropriate function.",
        systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
        limitedFunctionSupportList: [],
        // limitedFunctionSupportList: structuredObjectFunctions,
        useLiteModel: true,
      });
      // console.log("d");
      // console.log(`nlpServiceMathsTestResult: ${JSON.stringify(nlpServiceMathsTestResult)}`);


      const result: FunctionResult = {
        status: 200,
        message: "Successfully processed and stored data",
      };
      return result;
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: "Error in ProcessDataJob: " + error.message,
      };
      return result;
    }
  }

  private async inferOrganisation({ connection, data }: { connection: string; data: T }): Promise<FunctionResult> {
    try {
      let organisationId;
      if (data.organisationId) {
        // See if organisationId already stored in data (connections such as CSV upload support this)
        organisationId = feedbackData.organisationId;
      } else if (connection === "email") {
        // Infer organisationId from the domain of the sender if connection is email
        organisationId = data.recipient.split("@")[0];
      } else if (connection === "productfruits") {
        const mappingResult = await this.storageService.getRow({table: "connection_organisation_mapping", keys: {connection: connection, connection_id: data.data.projectCode}});
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

  private async buildStructuredObjectFunctions({ organisationId }: { organisationId: string }): Promise<FunctionResult> {
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
  
      const getObjectMetadataTypesResult = await this.storageService.getRows('object_metadata_types', {
        whereOrConditions: [
          { column: 'owner_organisation_id', operator: 'is', value: null }, // Include default entries where owner org not set
          { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
        ],
      });
      if (getObjectMetadataTypesResult.status != 200) {
        return new Error(getObjectMetadataTypesResult.message);
      }
      const objectTypesMetadata = getObjectMetadataTypesResult.data;
      console.log(`objectTypesMetadata: ${JSON.stringify(objectTypesMetadata)}`)

      const structuredObjectFunctions = this.createStructuredObjectFunctions(objectTypes, objectTypesMetadata);
  
      console.log(`structuredObjectFunctions: ${JSON.stringify(structuredObjectFunctions)}`)

      const result: FunctionResult = {
        status: 200,
        message: "Success running buildStructuredObjectFunctions",
        data: structuredObjectFunctions,
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

  createStructuredObjectFunctions(objectTypes: any[], metadataTypes: any[]) {
    return objectTypes.map((objectType) => {
      const relatedMetadata = metadataTypes.filter(
        (meta) => meta.owner_object_type_id === objectType.id
      );
  
      const properties = relatedMetadata.reduce((acc, meta) => {
        const description = meta.description ? `${meta.name}: ${meta.description}` : meta.name;
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
  
      return properties;
    });
  }
}