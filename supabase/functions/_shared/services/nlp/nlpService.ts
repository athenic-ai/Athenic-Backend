import { NlpFunctionsBase } from "./nlpFunctionsBase.ts";
import { StorageService } from "../storage/storageService.ts";
// import TasksPlugin from "../tasks/tasksPlugin";
import OpenAI from "npm:openai";
import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionToolChoiceOption } from "npm:openai/resources/chat/completions";
import * as config from "../../configs/index.ts";
import { FunctionResult } from "../../configs/index.ts";

// Helper function to convert message objects to the format required by OpenAI
function toChatMessage(message: any): ChatCompletionMessageParam {
  if (typeof message === 'string') {
    return { role: 'user', content: message };
  }
  
  if (message.role && message.content) {
    return message as ChatCompletionMessageParam;
  }
  
  if (message.type === 'text') {
    return { role: 'user', content: message.text };
  }
  
  // Return a default structure for any other format
  return { 
    role: message.role || 'user', 
    content: message.content || (typeof message === 'object' ? JSON.stringify(message) : String(message))
  };
}

// Helper function to convert message objects to the format required by OpenAI Threads
function toThreadMessage(message: any): { role: "user" | "assistant"; content: string } {
  if (typeof message === 'string') {
    return { role: 'user', content: message };
  }
  
  if (message.role && message.content) {
    return { 
      role: message.role === 'user' ? 'user' : 'assistant', 
      content: message.content 
    };
  }
  
  if (message.type === 'text') {
    return { role: 'user', content: message.text };
  }
  
  // Return a default structure for any other format
  return { 
    role: message.role === 'assistant' ? 'assistant' : 'user', 
    content: message.content || (typeof message === 'object' ? JSON.stringify(message) : String(message))
  };
}

export class NlpService {
  private nlpFunctionsBase: NlpFunctionsBase;
  private storageService: StorageService;
  private clientCore: OpenAI | null = null;
  private clientOpenAi: OpenAI | null = null;
  private adminSettings: any | null = null;
  private organisationId: string | null = null;
  private organisationData: Record<string, unknown> | null = null;
  private memberId: any | null = null;
  private memberData: any | null = null;
  private objectTypes: any[] = [];
  private objectMetadataTypes: any[] = [];
  private objectTypeDescriptions: string[] = [];
  private selectedObject: any | null = null;
  private selectedObjectTypeId: string | null = null;
  private selectedObjectPotentialParentIds: string[] = [];
  private relatedObjectIds: Record<string, unknown> | null = null; // Type ID -> Object ID map of all objects that have been called/created during this run and so related to each other
  public upsertedObjectIds: Record<string, unknown> | null = null; // Type ID -> Object ID map of all new objects that have been created during this run
  private objectMetadataFunctionProperties: Record<string, unknown> | null = null;
  private objectMetadataFunctionPropertiesRequiredIds: Record<string, string[]> | null = null;
  private fieldTypes: string[] = [];
  private dictionaryTerms: string[] = [];
  private currentFunctionsIncluded: any[] | null = null;
  private functionDeclarations: ChatCompletionTool[] | null = null;
  private selectedMessageThreadId: string | null = null;
  // private tasksPlugin: TasksPlugin;
  // private tasksService: any | null = null;
  // private productDataAll: Record<string, any> = {};
  // private defaultProductName: string | null = null;
  // private tasksMap: Record<string, any> = {};
  // private supportedPlatformNames: string[] = ["email"];
  // private selectedPlatformName: string | null = null;
  // private dataIfFeedbackFromUser: any | null = null;
  // private selectedNlp: string = "openai";
  // private processingDryRun: any = config.TriBool.UNKNOWN;

  constructor(
    storageService: StorageService = new StorageService(),
    // tasksPlugin: TasksPlugin = new TasksPlugin()
  ) {
    this.nlpFunctionsBase = new NlpFunctionsBase(this);
    this.storageService = storageService;
    // this.tasksPlugin = tasksPlugin;
  }

  // Helper method to pause execution
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setMemberVariables({
    organisationId,
    organisationData,
    memberId,
    memberData,
    objectTypes,
    objectMetadataTypes,
    objectTypeDescriptions,
    selectedObject,
    selectedObjectTypeId,
    selectedObjectPotentialParentIds,
    relatedObjectIds,
    upsertedObjectIds,
    objectMetadataFunctionProperties,
    objectMetadataFunctionPropertiesRequiredIds,
    fieldTypes,
    dictionaryTerms,
    selectedMessageThreadId
  }: {
    organisationId?: string;
    organisationData?: Record<string, unknown>;
    memberId?: any;
    memberData?: any;
    objectTypes?: any[];
    objectMetadataTypes?: any[];
    objectTypeDescriptions?: string[];
    selectedObject?: any;
    selectedObjectTypeId?: string;
    selectedObjectPotentialParentIds?: string[];
    relatedObjectIds? : Record<string, unknown>;
    upsertedObjectIds?: Record<string, unknown>;
    objectMetadataFunctionProperties?: Record<string, unknown>;
    objectMetadataFunctionPropertiesRequiredIds?: Record<string, string[]>;
    fieldTypes?: string[];
    dictionaryTerms?: string[];
    selectedMessageThreadId?: string;
  } = {}) {
    console.log("setMemberVariables called");
  
    this.organisationId = organisationId ?? this.organisationId;
    this.organisationData = organisationData ?? this.organisationData;
    this.memberId = memberId ?? this.memberId;
    this.memberData = memberData ?? this.memberData;
    this.objectTypes = objectTypes ?? this.objectTypes;
    this.objectMetadataTypes = objectMetadataTypes ?? this.objectMetadataTypes;
    this.objectTypeDescriptions = objectTypeDescriptions ?? this.objectTypeDescriptions;
    this.selectedObject = selectedObject ?? this.selectedObject;
    this.selectedObjectTypeId = selectedObjectTypeId ?? this.selectedObjectTypeId;
    this.selectedObjectPotentialParentIds = selectedObjectPotentialParentIds ?? this.selectedObjectPotentialParentIds;
    this.relatedObjectIds = relatedObjectIds ?? this.relatedObjectIds;
    this.upsertedObjectIds = upsertedObjectIds ?? this.upsertedObjectIds;
    this.objectMetadataFunctionProperties = objectMetadataFunctionProperties ?? this.objectMetadataFunctionProperties;
    this.objectMetadataFunctionPropertiesRequiredIds =
      objectMetadataFunctionPropertiesRequiredIds ?? this.objectMetadataFunctionPropertiesRequiredIds;
    this.fieldTypes = fieldTypes ?? this.fieldTypes;
    this.dictionaryTerms = dictionaryTerms ?? this.dictionaryTerms;
    this.selectedMessageThreadId = selectedMessageThreadId ?? this.selectedMessageThreadId;
  }

  async initialiseClientCore(apiKey: string): Promise<void> {
    console.log("initialiseClientCore called");
    try {      
      this.clientCore = new OpenAI({
        apiKey: apiKey || Deno.env.get('OPENAI_API_KEY'), // USING OPENAI API KEY FOR NOW AS CHEAPER
        // baseURL: 'https://openrouter.ai/api/v1',
        // apiKey: apiKey || Deno.env.get('OPENROUTER_API_KEY'),
      });
      console.log("Client core initialised successfully");
    } catch (error) {
      console.error("Error initializing client core:", error);
      throw error;
    }
  }

  async initialiseClientOpenAi(apiKey: string): Promise<void> {
    console.log("initialiseClientOpenAi called");
    try {
      this.clientOpenAi = new OpenAI({
        apiKey: apiKey || Deno.env.get('OPENAI_API_KEY'),
      });
      console.log("OpenAI client initialised successfully");
    } catch (error) {
      console.error("Error initializing OpenAI client:", error);
      throw error;
    }
  }

  async execute({
    promptParts,
    systemInstruction,
    chatHistory = [],
    temperature = 0.5,
    functionUsage = "auto", // Options: none, auto, required NOTE: required sometimes causes phantom params to be created, so try to avoid it
    functionsIncluded,
    interpretFuncCalls = false,
    useLiteModels = true,
  }: {
    promptParts: Array<any>;
    systemInstruction: string;
    chatHistory?: Array<{ role: string; content: string }>;
    temperature?: number;
    functionUsage?: string;
    functionsIncluded?: any[];
    interpretFuncCalls?: boolean;
    useLiteModels?: boolean;
  }): Promise<FunctionResult> {
    if (!promptParts) {
      throw new Error("No promptParts provided for NLP analysis");
    }

    if (!this.clientCore) {
      throw new Error("this.clientCore not initialised. Please call initialiseClientCore first.");
    }

    try {
      console.log(`NLP called with prompt:\n${config.stringify(promptParts)}\n\nand chat history:\n${config.stringify(chatHistory)}`);
      const models = useLiteModels
        ? config.NLP_MODELS_LITE
        : config.NLP_MODELS_FULL;

      await this.updateFunctionDeclarations({functionsIncluded});

      console.log(`Preparing messages with:\nsystem instruction: ${systemInstruction}\n chatHistory: ${config.stringify(chatHistory)}\n promptParts: ${config.stringify(promptParts)}`);

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemInstruction },
        ...chatHistory.map(toChatMessage),
        ...promptParts.map(toChatMessage),
      ];

      console.log(`Creating chat with:\nmodels: ${models} \nmessages: ${JSON.stringify(messages)}\ntemperature: ${temperature} \nfunctionUsage: ${functionUsage} \nfunctionsIncluded: ${JSON.stringify(functionsIncluded)}`);

      const initialCreateResult = await this.clientCore!.chat.completions.create({
        model: models[0],
        messages,
        temperature,
        tools: this.functionDeclarations ?? undefined,
        tool_choice: functionUsage as ChatCompletionToolChoiceOption, // NOTE: not supported by a number of models
        // provider: { // TODO: enable this before going to production
        //   data_collection: "deny"
        // },
      });
      console.log(`initialCreateResult created: ${config.stringify(initialCreateResult)}`)

      const createResMessage = initialCreateResult.choices[0].message;

      console.log(`createResMessage created: ${config.stringify(createResMessage)}`)

      if (createResMessage.tool_calls) {
        const functionResultsData = [];
        for (const toolCall of createResMessage.tool_calls) {
          if (toolCall.type === "function") {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            console.log(`tool_calls function called: ${functionName} with args: ${JSON.stringify(functionArgs)}`);
            const chosenFunctionImplementation = this.nlpFunctionsBase.nlpFunctions[functionName].implementation;
            const functionResult = await chosenFunctionImplementation(functionArgs);
            functionResultsData.push({ name: functionName, functionResult: functionResult });
            break; // Currently only allowing it to call the first function with this. Also when not interpreting, as part of this just returning the first function's data below. May want to change in the future to allow it to call all the functions it found
          } else {
            console.log("tool_calls type not function, so not calling any function");
          }
        }

        if (interpretFuncCalls) {
          const referencesList: any[] = [];
          for (const functionResultData of functionResultsData) {
            console.log(`functionResultData: ${JSON.stringify(functionResultData)}`);
            if (functionResultData.functionResult.references) {
              referencesList.push(functionResultData.functionResult.references);
            }
            const resultDataStr = config.stringify(functionResultData.functionResult.data);

            messages.push({
              role: "assistant",
              content: `Response after running function "${functionResultData.name}": ${resultDataStr}`,
            });
          }

          // TODO: Currently only returning the first function's data. May want to change in the future to allow it to return all the functions' data it has found
          if (functionResultsData.length > 1) {
            messages.push({
              role: "assistant",
              content: "Please note when interpreting these function calls, that multiple function calls have been run, however only the first function's data is being returned for viewing.",
            });
          }

          const interpretedCreateResult = await this.clientCore!.chat.completions.create({
            model: models[0],
            messages,
            tools: this.functionDeclarations ?? undefined,
          });

          console.log(`interpretedCreateResult stringified: ${JSON.stringify(interpretedCreateResult)}`);

          if (referencesList.length > 0) {
            const referencesStr = referencesList.map((ref, idx) => `<${ref}|here>`).join(", ");
            const result: FunctionResult = {
              status: 200,
              message: interpretedCreateResult.choices[0].message.content,
              data: functionResultsData[0].functionResult.data,
              references: referencesStr
            };
            return result;
          } else {
            const result: FunctionResult = {
              status: 200,
              message: interpretedCreateResult.choices[0].message.content,
              data: functionResultsData[0].functionResult.data,
              references: null
            };
            return result;
          }
        } else {
          const result: FunctionResult = {
            status: functionResultsData[0].functionResult.status,
            message: functionResultsData[0].functionResult.message.content,
            data: functionResultsData[0].functionResult.data,
            references: functionResultsData[0].functionResult.references
          };
          return result;
        }
      } else {
        console.log("No tool_calls were requested by the model.");
        const result: FunctionResult = {
          status: 200,
          message: createResMessage.content,
          data: null,
          references: null
        };
        return result;
      }
    } catch (error) {
      console.error("Error during NLP execution:", error);
      const result: FunctionResult = {
        status: 500,
        message: "Oops! I was unable to get a result. Please try again shortly.",
        data: null,
        references: null
      };
      return result;
    }
  }

  async executeThread({
    promptParts,
    chatHistory = [],
  }: {
    promptParts: Array<any>;
    chatHistory?: Array<{ role: string; content: string }>;
  }): Promise<FunctionResult> {
    if (!promptParts) {
      throw new Error("No promptParts provided for executeThread");
    }
  
    try {
      console.log(`executeThread called with prompt: ${config.stringify(promptParts)} and chat history: ${config.stringify(chatHistory)}`);

      let assistantId: unknown = null;
      
      // 1. Pull down all assistants from the database that are enabled
      const getAssistantsResult = await this.storageService.getRows('objects', {
        whereAndConditions: [
          {
          column: 'related_object_type_id',
          operator: 'eq',
          value: config.OBJECT_TYPE_ID_ASSISTANT
          },
          { column: 'metadata', jsonPath:['status'], operator: 'eq', value: 'assistantEnabled' }
        ],
        removeEmbeddings: true // Exclude embeddings to reduce payload size
      });
      
      if (getAssistantsResult.status != 200) {
        console.error(`Error getting assistants: ${getAssistantsResult.message}`);
        throw new Error(`Unable to get assistants: ${getAssistantsResult.message}`);
      }
      
      const assistants = getAssistantsResult.data || [];
      console.log(`Found ${assistants.length} assistants in the database`);

      console.log(`Assistants data: ${config.stringify(assistants)}`);
      
      // 2. Use NLP to triage the prompt
      // Combine the prompt parts into a single text for analysis
      const promptText = promptParts.map(part => 
        typeof part === 'string' ? part : JSON.stringify(part)
      ).join('\n');
      
      // Always add a "General Assistant" option for triage even if no assistants are found
      const triagePrompt = `
I need to determine if the following user prompt requires a specialized assistant.
The prompt is: "${promptText}"

Available assistants:
${assistants.length > 0 ? 
  assistants.map((assistant: any) => 
    `- ${assistant.metadata.title} (ID: ${assistant.id}): ${assistant.metadata.instructions}`
  ).join('\n') : 
  ''}
- General Assistant: A versatile assistant with access to all tools that can handle any general request or task.

If this is a simple prompt that doesn't require deep thinking, tool calling, or specialized knowledge, respond with "USE_BASIC".
Otherwise, respond with either:
${assistants.length > 0 ? 
  '- The ID of the most appropriate specialized assistant from the list above' : 
  ''}
- "USE_GENERAL" for the General Assistant if the prompt requires advanced capabilities but no specialized assistant is appropriate.

Respond only with "USE_BASIC", "USE_GENERAL", or an assistant ID (as a UUID and nothing else).`;

      console.log(`Triage prompt: ${triagePrompt}`);

      const triageResult = await this.execute({
        promptParts: [triagePrompt],
        systemInstruction: "You are a helpful AI assistant that analyses a prompt to determine the most appropriate specialized assistant to handle it.",
        useLiteModels: true, // Use lite models for triage to keep it fast
        functionUsage: "none" // No need for function usage in triage
      });
      
      if (triageResult.status === 200) {
        const triageResponse = triageResult.message?.trim();
        console.log(`Triage response: ${triageResponse}`);
        
        // If the triage suggests using a specific assistant
        if (triageResponse && triageResponse !== "USE_BASIC") {
          if (triageResponse === "USE_GENERAL") {
            // Create a general assistant with all tools
            console.log("Using general assistant based on triage");
            const generalAssistantResult = await this.createGeneralAssistant();
            if (generalAssistantResult.status === 200) {
              assistantId = generalAssistantResult.data;
            } else {
              throw new Error(`Failed to create general assistant: ${generalAssistantResult.message}`);
            }
          } else {
            // Find the assistant with the matching ID
            const selectedAssistant = assistants.find((a: any) => a.id === triageResponse);
            
            if (selectedAssistant) {
              // 3. Create the assistant dynamically
              const assistantCreateResult = await this.createDynamicAssistant(selectedAssistant);
              if (assistantCreateResult.status === 200) {
                assistantId = assistantCreateResult.data;
                console.log(`Created dynamic assistant with ID: ${assistantId}`);
              } else {
                console.error(`Failed to create dynamic assistant: ${assistantCreateResult.message}`);
                // Fall back to general assistant if we can't create the dynamic one
                const generalAssistantResult = await this.createGeneralAssistant();
                assistantId = generalAssistantResult.data;
              }
            } else {
              // If assistant ID wasn't found, use general assistant
              console.log(`Assistant with ID ${triageResponse} not found, using general assistant`);
              const generalAssistantResult = await this.createGeneralAssistant();
              assistantId = generalAssistantResult.data;
            }
          }
        } else {
          // For simple prompts or USE_BASIC response, just use execute() with a basic model
          console.log("Using basic model for simple prompt");
          const basicResult = await this.execute({
            promptParts,
            systemInstruction: config.VANILLA_SYSTEM_INSTRUCTION,
            chatHistory,
            useLiteModels: true
          });
          return basicResult;
        }
      } else {
        // If triage fails, fall back to general assistant
        console.error(`Triage failed: ${triageResult.message}, using general assistant`);
        const generalAssistantResult = await this.createGeneralAssistant();
        assistantId = generalAssistantResult.data;
      }

      if (assistantId && typeof assistantId !== 'string') {
        throw new Error('assistantId must be a string');
      }

      const messages: { role: "user" | "assistant"; content: string }[] = [
        ...chatHistory.map(toThreadMessage),
        ...promptParts.map(toThreadMessage),
      ];
  
      console.log(`messages: ${JSON.stringify(messages)}`);
  
      const thread = await this.clientOpenAi.beta.threads.create({
        messages,
      });
  
      console.log(`thread created with id: ${thread.id}`);
  
      // Create a list of available functions to include in the error messages
      const availableFunctions = Object.keys(this.nlpFunctionsBase.nlpFunctions);
      
      let threadRun = await this.clientOpenAi.beta.threads.runs.create(
        thread.id,
        {
          assistant_id: assistantId,
        },
      );
  
      console.log(`threadRun created: \nWith threadRun: ${config.stringify(threadRun)}\n\nWith accessible nlpFunctions: ${availableFunctions}`);
  
      let runLoop = 1;
      const threadRunHistory: string[] = [];
      while (true) {
        if (threadRun.status === "requires_action") {
          const toolOutputs: Array<{ tool_call_id: string; output: any }> = [];
          const toolCalls = (
            threadRun?.required_action?.submit_tool_outputs?.tool_calls
          ) ?? []; 
  
          console.log(`[${runLoop}] threadRun requires action(s)\n${JSON.stringify(toolCalls)}`);
  
          // Run tool calls sequentially (if in parallel, can cause some conflicts)
          for (const toolCall of toolCalls) {
            if (toolCall.type === "function") {
              const functionName = toolCall.function.name;
              const functionArgs = JSON.parse(toolCall.function.arguments);
              
              console.log(`[${runLoop}] Function called: ${functionName} with arguments: ${JSON.stringify(functionArgs)}`);
              
              // Check if the function exists before trying to execute it
              if (!this.nlpFunctionsBase.nlpFunctions[functionName]) {
                const errorMessage = `Function "${functionName}" not found. Available functions are: ${availableFunctions.join(", ")}`;
                console.error(errorMessage);
                
                // Add error output to tool outputs
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    status: 404,
                    error: errorMessage
                  })
                });
                
                threadRunHistory.push(`[${runLoop}] Error: ${errorMessage}`);
                continue; // Skip to next tool call
              }
              
              try {
                // Select and execute the specific function implementation
                const chosenFunctionImplementation = this.nlpFunctionsBase.nlpFunctions[functionName].implementation;
                const functionResult = await chosenFunctionImplementation(functionArgs);
                
                // Log the function execution details
                threadRunHistory.push(`[${runLoop}] Ran function: ${functionName}\nArguments: ${JSON.stringify(functionArgs)}\nResult: ${functionResult.message}`);
                
                // Add function output to tool outputs
                toolOutputs.push({
                  tool_call_id: toolCall.id, 
                  output: config.stringify(functionResult)
                });
              } catch (error) {
                const errorMessage = `Error executing function "${functionName}": ${error.message}`;
                console.error(errorMessage);
                
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    status: 500,
                    error: errorMessage
                  })
                });
                
                threadRunHistory.push(`[${runLoop}] Error: ${errorMessage}`);
              }
            }
          }
  
          console.log(`toolOutputs: ${JSON.stringify(toolOutputs)}`);
  
          if (toolOutputs.length > 0) {
            await this.clientOpenAi.beta.threads.runs.submitToolOutputs(
              thread.id,
              threadRun.id,
              {tool_outputs: toolOutputs},
            );
          }
        } else if (threadRun.status === "completed") {
          console.log("\n✅ Run completed");
          const messages = (await this.clientOpenAi.beta.threads.messages.list(thread.id)).data[0].content;
          const textMessages = messages.filter(
            (message) => message.type === "text",
          );
          threadRunHistory.push(`[${runLoop}] Thread run completed with first text message:\n${textMessages[0].text.value}`);
          console.log(`threadRun completed with run history:\n${threadRunHistory.join("\n-----\n")}`);
          const result: FunctionResult = {
            status: 200,
            message: textMessages[0].text.value, // This is a message posted by the AI, which typically describes the actions taken and whether the job was successful
            data: null,
            references: null
          };
          return result;
        } else if (threadRun.status === "queued" || threadRun.status === "in_progress") {
          // Do nothing, wait for completion
        } else if (
          ["cancelled", "cancelling", "expired", "failed"].includes(threadRun.status)
        ) {
          // Log the failure reason if available
          const failureReason = threadRun.last_error?.message || "Unknown error";
            
          threadRunHistory.push(`[${runLoop}] Thread run failed with status: ${threadRun.status}\nReason: ${failureReason}`);
  
          console.log(`threadRun failed with run history:\n${threadRunHistory.join("\n-----\n")}`);
  
          const result: FunctionResult = {
            status: 500,
            message: `Oops! I was unable to get a result. Please try again shortly.\n\nRun History:${threadRunHistory.join("\n-----\n")}`,
            data: null,
            references: null
          };
          return result;
        }
  
        threadRun = await this.clientOpenAi.beta.threads.runs.retrieve(
          thread.id,
          threadRun.id,
        );
  
        this.sleep(500);
        runLoop += 1;
      }
    } catch (error) {
      console.error("Error during NLP execution:", error);
      const result: FunctionResult = {
        status: 500,
        message: "Oops! I was unable to get a result. Please try again shortly.",
        data: null,
        references: null
      };
      return result;
    }
  }

  async updateFunctionDeclarations({ functionGroupsIncluded, functionsIncluded }: { functionGroupsIncluded?: string[], functionsIncluded?: string[] }) {
    // Update functionDeclarations if not set or modified
    // For each param, if not specified, all is loaded
    if (!this.functionDeclarations || functionGroupsIncluded !== this.currentFunctionGroupsIncluded || functionsIncluded !== this.currentFunctionsIncluded) {
      await this.nlpFunctionsBase.loadFunctionGroups(functionGroupsIncluded);
      console.log("this.nlpFunctionsBase.loadFunctionGroups complete");
      this.functionDeclarations = this.nlpFunctionsBase.getFunctionDeclarations(functionsIncluded);
      console.log("this.nlpFunctionsBase.getFunctionDeclarations complete");
      this.currentFunctionsIncluded = functionsIncluded;
    }
  }

  async createGeneralAssistant(): Promise<FunctionResult> {
    // TODO: Reuse assistant instead of creating one during every call!
    try {
      console.log("createGeneralAssistant called");

      await this.updateFunctionDeclarations({
        functionGroupsIncluded: ["nlpFunctionsData"],
      }); // Support all functions by default within the groups included by not specifying functionsIncluded

      const generalAssisantTools: ChatCompletionTool[] = [...this.functionDeclarations!]; // Shallow copy to avoid affecting this.functionDeclarations

      const assistant = await this.clientOpenAi.beta.assistants.create({
        name: "General Athenic AI Assistant",
        instructions: config.VANILLA_ASSISTANT_SYSTEM_INSTRUCTION,
        tools: generalAssisantTools,
        temperature: 0.5,
        model: config.NLP_MODELS_FULL[0],
      });  

      if (!assistant || !assistant.id) {
        throw new Error("Unable to create assistant");
      }

      const result: FunctionResult = {
        status: 200,
        message: `Created assistant successfully`,
        data: assistant.id,
        references: null
      };
      return result;
    } catch (error) {
      console.log(`Error creating assistant: ${error.message}`);
      const result: FunctionResult = {
        status: 500,
        message: `Oops! I was unable to get a result (${error.message}). Please try again shortly.`,
        data: null,
        references: null
      };
      return result;
    }
  }

  async createDynamicAssistant(assistantObject: any): Promise<FunctionResult> {
    try {
      console.log(`createDynamicAssistant called for ${assistantObject.metadata.title}`);

      // Provide all function groups for simplicity, as requested
      await this.updateFunctionDeclarations({
        functionGroupsIncluded: ["nlpFunctionsData", "nlpFunctionsEcommerce"],
      });

      const assistantTools: ChatCompletionTool[] = [...this.functionDeclarations!]; // Shallow copy to avoid affecting this.functionDeclarations

      // Combine the assistant-specific instructions with the vanilla instructions
      const combinedInstructions = `${config.VANILLA_ASSISTANT_SYSTEM_INSTRUCTION}
      
${assistantObject.metadata.instructions}`;

      const assistant = await this.clientOpenAi.beta.assistants.create({
        name: assistantObject.metadata.title,
        instructions: combinedInstructions,
        tools: assistantTools,
        temperature: 0.5,
        model: config.NLP_MODELS_FULL[0],
      });  

      if (!assistant || !assistant.id) {
        throw new Error("Unable to create assistant");
      }

      const result: FunctionResult = {
        status: 200,
        message: `Created assistant successfully`,
        data: assistant.id,
        references: null
      };
      return result;
    } catch (error) {
      console.log(`Error creating dynamic assistant: ${error.message}`);
      const result: FunctionResult = {
        status: 500,
        message: `❌ Error creating dynamic assistant: ${error.message}`,
        data: null,
        references: null
      };
      return result;
    }
  }

  // Add embedding to an object - used by StorageService when updating rows
  async addEmbeddingToObject(object: any): Promise<FunctionResult> {
    try {
      if (!object || !object.metadata || !object.metadata.title) {
        return {
          status: 400,
          message: "Object must have metadata with a title to generate embedding",
        };
      }
      
      const embeddingResult = await this.generateTextEmbedding(object.metadata.title);
      if (embeddingResult.status !== 200) {
        return embeddingResult;
      }
      
      object.embedding = embeddingResult.data;
      
      return {
        status: 200,
        data: object,
        message: "Embedding added to object successfully",
      };
    } catch (error) {
      return {
        status: 500,
        message: `Error adding embedding to object: ${error.message}`,
      };
    }
  }

  async generateTextEmbedding(text: string): Promise<FunctionResult> {
    try {
      if (!this.clientOpenAi) {
        throw new Error("OpenAI client not initialized. Please call initialiseClientOpenAi first.");
      }
      
      const response = await this.clientOpenAi.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
      });
      
      return {
        status: 200,
        data: response.data[0].embedding,
        message: "Embedding generated successfully",
      };
    } catch (error) {
      return {
        status: 500,
        message: `Error generating embedding: ${error.message}`,
      };
    }
  }
}