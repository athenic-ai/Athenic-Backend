import * as config from "../configs/index.ts";
import { StorageService } from "../services/storage/storageService.ts";
import { NlpService } from "../services/nlp/nlpService.ts";
import { UpsertDataJob } from "./upsertDataJob.ts";

export class ExecuteJob<T> {
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