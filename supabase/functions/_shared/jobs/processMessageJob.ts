import * as config from "../../_shared/configs/index.ts";
import { StorageService } from "../services/storage/storageService.ts";
import { NlpService } from "../services/nlp/nlpService.ts";
import { MessagingService } from "../services/messaging/messagingService.ts";
import * as uuid from "jsr:@std/uuid";

interface OrganisationData {
  [key: string]: any;
}

export class ProcessMessageJob<T> {
  private readonly storageService: StorageService;
  private readonly nlpService: NlpService;
  private readonly messagingService: MessagingService;

  constructor(
    storageService: StorageService = new StorageService(),
    nlpService: NlpService = new NlpService(),
    messagingService: MessagingService = new MessagingService(),
  ) {
    this.storageService = storageService;
    this.nlpService = nlpService;
    this.messagingService = messagingService;
  }

  async start({ connectionId, dryRun, dataIn }: {
    connectionId: any;
    dryRun: boolean;
    dataIn: any;
  }): Promise<any> {
    console.log(`Processing data from connectionId: ${connectionId} and dryRun: ${dryRun}`);
    console.log(`dataIn: ${dataIn}`);

    let organisationId, memberId, messageData;
    try {
      await this.nlpService.initialiseClientCore();
      await this.nlpService.initialiseClientEmbedding();
      // -----------Step 1: Get organisation's ID and data and member ID----------- 
      const inferOrganisationResult = await config.inferOrganisation({ connectionId, dataIn, storageService: this.storageService });
      let organisationData;

      if (inferOrganisationResult.status != 200) {
        throw Error(inferOrganisationResult.message);
      }

      if (dataIn.companyMetadata) {
        memberId = dataIn.companyMetadata.memberId;
      } else {
        // TODO: Add support for retreiving memberID when not passed from connection
      }

      [organisationId, organisationData] = inferOrganisationResult.data;
      if (!organisationId || !organisationData || !memberId) {
        throw Error(`Couldn't find organisationId (${organisationId}) or organisationData (${organisationData}) or memberId (${memberId}).`);
      }

      console.log(`✅ Completed "Step 1: Get organisation's ID and data", with organisationId: ${organisationId} and organisationData: ${JSON.stringify(organisationData)}`);

      this.nlpService.setMemberVariables({
        organisationId: organisationId,
        organisationData: organisationData,
      });

      console.log("test 1");

      // -----------Step 2: Prepare the actual data contents-----------
      if (dataIn.companyDataContents) {
        console.log("test 2a");
        messageData = dataIn.companyDataContents;
      } else {
        console.log("test 2b");
        messageData = dataIn; // If not sent from Athenic, include everything
      }
      console.log(`✅ Completed "Step 2: Prepare the actual data contents", with messageData: ${JSON.stringify(messageData)}`);
    
      console.log(`Calling receiveMessage with connectionId: ${connectionId} and messageData: ${JSON.stringify(messageData)}`);
      console.log(` this.messagingService: ${this.messagingService} this.nlpService: ${this.nlpService}`);
      const receiveMessageResult = await this.messagingService.receiveMessage(connectionId, messageData);
      if (receiveMessageResult.status != 200) {
        throw Error(receiveMessageResult.message);
      }
      const {threadId, authorId, messageParts} = receiveMessageResult.data;

      this.nlpService.setMemberVariables({
        selectedMessageThreadId: threadId,
      });

      console.log("test 3");

      let systemInstruction = config.VANILLA_SYSTEM_INSTRUCTION;
      console.log("test 4");

      systemInstruction += "\n\nThe member has sent you the following message. If the request is vague, assume they want a broad answer and if necessary, make assumptions so you can still answer the question. Try to avoid asking for clarification.";
      systemInstruction += "\n\nOnly reference the chat's history if it's not clear what the member is asking.";

      const messageIsFromBot = false; // TODO: add back support for this when using with Slack (before I had: event.subtype === "bot_message" || event.bot_id)

      console.log("test 5");


      // Step 3: Store the message in the database
      // this.storeMessage({organisationId, memberFire, connectionId, messageThreadId, messageIsFromBot, authorId, message: memberPrompt}); // Purposely NOT doing await as for efficiency want everything else to proceed. TODO: confirm that this can be done and won't slow the main thread or reduce reliability

      // Step 4: Check if the message is from the bot itself
      if (messageIsFromBot) {
        console.log("Ignoring bot message to prevent infinite loop.");
        const result: FunctionResult = {
          status: 200,
          message: "Ignoring bot message to prevent infinite loop.",
        };
        return result;
      }

      console.log("Starting NLP processing for message:", messageParts);

      console.log("Getting chat history");
      // const chatHistory = await this.messagingService.getChatHistory({
      //   organisationId: organisationId,
      //   memberFire: memberFire,
      //   platformSource: platformSource,
      //   threadId: threadId,
      // });
      const chatHistory = [];

      console.log("Getting model response");


      const messageReplyResult = await this.nlpService.execute({
        promptParts: messageParts,
        chatHistory: chatHistory,
        systemInstruction: systemInstruction,
        functionUsage: "auto",
        interpretFuncCalls: true,
        useLiteModels: true,
      });
      console.log("d");
      console.log("messageReplyResult", messageReplyResult);
      if (messageReplyResult.status != 200) {
        throw Error(messageReplyResult.message);
      }
      const messageReply = messageReplyResult.message;

      // Step 5: Send the response back to the messaging platform if not Athenic (if it is, will send it back via return statement)
      if (connectionId != "company" && messageReply && messageReply.length > 0) {
        // await this.messagingService.sendMessage(memberFire, threadId, messageReply);
      }

      // Step 6: If Athenic, we won't get another call of this function to then store the AI's response, so instead, store it now
      if (connectionId == "company") {
        // TODO: currently when Athenic, we're not storing references in db. We may well not care about this or even prefer this, but may want to align either way with Slack where we do
        this.storeMessage({organisationId, memberFire, connectionId, messageThreadId, messageIsFromBot: true, authorId, message: messageReply}); // Purposely NOT doing await as for efficiency want everything else to proceed. TODO: confirm that this can be done and won't slow the main thread or reduce reliability
      }

      const result: FunctionResult = {
        status: 200,
        message: "Successfully processed message.",
        data: messageReplyResult,
      };
      return result;
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: `❌ Failed to process message with error: ${error.message}. Please review your message and try again.`,
      };
      return result;
    }
  }

  async storeMessage({organisationId, memberFire, connectionId, messageThreadId, messageIsFromBot, authorId, message}) {
    try {
      // TODO: Need to finish off or do an alternative to the below, which aims to create the connection and message thread objects if they don't exist
      // TODO: I know I need to do at least: pass the connection object id to be the parent of the message thread object and then also update the connection object with the message thread id child id.
      // const getOrCreateConnectionObjectWithIdMetadataResult = await this.getOrCreateObjectWithIdMetadata({
      //   metadataId: connectionId,
      //   organisationId: organisationId,
      //   relatedObjectTypeId: config.OBJECT_TYPE_ID_CONNECTION,
      // });
      // if (getOrCreateConnectionObjectWithIdMetadataResult.status != 200) {
      //   throw Error(getOrCreateConnectionObjectWithIdMetadataResult.message);
      // }
      // const getOrCreateMessageThreadObjectWithIdMetadataResult = await this.getOrCreateObjectWithIdMetadata({
      //   metadataId: connectionThreadId,
      //   organisationId: organisationId,
      //   relatedObjectTypeId: config.OBJECT_TYPE_ID_MESSAGE_THREAD,
      // });
      // if (getOrCreateMessageThreadObjectWithIdMetadataResult.status != 200) {
      //   throw Error(getOrCreateMessageThreadObjectWithIdMetadataResult.message);
      // }

      // Step 1: Create and store the message object
      const messageObjectData = {
        id: uuid.v1.generate(),
        owner_organisation_id: organisationId,
        related_object_type_id: config.OBJECT_TYPE_ID_MESSAGE,
        metadata: {
          [config.OBJECT_METADATA_DEFAULT_TITLE]: message,
          [config.OBJECT_METADATA_TYPE_ID_MESSAGE_AUTHOR_ID]: messageIsFromBot ? config.OBJECT_MESSAGE_AUTHOR_ID_VALUE_IF_COMPANY : authorId,
          [config.OBJECT_METADATA_DEFAULT_CREATED_AT]: new Date(),
        },
        parent_id: messageThreadId,
      };
      console.log(`Updating object data in DB with messageObjectData: ${JSON.stringify(messageObjectData)}`);
      const messageUpdateResult = await this.storageService.updateRow({
        table: "objects",
        keys: {id: messageObjectData.id},
        rowData: messageObjectData,
        nlpService: this.nlpService,
        mayAlreadyExist: false,
      });
      if (messageUpdateResult.status != 200) {
        throw Error(messageUpdateResult.message);
      }

      // Step 2: Update the message thread object with the message object as a child
      const messageThreadObjectData = {
        child_ids: [messageObjectData.id],
      };
      console.log(`Updating message thead object data in DB with messageThreadObjectData: ${JSON.stringify(messageThreadObjectData)}`);
      const messageThreadUpdateResult = await this.storageService.updateRow({
        table: "objects",
        keys: {id: messageThreadId},
        rowData: messageThreadObjectData,
        nlpService: this.nlpService,
        mayAlreadyExist: true,
      });
      if (messageThreadUpdateResult.status != 200) {
        throw Error(messageThreadUpdateResult.message);
      }
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: `❌ Failed to store message with error: ${error.message}. Please try again.`,
      };
      return result;
    }
  }

  async getOrCreateObjectWithIdMetadata({metadataId, organisationId, relatedObjectTypeId}) {
    try {
      // Step 1: Ensure object type setup by seeing if we can find row where metadata.id equals its id
      const getObjectResult = await this.storageService.getRows('objects', {
        whereAndConditions: [
          {
            column: 'owner_organisation_id',
            operator: 'is',
            value: organisationId
          },
          {
            column: 'related_object_type_id',
            operator: 'is',
            value: relatedObjectTypeId
          },
          {
            column: 'metadata',
            jsonPath: ['id'],
            operator: 'eq',
            value: metadataId
          },
        ]
      });
      if (getObjectResult.status != 200) {
        throw Error(getObjectResult.message);
      }
      let objectData = getObjectResult.data[0]; // Getting first item as shouldn't be more than one

      if (!objectData) {
        // If not found, create the object
        const objectDataToUpload = {
          id: uuid.v1.generate(),
          owner_organisation_id: organisationId,
          related_object_type_id: relatedObjectTypeId,
          metadata: {
            [config.OBJECT_METADATA_DEFAULT_TITLE]: metadataId,
            id: metadataId,
            [config.OBJECT_METADATA_DEFAULT_CREATED_AT]: new Date(),
          },
        };
        console.log(`Updating object data in DB with objectDataToUpload: ${JSON.stringify(objectDataToUpload)}`);
        const objectUpdateResult = await this.storageService.updateRow({
          table: "objects",
          keys: {id: objectDataToUpload.id},
          rowData: objectDataToUpload,
          nlpService: this.nlpService,
          mayAlreadyExist: false,
        });
        if (objectUpdateResult.status != 200) {
          throw Error(objectUpdateResult.message);
        }
      }
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: `❌ Failed to store get or create object with error: ${error.message}. Please try again.`,
      };
      return result;
    }
  }
}