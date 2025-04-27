import * as config from "../../_shared/configs/index.ts";
import { StorageService } from "../services/storage/storageService.ts";
import { NlpService } from "../services/nlp/nlpService.ts";
import { MessagingService } from "../services/messaging/messagingService.ts";
import { FunctionResult } from "../configs/index.ts";
import { v4 } from "https://deno.land/std@0.81.0/uuid/mod.ts";

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
      // Use a valid OpenAI API key - first try environment variable, otherwise use hardcoded key
      const openAiKey = Deno.env.get('OPENAI_API_KEY');
      const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
      
      await this.nlpService.initialiseClientCore(openRouterKey);
      await this.nlpService.initialiseClientOpenAi(openAiKey);

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

      // Extract organisationId from the result - it comes as an object, not an array
      if (inferOrganisationResult.data && typeof inferOrganisationResult.data === 'object' && 'organisationId' in inferOrganisationResult.data) {
        organisationId = inferOrganisationResult.data.organisationId;
        
        // Now that we have the organisationId, fetch the organisation data
        try {
          const orgResult = await this.storageService.getRow({
            table: "organisations",
            keys: { id: organisationId }
          });
          
          if (orgResult.status === 200 && orgResult.data) {
            organisationData = orgResult.data;
          } else {
            console.warn(`Could not fetch organisation data for ${organisationId}: ${orgResult.message}`);
            // Continue with null organisationData for backward compatibility
            organisationData = null;
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.warn(`Error fetching organisation data: ${errorMessage}`);
          // Continue with null organisationData for backward compatibility
          organisationData = null;
        }
      }

      if (!organisationId || !memberId) {
        throw Error(`Couldn't find organisationId (${organisationId}) or memberId (${memberId}). Please review your message and try again.`);
      }

      console.log(`✅ Completed "Step 1: Get organisation's ID and data", with organisationId: ${organisationId}${organisationData ? ' and organisation data retrieved' : ' but organisation data not found'}`);

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
        const uniqueClientId = `session_${v4.generate()}`;

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

        // Extract the command from the message using regex
        let extractedCommand = codeToExecute;
        // Try to extract commands from patterns like "run X in an e2b terminal" or "execute X"
        const runCommandRegex = /(?:run|execute)\s+`?([^`]+)`?(?:\s+in\s+(?:an\s+)?e2b\s+terminal)?/i;
        const match = messageTextPartsStr.match(runCommandRegex);
        
        if (match && match[1]) {
          extractedCommand = match[1].trim();
          console.log(`Extracted command: ${extractedCommand}`);
        }

        // For local testing: Allow passing the E2B service URL in the request headers
        // This enables testing the Edge Function locally against a local E2B service
        let e2bServiceUrl = Deno.env.get("E2B_SERVICE_URL");
        let e2bWebSocketUrl = Deno.env.get("E2B_WEBSOCKET_URL");

        // Safe header access - works with either Request-style objects or plain objects
        const getHeader = (headerName: string) => {
          // Check if req and headers exist
          if (!req || !req.headers) {
            console.warn(`Request or headers object is undefined when accessing '${headerName}'`);
            return null;
          }
          
          // Try the get() method first (standard Request object)
          if (typeof req.headers.get === 'function') {
            return req.headers.get(headerName);
          }
          
          // Fallback to direct property access (plain object)
          return req.headers[headerName] || null;
        };
        
        // Check if we have the URLs in request headers (useful for development/testing)
        const testE2BServiceUrl = getHeader("x-e2b-service-url");
        const testE2BWebSocketUrl = getHeader("x-e2b-websocket-url");

        if (testE2BServiceUrl) {
          console.log(`Using E2B service URL from request header: ${testE2BServiceUrl}`);
          e2bServiceUrl = testE2BServiceUrl;
        }

        if (testE2BWebSocketUrl) {
          console.log(`Using E2B WebSocket URL from request header: ${testE2BWebSocketUrl}`);
          e2bWebSocketUrl = testE2BWebSocketUrl;
        }

        // Fallback values for development
        if (!e2bServiceUrl) {
          console.log("E2B_SERVICE_URL not found in environment variables, using default");
          e2bServiceUrl = "http://192.168.68.105:4000/execute-stream";
        }

        if (!e2bWebSocketUrl) {
          console.log("E2B_WEBSOCKET_URL not found in environment variables, using default");
          e2bWebSocketUrl = "ws://192.168.68.105:4000";
        }

        console.log(`Calling E2B service at ${e2bServiceUrl}`);

        try {
          // Make the request to the E2B service
          const response = await fetch(e2bServiceUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // TODO: Add authentication header if E2B service requires it
            },
            body: JSON.stringify({
              code: extractedCommand, // Use the extracted command instead of the full message
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
            message: "This request requires code execution. Connect to the WebSocket to see results.",
            data: {
              requiresE2B: true,
              e2bWebSocketUrl: e2bWebSocketUrl,
              clientId: uniqueClientId,
              executionId: responseData.executionId,
              initialStatus: 'Initiating E2B execution...'
            },
            references: null,
          };
          
        } catch (e2bError) {
          console.error("Failed to call E2B Service:", e2bError);
          
          // Provide a more helpful response about the command that would have been executed
          const errorMessage = e2bError instanceof Error ? e2bError.message : String(e2bError);
          const isConnectionError = errorMessage.includes("sending request") || errorMessage.includes("ECONNREFUSED");
          
          let friendlyMessage;
          if (isConnectionError) {
            friendlyMessage = `I detected that you want me to run the command \`${extractedCommand}\`, but I'm currently unable to connect to the terminal execution service. The E2B service may not be running or is unavailable. Here's what running this command would typically do:\n\n`;
            
            // Provide information about common commands
            if (extractedCommand.includes("echo")) {
              friendlyMessage += `The \`echo\` command would output the text that follows it. For example, \`${extractedCommand}\` would display: ${extractedCommand.replace(/^echo\s+['"]?(.+?)['"]?$/, '$1')}\n\n`;
            } else if (extractedCommand.includes("ls")) {
              friendlyMessage += `The \`ls\` command would list files and directories in the current directory.\n\n`;
            } else {
              friendlyMessage += `This command would be executed in a terminal environment.\n\n`;
            }
            
            friendlyMessage += "To execute this command, please ensure the E2B service is running. If you're a developer, start the service with `cd Athenic-Backend/e2b && npm run dev` or check for port conflicts if the service is already running.";
          } else {
            friendlyMessage = `I tried to execute the command \`${extractedCommand}\` but encountered an error: ${errorMessage}`;
          }
          
          // Return a helpful response
          executeThreadResult = {
            status: 200,
            message: friendlyMessage,
            data: {
              requiresE2B: false,
              e2bError: `E2B execution failed: ${errorMessage}`
            },
            references: null,
          };
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