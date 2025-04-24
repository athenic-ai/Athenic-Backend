import * as config from "../../_shared/configs/index.ts";
import { FunctionResult, WhereCondition } from "../../_shared/configs/index.ts";
import { StorageService } from "../services/storage/storageService.ts";
import { NlpService } from "../services/nlp/nlpService.ts";
import { v4 as uuidv4 } from "jsr:@std/uuid";
// import * as uuid from "jsr:@std/uuid"; // TODO: Replace with Node-compatible uuid if needed

interface OrganisationData {
  [key: string]: any;
}

export class ExecuteJobs<T> {
  private readonly storageService: StorageService;
  private readonly nlpService: NlpService;

  constructor(
    nlpService: NlpService, // Want nlpService to be re-used to retain variables across calls
    storageService: StorageService = new StorageService(),
  ) {
    this.nlpService = nlpService;
    this.storageService = storageService;
  }

  async start({ dataIn, organisationId, organisationData, memberId, objectTypes, objectMetadataTypes, objectTypeDescriptions, fieldTypes, dictionaryTerms }: {
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
    console.log(`Executing jobs with dataIn: ${config.stringify(dataIn)}`);
    let jobObjects;
    try {
      // TODO: Replace with actual API key retrieval logic
      const coreApiKey = process.env.NLP_CORE_API_KEY || "dummy-core-key";
      const openAiApiKey = process.env.OPENAI_API_KEY || "dummy-openai-key";

      await this.nlpService.initialiseClientCore(coreApiKey);
      await this.nlpService.initialiseClientOpenAi(openAiApiKey);
      
       // -----------Step 1: Get organisation's ID and data----------- 
      console.log(`⏭️ Starting "Step 1: Get organisation's ID and data"`);
      if (!organisationId || !organisationData) {
        if (!organisationId && dataIn.companyMetadata?.organisationId) {
          organisationId = dataIn.companyMetadata.organisationId;
        } else {
          throw new Error("Unable to find organisationId");
        }

        if (!organisationData) {
          const organisationDataResult = await this.storageService.getRow({table: "organisations", keys: {id: organisationId}});
          if (organisationDataResult.data) {
            organisationData = organisationDataResult.data
          } else {
            throw new Error(`Unable to find organisationData for organisationId ${organisationId}`);
          }
        }
      }

      console.log(`✅ Completed "Step 1: Get organisation's ID and data", with organisationId: ${organisationId} and organisationData: ${JSON.stringify(organisationData)}`);


      // -----------Step 2: Get object types accessible to the organisation----------- 
      console.log(`⏭️ Starting "Step 2: Get object types accessible to the organisation"`);
      if (!objectTypes) {
        const getOrganisationObjectTypesResult = await config.getOrganisationObjectTypes({
          storageService: this.storageService,
          organisationId: organisationId || "dummy-org-id",
          memberId: memberId || "dummy-member-id"
        });
        if (getOrganisationObjectTypesResult.status != 200) {
          throw Error(getOrganisationObjectTypesResult.message ?? 'Unknown error');
        }
        objectTypes = getOrganisationObjectTypesResult.data as any[]; // List of maps of object types as in the database  
      }

      if (!objectMetadataTypes) {
        const getObjectMetadataTypesResult = await config.getObjectMetadataTypes({
          storageService: this.storageService,
          organisationId: organisationId || "dummy-org-id",
          memberId: memberId || "dummy-member-id"
        });
        if (getObjectMetadataTypesResult.status != 200) {
          throw Error(getObjectMetadataTypesResult.message ?? 'Unknown error');
        }
        objectMetadataTypes = getObjectMetadataTypesResult.data as any[];
      }

      if (!fieldTypes) {
        const getFieldTypesResult = await config.getFieldTypes({storageService: this.storageService});
        if (getFieldTypesResult.status != 200) {
          throw Error(getFieldTypesResult.message ?? 'Unknown error');
        }
        fieldTypes = getFieldTypesResult.data as any[];
      }

      if (!dictionaryTerms) {
        const getDictionaryTermsResult = await config.getDictionaryTerms({storageService: this.storageService});
        if (getDictionaryTermsResult.status != 200) {
          throw Error(getDictionaryTermsResult.message ?? 'Unknown error');
        }
        dictionaryTerms = getDictionaryTermsResult.data as any[];
      }

      if (!objectTypeDescriptions) {
        objectTypeDescriptions = config.createObjectTypeDescriptions(objectTypes, objectMetadataTypes); // Example output: {"product":{"name":"Product","description":"An item that is sold to users by teams (e.g. Apple Music is sold to users by Apple).","metadata":{"marketing_url":{"description":"Marketing URL","type":"string"},"types":{"description":"Product types","type":"array","items":{"type":"string"}},"ids":{"description":"In the form:\n   \"android/ios/...\"\n      -> \"id\"","type":"object"}}},"feedback":{"name":"Feedback","description":"Feedback from users about topics such as a product, service, experience or even the organisation in general.","metadata":{"author_name":{"description":"Name/username of the feedback's author.","type":"string"},"feedback_deal_size":{"description":"Estimated or actual deal size of the user submitting the feedback.","type":"number"}}}}
      }

      const [objectMetadataFunctionProperties, objectMetadataFunctionPropertiesRequiredIds] = config.createObjectMetadataFunctionProperties(objectTypes, objectMetadataTypes, fieldTypes, dictionaryTerms); // Example output: {"product":{"marketing_url":{"description":"Marketing URL","type":"string"},"types":{"description":"Product types","type":"array","items":{"type":"string"}}},"feedback":{"author_name":{"description":"Author name: Name/username of the feedback's author.","type":"string"},"feedback_deal_size":{"description":"Deal size: Estimated or actual deal size of the user submitting the feedback.","type":"number"}}}

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
      console.log(`✅ Completed "Step 2: Get object types accessible to the organisation"`);
      

      // -----------Step 3: Get jobs data----------- 
      console.log(`⏭️ Starting "Step 3: Get jobs data"`);

      const whereOrConditions = [];
      if (!dataIn.companyDataContents) {
        throw new Error("No jobs found to be executed.");
      }
      for (const jobId of dataIn.companyDataContents) {
        whereOrConditions.push({ column: 'id', operator: 'eq', value: jobId });
      }

      // TODO: add support for member-specific jobs
      const getJobObjectsResult = await this.storageService.getRows(config.OBJECT_TABLE_NAME, {
        whereOrConditions: (whereOrConditions as WhereCondition[]),
        whereAndConditions: [
          { column: 'owner_organisation_id', operator: 'eq', value: organisationId }, // Include entries created by the org
        ],
        removeEmbeddings: true // Exclude embeddings to reduce payload size
      });
      jobObjects = getJobObjectsResult.data;
      if (!jobObjects) {
        throw new Error("No jobs matching the given ID(s) found to be executed.");
      }
      console.log(`✅ Completed "Step 3: Get jobs data", with jobObjects: ${config.stringify(jobObjects)}`);

    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        data: null,
        message: `❌ Failed to prepare to execute jobs with error: ${error instanceof Error ? error.message : String(error)}. Please review your data and try again.`,
        references: null,
      };
      return result;
    }


    // -----------Step 4: Execute the job(s)----------- 
    console.log(`⏭️ Step 4: Execute the job(s)"`);
    let jobOutcomes: any[] = []; // If dry run will contain data objects
    let jobFailures: any[] = []; // Lists all failed jobs
    let jobLoopCounter = 0;
    for (const jobObject of jobObjects) {
      try {
        // -----------Step 4a: Execute selected job----------- 
        console.log(`[D:${jobLoopCounter}] ⏭️ "Step 4a: Execute selected job" called with jobObject: ${config.stringify(jobObject)}`);

        const promptParts = [
          {"type": "text", 
            "text": `
        \n\nA job needs to be executed. Carefully consider the best way to complete this job, and then carry it out as the Athenic AI, making tool calls when necessary. Finally once the job has been completed, update the state of the job that has been worked on, and if it makes sense, store one/more signal object types to describe what has happened, and if any further job(s) clearly need doing, create object(s) for them too.
        \n\nBear in mind:
        \n\n - For context, signals are described as:\n${objectTypeDescriptions[config.OBJECT_TYPE_ID_SIGNAL].description}.
        \n\n - For context, jobs are described as:\n${objectTypeDescriptions[config.OBJECT_TYPE_ID_JOB].description}.
        \n\n - Don't ask for clarification or approval before taking action, as the your reply won't be seen by the member. Just make your best guess.
        \n\n - Job that needs to be executed:\n${config.stringify(jobObject)}.`}
        ];
  
        const executeThreadResult = await this.nlpService.executeThread({
          promptParts,
        });
        console.log(`[D:${jobLoopCounter}] ✅ Completed "Step 4a: Execute selected job"`);

        // -----------Step 4b: Save job run----------- 
        console.log(`[D:${jobLoopCounter}] ⏭️ "Step 4b: Save job run"`);

        const jobCompletionDate = new Date();

        // Remove the job object from the upsertedObjectIds map (as it's not designed to be stored as an output of the job run)
        const upsertedObjectIds = (this.nlpService as any).upsertedObjectIds as Record<string, string[]> | null;
        const upsertedObjectIdsCleaned = upsertedObjectIds ? config.removeObjectFromObjectIdMap({objectIdMap: upsertedObjectIds, objectType: jobObject.related_object_type_id, objectId: jobObject.id}) : {};
        this.nlpService.setMemberVariables({
          upsertedObjectIds: upsertedObjectIdsCleaned,
        });

        // Create and store job run object
        const jobRunObjectData = {
          id: uuidv4(),
          owner_organisation_id: organisationId,
          related_object_type_id: config.OBJECT_TYPE_ID_JOB_RUN,
          metadata: {
            [config.OBJECT_METADATA_DEFAULT_TITLE]: executeThreadResult.status == 200 ? `Ran job successfully on ${jobCompletionDate.toISOString().split('T')[0]}` : `Failed to run job on ${jobCompletionDate.toISOString().split('T')[0]}`,
            [config.OBJECT_METADATA_JOB_RUN_STATUS]: executeThreadResult.status == 200 ? config.OBJECT_DICTIONARY_TERM_JOB_RUN_COMPLETED : config.OBJECT_DICTIONARY_TERM_JOB_RUN_FAILED,
            [config.OBJECT_METADATA_JOB_RUN_OUTCOME]: executeThreadResult.message,
            [config.OBJECT_METADATA_DEFAULT_PARENT_ID]: jobObject.id,
            [config.OBJECT_METADATA_JOB_RUN_OUTPUT]: upsertedObjectIds,
            [config.OBJECT_METADATA_DEFAULT_CREATED_AT]: jobCompletionDate.toISOString(),
          }
        };
        const jobRunObjectCreationResult = await this.storageService.updateRow({
          table: config.OBJECT_TABLE_NAME,
          keys: {id: jobRunObjectData.id},
          rowData: jobRunObjectData,
          nlpService: this.nlpService,
          mayAlreadyExist: false,
        });
        if (jobRunObjectCreationResult.status != 200) {
          throw Error(jobRunObjectCreationResult.message);
        }

        // Update job object with reference to the job run object
        let jobNewStatus;
        if (executeThreadResult.status == 200) {
          if (jobObject.metadata[config.OBJECT_METADATA_JOB_SCHEDULE]) {
            // If has a schedule, set it to planned as it will need to be run again
            jobNewStatus = config.OBJECT_DICTIONARY_TERM_PLANNED;
          } else {
            jobNewStatus = config.OBJECT_DICTIONARY_TERM_DONE;
          }
        } else {
          jobNewStatus = config.OBJECT_DICTIONARY_TERM_FAILED;
        }
        console.log(`[D:${jobLoopCounter}] Updating job with jobNewStatus: ${jobNewStatus}`);
        const jobObjectUpdateResult = await this.storageService.updateRow({
          table: config.OBJECT_TABLE_NAME,
          keys: {id: jobObject.id},
          rowData: {
            metadata: {
              [config.OBJECT_METADATA_DEFAULT_CHILD_IDS]: {
                [jobRunObjectData.related_object_type_id]: [jobRunObjectData.id],
              },
              [config.OBJECT_METADATA_JOB_STATUS]: jobNewStatus,
            },
          },
          nlpService: this.nlpService,
          mayAlreadyExist: true,
        });
        if (jobObjectUpdateResult.status != 200) {
          throw Error(jobObjectUpdateResult.message);
        }

        console.log(`[D:${jobLoopCounter}] ✅ Completed "Step 4b: Save job run"`);

      }
      catch (error) {
        jobFailures.push(`Failed to execute job with error: ${error instanceof Error ? error.message : String(error)}.\n Data: ${config.stringify(jobObject)}.`);
      }
      jobLoopCounter++;
    }

    console.log(`[D:${jobLoopCounter}] ✅ Completed "Step 4: Execute the job(s)"`);

    if (jobFailures.length) {
      console.error(`Failed to execute job:\n\n${jobFailures.join("\n")}`);
      const result: FunctionResult = {
        status: 500,
        data: null,
        message: "Failed to execute job. The job that failed was:\n\n" + jobFailures.join("\n"),
        references: null,
      };
      return result;
    } else {
      const result: FunctionResult = {
        status: 200,
        data: null,
        message: "Successfully executed jobs.",
        references: null,
      };
      return result;
    }
  }
}