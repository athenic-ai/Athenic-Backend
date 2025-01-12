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

    let organisationId, memberId;
    try {
      await this.nlpService.initialiseClientCore();
      await this.nlpService.initialiseClientEmbedding();

      // -----------Step 1: Get organisation's ID, organisation's data and member ID----------- 
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
        organisationId,
        organisationData,
      });

      console.log("test 1");

      // -----------Step 2: Process the incoming message-----------    
      console.log(`Calling receiveMessage with connectionId: ${connectionId} and dataIn: ${config.stringify(dataIn)}`);
      console.log(` this.messagingService: ${this.messagingService} this.nlpService: ${this.nlpService}`);
      const receiveMessageResult = await this.messagingService.receiveMessage(connectionId, dataIn);
      if (receiveMessageResult.status != 200) {
        throw Error(receiveMessageResult.message);
      }
      const {messageThreadId, authorId, messageParts} = receiveMessageResult.data;

      this.nlpService.setMemberVariables({
        selectedMessageThreadId: messageThreadId,
      });

      console.log("test 3");

      let systemInstruction = config.VANILLA_SYSTEM_INSTRUCTION;
      console.log("test 4");

      systemInstruction += "\n\nThe member has sent you the following message. If the request is vague, assume they want a broad answer and if necessary, make assumptions so you can still answer the question. Try to avoid asking for clarification.";
      systemInstruction += "\n\nOnly reference the chat's history if it's not clear what the member is asking.";

      const messageIsFromBot = false; // TODO: add back support for this when using with Slack (before I had: event.subtype === "bot_message" || event.bot_id)

      console.log("test 5");

      console.log(`✅ Completed "Step 2: Process the incoming message"`);

      const messageTextPartsStr = messageParts
      .filter(item => item.type === "text")
      .map(item => item.text)
      .join(" "); // Join the text values into a single string

      // Store the message in the database
      this.messagingService.storeMessage({organisationId, memberId, connectionId, messageThreadId, messageIsFromBot, authorId, message: messageTextPartsStr, storageService: this.storageService, nlpService: this.nlpService}); // Purposely NOT doing await as for efficiency want everything else to proceed. TODO: confirm that this can be done and won't slow the main thread or reduce reliability

      // Check if the message is from the bot itself
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
      const chatHistory = await this.messagingService.getChatHistory({
        organisationId,
        memberId,
        messageThreadId,
        storageService: this.storageService,
      });

      console.log("Getting model response");


      // -----------Step 3: Get additional data that may be used within function calls----------- 
      // TODO: Could be optimised so that this code is only called if function calling is used

      const getObjectTypesResult = await config.getObjectTypes({storageService: this.storageService, organisationId, memberId});
      if (getObjectTypesResult.status != 200) {
        throw Error(getObjectTypesResult.message);
      }
      const objectTypes = getObjectTypesResult.data; // List of maps of object types as in the database
      const objectTypesIds = objectTypes
        .map(item => item.id); // List of strings of the ID of each object type

      const getObjectMetadataTypesResult = await config.getObjectMetadataTypes({storageService: this.storageService, organisationId, memberId});
      if (getObjectMetadataTypesResult.status != 200) {
        throw Error(getObjectMetadataTypesResult.message);
      }
      const objectMetadataTypes = getObjectMetadataTypesResult.data;

      const objectTypeDescriptions = config.createObjectTypeDescriptions(objectTypes, objectMetadataTypes); // Example output: {"product":{"name":"Product","description":"An item that is sold to users by teams (e.g. Apple Music is sold to users by Apple).","metadata":{"marketing_url":{"description":"Marketing URL","type":"string"},"types":{"description":"Product types","type":"array","items":{"type":"string"}},"ids":{"description":"In the form:\n   \"android/ios/...\"\n      -> \"id\"","type":"object"}}},"feedback":{"name":"Feedback","description":"Feedback from users about topics such as a product, service, experience or even the organisation in general.","metadata":{"author_name":{"description":"Name/username of the feedback's author.","type":"string"},"feedback_deal_size":{"description":"Estimated or actual deal size of the user submitting the feedback.","type":"number"}}}}
      console.log(`objectTypeDescriptions: ${JSON.stringify(objectTypeDescriptions)}`)

      this.nlpService.setMemberVariables({
        supportedObjectTypeIds: objectTypesIds,
        supportedObjectTypeDescriptions: objectTypeDescriptions
      });

      console.log(`✅ Completed "Step 3: Get additional data that may be used within function calls"`);

      // -----------Step 4: Get the AI's response to the message-----------
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

      // Send the response back to the messaging platform if not Athenic (if it is, will send it back via return statement)
      if (connectionId != "company" && messageReply && messageReply.length > 0) {
        // await this.messagingService.sendMessage(memberId, messageThreadId, messageReply);
      }

      // If Athenic, we won't get another call of this function to then store the AI's response, so instead, store it now
      if (connectionId == "company") {
        // TODO: currently when Athenic, we're not storing references in db. We may well not care about this or even prefer this, but may want to align either way with Slack where we do
        const aiResponseData = dataIn;
        aiResponseData.companyDataContents = messageReply;        
        this.messagingService.storeMessage({organisationId, memberId, connectionId, messageThreadId, messageIsFromBot: true, authorId, message: messageReply, storageService: this.storageService, nlpService: this.nlpService}); // Purposely NOT doing await as for efficiency want everything else to proceed. TODO: confirm that this can be done and won't slow the main thread or reduce reliability
      }

      console.log(`✅ Completed "Step 4: Get the AI's response to the message"`);

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
}