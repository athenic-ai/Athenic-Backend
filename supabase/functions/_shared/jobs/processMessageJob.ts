import * as config from "../../_shared/configs/index.ts";
import { StorageService } from "../services/storage/storageService.ts";
import { NlpService } from "../services/nlp/nlpService.ts";
import { MessagingService } from "../services/messaging/messagingService.ts";

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

  async start({ connection, dryRun, dataIn }: {
    connection: any;
    dryRun: boolean;
    dataIn: any;
  }): Promise<any> {
    console.log(`Processing data from connection: ${connection} and dryRun: ${dryRun}`);
    console.log(`dataIn: ${dataIn}`);

    let organisationId, messageData;
    try {
      await this.nlpService.initialiseClientCore();
      await this.nlpService.initialiseClientEmbedding();
      // -----------Step 1: Get organisation's ID and data----------- 
      const inferOrganisationResult = await config.inferOrganisation({ connection, dataIn, storageService: this.storageService });
      let organisationData;

      if (inferOrganisationResult.status != 200) {
        throw Error(inferOrganisationResult.message);
      }

      [organisationId, organisationData] = inferOrganisationResult.data;
      if (!organisationId || !organisationData) {
        throw Error(`Couldn't find organisationId (${organisationId}) or organisationData (${organisationData})`);
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
    
      console.log(`Calling receiveMessage with connection: ${connection} and messageData: ${JSON.stringify(messageData)}`);
      console.log(` this.messagingService: ${this.messagingService} this.nlpService: ${this.nlpService}`);
      const receiveMessageResult = await this.messagingService.receiveMessage(connection, messageData);
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
      // this.prepMessageStorage({platformSource: platformSource, memberFire: memberFire, organisationId: organisationId, threadId: threadId, messageIsFromBot: messageIsFromBot, authorId: authorId, message: memberPrompt, messageId: messageId, threadType: threadType}); // Purposely NOT doing await as for efficiency want everything else to proceed. TODO: confirm that this can be done and won't slow the main thread or reduce reliability

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

      console.log("e");

      // Step 5: Send the response back to the messaging platform if not Athenic (if it is, will send it back via return statement)
      if (connection != "company" && messageReply && messageReply.length > 0) {
        // await this.messagingService.sendMessage(memberFire, threadId, messageReply);
      }

      console.log("f");


      // Step 6: If Athenic, we won't get another call of this function to then store the AI's response, so instead, store it now
      if (connection == "company") {
        // TODO: currently when Athenic, we're not storing references in db. We may well not care about this or even prefer this, but may want to align either way with Slack where we do
        // this.prepMessageStorage({platformSource: platformSource, memberFire: memberFire, organisationId: organisationId, threadId: threadId, messageIsFromBot: true, authorId: authorId, message: messageReply, messageId: messageId, threadType: threadType}); // Purposely NOT doing await as for efficiency want everything else to proceed. TODO: confirm that this can be done and won't slow the main thread or reduce reliability
      }

      console.log("g");


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

  async prepMessageStorage({platformSource, memberFire, organisationId, threadId, messageIsFromBot, authorId, message, messageId, threadType}) {
    let firestorePathForMessage;
    const messageTime = Math.floor(Date.now() / 10);
    if (platformSource == "athenic") {
      firestorePathForMessage = `members/${memberFire}/messages/${messageTime}`;
    } else {
      firestorePathForMessage = `organisations/${organisationId}/messages/${platformSource}/${threadId}/${messageTime}`;
    }
    const messageDocData = {
      "authorId": messageIsFromBot ? "model" : authorId,
      "parts": [{"text": message}],
      "lastModified": new Date(),
    };
    if (messageId) {
      messageDocData.messageId = messageId; // assign if not null (null if it's a bit message)
    }
    if (threadType) {
      messageDocData.threadType = threadType;
    }
    await this.storeReceivedMessage(firestorePathForMessage, messageDocData);
  }

  async storeReceivedMessage(firestorePathForMessage, docData) {
    docData = await this.nlpGeminiPlugin.addEmbeddingToObject(docData);
    await this.storagePlugin.updateDoc(firestorePathForMessage, docData);
  }
}