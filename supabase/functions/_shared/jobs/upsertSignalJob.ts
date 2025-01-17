import * as config from "../configs/index.ts";
import { StorageService } from "../services/storage/storageService.ts";
import { NlpService } from "../services/nlp/nlpService.ts";
import { UpsertDataJob } from "./upsertDataJob.ts";

export class UpsertSignalJob<T> {
  private readonly storageService: StorageService;
  private readonly nlpService: NlpService;

  constructor(
    storageService: StorageService = new StorageService(),
    nlpService: NlpService = new NlpService(),
  ) {
    this.storageService = storageService;
    this.nlpService = nlpService;
  }

  async start({ sourceObjectId, sourceObjectTypeId, triggerMessage, relevantData, organisationId, organisationData, memberId, objectTypes, objectMetadataTypes, objectTypeDescriptions, fieldTypes, dictionaryTerms }: {
    sourceObjectId: string;
    sourceObjectTypeId: string;
    triggerMessage: string;
    relevantData?: any;
    organisationId: string;
    organisationData: any;
    memberId?: string;
    objectTypes?: any;
    objectMetadataTypes?: any;
    objectTypeDescriptions?: any;
    fieldTypes?: any;
    dictionaryTerms?: any;
}): Promise<any> {
    try {
      console.log(`Upserting signal with triggerMessage: ${triggerMessage}\nrelevantData: ${relevantData}\norganisationId: ${organisationId}\nmemberId: ${memberId}\nsourceObjectId: ${sourceObjectId}\nsourceObjectTypeId: ${sourceObjectTypeId}`);
      const upsertDataJob: UpsertDataJob = new UpsertDataJob();

      if (sourceObjectTypeId == config.OBJECT_TYPE_ID_SIGNAL || sourceObjectTypeId == config.OBJECT_TYPE_ID_MESSAGE) {
        // If type is signal, don't want to execute to avoid an infifite loop of signal creations.
        // If type is message, don't want signals created for messages 
        const result: FunctionResult = {
          status: 200,
          message: `🟧 Not executing signal as signal type is: ${sourceObjectTypeId}`,
        };
        return result;
      }

      const signalDataIn = {
        "companyMetadata": {
          "organisationId": organisationId,
          "memberId": memberId ?? null,
          "objectTypeId": config.OBJECT_TYPE_ID_SIGNAL,
          // "dataDescription": ,
          "requiredMatchThreshold": 0.8,
          "newRelatedIds": {
            [sourceObjectTypeId]: [sourceObjectId],
          },
          processDataFunctionDescription: `Given some data, critically analyse it as the Athenic AI, and then create a ${objectTypeDescriptions[config.OBJECT_TYPE_ID_SIGNAL].name} object type based on your analysis. For context: ${objectTypeDescriptions[config.OBJECT_TYPE_ID_SIGNAL].description}`,
        },
        "companyDataContents": `The creation of this signal was triggered with the following message: ${config.stringify(triggerMessage)}.`
      };

      if (relevantData) {
        signalDataIn.companyDataContents += `\n\nRelevant data: ${config.stringify(relevantData)}.`;
      }

      console.log(`upsertDataJob.start() from upsertSignalJob with signalDataIn: ${config.stringify(signalDataIn)}`);
      const processSignalDataJobResult = await upsertDataJob.start({
        connection: "company", 
        dryRun: false, 
        dataIn: signalDataIn,
        organisationId,
        organisationData,
        memberId,
        objectTypes,
        objectMetadataTypes,
        objectTypeDescriptions,
        fieldTypes,
        dictionaryTerms
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
  }
}