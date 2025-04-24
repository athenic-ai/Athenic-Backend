import * as config from "../../_shared/configs/index";
import { StorageService } from "../services/storage/storageService";
import { NlpService } from "../services/nlp/nlpService";
import { MessagingService } from "../services/messaging/messagingService";
import { FunctionResult } from "../configs/index";
import { v4 as uuidv4 } from "uuid";

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

  /**
   * Determines if a message requires code execution using the LLM.
   * @param messageText The text of the message to check
   * @returns A boolean indicating if code execution is required and the status code/message
   */
  async checkIfCodeExecutionRequired(messageText: string): Promise<{ requiresCodeExecution: boolean; status: number; message: string }> {
    try {
      console.log("Checking if code execution is required...");
      const checkPrompt = `Does the following user request require code execution, access to a file system, running terminal commands, or modifying a code repository? Respond only with YES or NO.\n\nRequest: "${messageText}"`;
      
      // Use a simple, fast model for this check
      const checkResult = await this.nlpService.execute({ 
        promptParts: [{"type": "text", "text": checkPrompt}], 
        systemInstruction: "You are an assistant that determines if a request needs code execution capabilities.", 
        functionUsage: "none", 
        useLiteModels: true 
      });

      if (checkResult.status === 200) {
        const requiresExecution = checkResult.message?.toUpperCase().includes('YES');
        console.log(`Code execution ${requiresExecution ? 'IS' : 'is NOT'} required.`);
        return { 
          requiresCodeExecution: !!requiresExecution, 
          status: 200, 
          message: `Code execution ${requiresExecution ? 'is' : 'is not'} required.` 
        };
      } else {
        console.error("Error checking for code execution requirement:", checkResult.message);
        return { requiresCodeExecution: false, status: checkResult.status, message: checkResult.message || '' };
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error checking for code execution requirement:", error.message);
      } else {
        console.error("Error checking for code execution requirement:", error);
      }
      return {
        requiresCodeExecution: false,
        status: 500,
        message: `Error checking for code execution: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async start({ connectionId, dryRun, dataIn, req }: {
    connectionId: any;
    dryRun: boolean;
    dataIn: any;
    req: any;
  }): Promise<any> {
    console.log(`Processing data from connectionId: ${connectionId} and dryRun: ${dryRun}`);
    console.log(`dataIn: ${dataIn}`);

    let organisationId, memberId;
    try {
      await this.nlpService.initialiseClientCore("");
      await this.nlpService.initialiseClientOpenAi("");

      // -----------Step 1: Get organisation's ID, organisation's data and member ID----------- 
      const inferOrganisationResult = await config.inferOrganisation({ connection: connectionId, dataIn, req, storageService: this.storageService });
      let organisationData;

      if (inferOrganisationResult.status != 200) {
        throw Error(inferOrganisationResult.message || "Unknown error");
      }

      if (dataIn.companyMetadata) {
        memberId = dataIn.companyMetadata.memberId;
      } else {
        // TODO: Add support for retreiving memberID when not passed from connection
      }

      if (Array.isArray(inferOrganisationResult.data)) {
        [organisationId, organisationData] = inferOrganisationResult.data;
      }
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
      .filter((item: any) => item.type === "text")
      .map((item: any) => item.text)
      .join(" "); // Join the text values into a single string

      // Store the message in the database
      this.messagingService.storeMessage({organisationId, memberId, connectionId, messageThreadId, messageIsFromBot, authorId, message: messageTextPartsStr, storageService: this.storageService, nlpService: this.nlpService}); // Purposely NOT doing await as for efficiency want everything else to proceed. TODO: confirm that this can be done and won't slow the main thread or reduce reliability

      // Check if the message is from the bot itself
      if (messageIsFromBot) {
        console.log("Ignoring bot message to prevent infinite loop.");
        const result: FunctionResult = {
          status: 200,
          data: null,
          message: "Ignoring bot message to prevent infinite loop.",
          references: null,
        };
        return result;
      }

      // -----------Step 2.1: Check if code execution is required----------- 
      // Implement E2B trigger logic to determine if code execution is needed
      const codeExecutionResult = await this.checkIfCodeExecutionRequired(messageTextPartsStr);
      const requiresCodeExecution = codeExecutionResult.requiresCodeExecution;
      
      // If code execution check failed, log but proceed with normal chat flow
      if (codeExecutionResult.status !== 200) {
        console.error(`Error checking if code execution is required: ${codeExecutionResult.message}. Proceeding with standard chat.`);
      }
      
      console.log(`✅ Completed "Step 2.1: Check if code execution is required": ${requiresCodeExecution ? 'Code execution IS required' : 'Code execution is NOT required'}`);

      console.log("Starting NLP processing for message:", messageParts);

      console.log("Getting chat history");
      let chatHistory = [];
      const chatHistoryResult = await this.messagingService.getChatHistory({
        organisationId,
        memberId,
        messageThreadId,
        storageService: this.storageService,
      });
      if (chatHistoryResult.status == 200) {
        chatHistory = chatHistoryResult.data;
      }

      console.log(`chatHistory retrieved: ${config.stringify(chatHistory)}`);

      console.log("Getting model response");

      // -----------Step 3: Get additional data that may be used within function calls----------- 
      // TODO: Could be optimised so that this code is only called if function calling is used

      const getOrganisationObjectTypesResult = await config.getOrganisationObjectTypes({storageService: this.storageService, organisationId, memberId});
      if (getOrganisationObjectTypesResult.status != 200) {
        throw Error(getOrganisationObjectTypesResult.message || "Unknown error");
      }
      const objectTypes = getOrganisationObjectTypesResult.data; // List of maps of object types as in the database
      const objectTypesIds = Array.isArray(objectTypes) ? objectTypes.map((item: any) => item.id) : []; // List of strings of the ID of each object type

      const getObjectMetadataTypesResult = await config.getObjectMetadataTypes({storageService: this.storageService, organisationId, memberId});
      if (getObjectMetadataTypesResult.status != 200) {
        throw Error(getObjectMetadataTypesResult.message || "Unknown error");
      }
      const objectMetadataTypes = getObjectMetadataTypesResult.data;

      const objectTypeDescriptions = config.createObjectTypeDescriptions(objectTypes, objectMetadataTypes); // Example output: {"product":{"name":"Product","description":"An item that is sold to users by teams (e.g. Apple Music is sold to users by Apple).","metadata":{"marketing_url":{"description":"Marketing URL","type":"string"},"types":{"description":"Product types","type":"array","items":{"type":"string"}},"ids":{"description":"In the form:\n   \"android/ios/...\"\n      -> \"id\"","type":"object"}}},"feedback":{"name":"Feedback","description":"Feedback from users about topics such as a product, service, experience or even the organisation in general.","metadata":{"author_name":{"description":"Name/username of the feedback's author.","type":"string"},"feedback_deal_size":{"description":"Estimated or actual deal size of the user submitting the feedback.","type":"number"}}}}
      console.log(`objectTypeDescriptions: ${JSON.stringify(objectTypeDescriptions)}`)

      this.nlpService.setMemberVariables({
        objectTypes,
        objectTypeDescriptions
      });

      console.log(`✅ Completed "Step 3: Get additional data that may be used within function calls"`);

      // -----------Step 4: Get the AI's response to the message----------- 
      let executeThreadResult;
      if (requiresCodeExecution) {
        // Implement E2B service call for code execution
        console.log("Code execution is required. Calling E2B Service.");
        
        // Generate a unique client ID for this session
        const uniqueClientId = `session_${uuidv4()}`;

        // Determine the appropriate E2B template based on the request
        // For now using a simple approach - could be enhanced with LLM analysis in the future
        let e2bTemplate = 'code-interpreter-v1'; // Default template
        if (messageTextPartsStr.toLowerCase().includes('javascript') || 
            messageTextPartsStr.toLowerCase().includes('node')) {
          e2bTemplate = 'nodejs-v1';
        } else if (messageTextPartsStr.toLowerCase().includes('python')) {
          e2bTemplate = 'code-interpreter-v1'; // Python-focused
        }

        // For now, we'll use the message text as the code/instruction
        // A better approach would be another LLM call to extract actual code
        const codeToExecute = messageTextPartsStr;

        // Get E2B service URL from environment variables
        const e2bServiceUrl = Deno.env.get('E2B_SERVICE_URL') || 'http://localhost:4000';
        const e2bWebsocketUrl = Deno.env.get('E2B_WEBSOCKET_URL') || 'ws://localhost:4000';

        try {
          console.log(`Calling E2B service at ${e2bServiceUrl}/execute-stream`);
          
          const response = await fetch(`${e2bServiceUrl}/execute-stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // TODO: Add authentication header if E2B service requires it
            },
            body: JSON.stringify({
              code: codeToExecute,
              language: e2bTemplate,
              clientId: uniqueClientId,
              timeout: 30000, // 30 seconds timeout
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error calling E2B service: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`E2B service request failed: ${response.statusText}`);
          }

          // Parse the response
          const responseData = await response.json();
          console.log("E2B execution initiated successfully:", responseData);
          
          // Return data instructing the frontend to open WebSocket connection
          executeThreadResult = {
            status: 200,
            data: {
              requiresE2B: true,
              e2bWebSocketUrl: e2bWebsocketUrl,
              clientId: uniqueClientId,
              executionId: responseData.executionId,
              initialStatus: 'Initiating E2B execution...'
            },
            message: null, // No direct message - output will come via WebSocket
            references: null,
          };
          
        } catch (e2bError) {
          console.error("Failed to call E2B Service:", e2bError);
          
          // Fallback to standard chat if E2B fails
          console.log("E2B execution failed, falling back to standard chat response");
          executeThreadResult = await this.nlpService.executeThread({
            promptParts: messageParts,
            chatHistory,
          });
          
          // Add error information to the response
          if (executeThreadResult.status === 200) {
            executeThreadResult.data = {
              ...executeThreadResult.data,
              requiresE2B: false,
              e2bError: `E2B execution failed: ${e2bError instanceof Error ? e2bError.message : String(e2bError)}`
            };
          }
        }
      } else {
        // Proceed with standard chat response
        console.log("Proceeding with standard LLM chat response generation...");
        executeThreadResult = await this.nlpService.executeThread({
          promptParts: messageParts,
          chatHistory,
        });
        
        if (executeThreadResult.status != 200) {
          throw Error(executeThreadResult.message);
        }
      }
      
      console.log(`Message thread result: ${config.stringify(executeThreadResult)}`);
      const messageReply = executeThreadResult.message;
      

      // TODO: consider adding back support for more simple execution via the below based on what is being asked
      // const messageReplyResult = await this.nlpService.execute({
      //   promptParts: messageParts,
      //   chatHistory: chatHistory,
      //   systemInstruction: systemInstruction,
      //   functionUsage: "auto",
      //   interpretFuncCalls: true,
      //   useLiteModels: true,
      // });
      // console.log("d");
      // console.log("messageReplyResult", messageReplyResult);
      // if (messageReplyResult.status != 200) {
      //   throw Error(messageReplyResult.message);
      // }
      // const messageReply = messageReplyResult.message;

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
        data: executeThreadResult,
        message: "Successfully processed message.",
        references: null,
      };
      return result;
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        data: null,
        message: `❌ Failed to process message with error: ${error instanceof Error ? error.message : String(error)}. Please review your message and try again.`,
        references: null,
      };
      return result;
    }
  }
}