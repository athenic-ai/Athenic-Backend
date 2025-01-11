import * as config from "../configs/index.ts";
import { StorageService } from "../services/storage/storageService.ts";
import { NlpService } from "../services/nlp/nlpService.ts";

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

  async start({ triggerMessage, relevantData, organisationId, organisationData }: {
    triggerMessage: string;
    relevantData: any;
    organisationId: string;
    organisationData: any;
}): Promise<any> {
    console.log(`Upserting signal with triggerMessage: ${triggerMessage} and relevantData: ${relevantData}`);

    try {
      
      // -----------Step 1: Search signals to see if there are any related signals-----------

      // -----------Step 2: Create/modify existing signal-----------
      // This will create a new signal if it doesn't exist, or modify an existing signal if it does
      // As part of it, it will also decide whether any jobs need to be created/updated. If so, it will call the relevant job creation/updating function and also store a reference to the job in this signal (and visa versa) via the related_ids column
      // It will then update the signal in the database with the new/modified data

      const result: FunctionResult = {
        status: 200,
        message: "Successfully upserted signal.",
      };
      return result;
    }
    catch (error) {
    }
  }
}