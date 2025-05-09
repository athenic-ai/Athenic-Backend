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
      // const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
      const openRouterKey = Deno.env.get('OPENAI_API_KEY'); // Temp using OpenAI API key for now as cheaper
      
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
        let e2bTemplate = 'base'; // Default template
        if (messageTextPartsStr.toLowerCase().includes('javascript') || 
            messageTextPartsStr.toLowerCase().includes('node')) {
          e2bTemplate = 'nodejs-v1';
        } else if (messageTextPartsStr.toLowerCase().includes('python')) {
          e2bTemplate = 'base'; // Python-focused
        }

        // Extract the command from the message using regex
        let extractedCommand = messageTextPartsStr;
        // Try to extract commands from patterns like "run X in an e2b terminal" or "execute X"
        const runCommandRegex = /(?:run|execute)\s+`?([^`]+)`?(?:\s+in\s+(?:an\s+)?e2b\s+terminal)?/i;
        const match = messageTextPartsStr.match(runCommandRegex);
        
        if (match && match[1]) {
          extractedCommand = match[1].trim();
          console.log(`Extracted command: ${extractedCommand}`);
        }

        // Get the E2B API key from environment variables
        const e2bApiKey = Deno.env.get("E2B_API_KEY");

        if (!e2bApiKey) {
          console.error("E2B_API_KEY not found in environment variables");
          console.error("Make sure to set the E2B_API_KEY in your Supabase environment variables");
          const errorMessage = "I detected that you want me to run code or a command, but the E2B API key is missing. Please contact the system administrator.";
          executeThreadResult = {
            status: 200,
            message: errorMessage,
            data: {
              requiresE2B: false,
              e2bError: "E2B API key is missing"
            },
            references: null,
          };
        } else {
          try {
            // Import the E2B SDK
            const { Sandbox } = await import("npm:@e2b/code-interpreter");
            
            console.log("Creating E2B Sandbox with API key...");
            // Create a sandbox instance using the correct API with a reasonable timeout
            const sandbox = await Sandbox.create({
              apiKey: e2bApiKey,
              template: e2bTemplate,
              timeoutMs: 30000, // 30 seconds timeout
            });
            
            console.log("E2B Sandbox created successfully");
            
            try {
              // Execute the command in the sandbox
              console.log(`Executing command in E2B sandbox: ${extractedCommand}`);
              
              // Execute the command
              const execution = await sandbox.runCode(extractedCommand);
              
              console.log("E2B code execution completed successfully");
              console.log("Execution result:", JSON.stringify(execution));
              
              // Get sandbox info for debugging
              const sandboxInfo = await sandbox.getInfo();
              console.log(`Sandbox info: ${JSON.stringify(sandboxInfo)}`);
              
              // Format response based on result
              let responseMessage = "";
              
              // Ensure we have a string representation of the output
              const outputText = typeof execution.text === 'string' ? execution.text : 
                              (typeof execution.logs === 'string' ? execution.logs : 
                               JSON.stringify(execution));
              
              if (execution.exitCode === 0) {
                responseMessage = `Command executed successfully:\n\n\`\`\`\n${outputText}\n\`\`\``;
              } else {
                responseMessage = `Command executed with error code ${execution.exitCode || 'undefined'}:\n\n\`\`\`\n${outputText}\n\`\`\``;
              }
              
              // Shutdown the sandbox to clean up resources
              await sandbox.kill();
              
              // Return result to the user with explicit flag to show terminal
              executeThreadResult = {
                status: 200,
                message: responseMessage,
                data: {
                  requiresE2B: true,
                  showTerminal: true, // Explicit flag to show terminal panel
                  stdout: outputText,
                  exitCode: execution.exitCode || 0,
                },
                references: null,
              };
            } finally {
              // Ensure sandbox is killed even if an error occurs
              try {
                // Check if sandbox is defined and kill it
                if (sandbox) {
                  await sandbox.kill();
                }
              } catch (closeError) {
                console.error("Error shutting down E2B sandbox:", closeError);
              }
            }
          } catch (e2bError) {
            console.error("Error using E2B SDK:", e2bError);
            
            // Extract meaningful error message
            const errorMessage = e2bError instanceof Error ? e2bError.message : String(e2bError);
            
            let friendlyMessage = `I tried to execute the command \`${extractedCommand}\` but encountered an error with the E2B service: ${errorMessage}`;
            
            // Return error to the user
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