import { NlpFunctionsBase } from "./nlpFunctionsBase.ts";
import { StorageService } from "../storage/storageService.ts";
// import TasksPlugin from "../tasks/tasksPlugin";
import OpenAI from "npm:openai"
import * as config from "../../configs/index.ts";

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
  private objectMetadataFunctionProperties: Record<string, unknown> | null = null;
  private objectMetadataFunctionPropertiesRequiredIds: Record<string, string[]> | null = null;
  private fieldTypes: string[] = [];
  private dictionaryTerms: string[] = [];
  private currentFunctionsIncluded: any[] | null = null;
  private functionDeclarations: any[] | null = null;
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
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: Deno.env.get('OPENROUTER_API_KEY'),
        // defaultHeaders: {
        //   "HTTP-Referer": $YOUR_SITE_URL, // Optional, for including your app on openrouter.ai rankings.
        //   "X-Title": $YOUR_APP_NAME, // Optional. Shows in rankings on openrouter.ai.
        // }
      })
      console.log("OpenAI client core initialised successfully");
    } catch (error) {
      console.error("Error initializing OpenAI client core:", error);
      throw error;
    }
  }

  async initialiseClientOpenAi(apiKey: string): Promise<void> {
    console.log("initialiseClientOpenAi called");
    try {
      this.clientOpenAi = new OpenAI({apiKey: Deno.env.get('OPENAI_API_KEY')}); // Use this if calling OpenAI's API directly (needed as OpenRouter doesn't support embeddings or assistants right now)
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
    promptParts: Array;
    systemInstruction: string;
    chatHistory?: Array<{ role: string; content: string }>;
    temperature?: number;
    functionUsage?: string;
    functionsIncluded?: any[];
    interpretFuncCalls?: boolean;
    useLiteModels?: boolean;
  }): Promise<any> {
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

      const messages = [
        { role: "developer", content: systemInstruction },
        ...chatHistory, // Add chat history
        ...promptParts.map((part) => ({ role: "user", content: [part] })), // Add user's prompt parts
      ];

      const initialCreateResult = await this.clientCore!.chat.completions.create({
        models,
        messages,
        temperature,
        tools: this.functionDeclarations,
        tool_choice: functionUsage, // NOTE: not supported by a number of models
        // provider: { // TODO: enable this before going to production
        //   data_collection: "deny"
        // },
      });
      const createResMessage = initialCreateResult.choices[0].message;

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
            models,
            messages,
            tools: this.functionDeclarations,
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
            };
            return result;
          }
        } else {
          const result: FunctionResult = {
            status: functionResultsData[0].functionResult.status,
            message: functionResultsData[0].functionResult.message.content,
            data: functionResultsData[0].functionResult.data,
          };
          return result;
        }
      } else {
        console.log("No tool_calls were requested by the model.");
        const result: FunctionResult = {
          status: 200,
          message: createResMessage.content
        };
        return result;
      }
    } catch (error) {
      console.error("Error during NLP execution:", error);
      const result: FunctionResult = {
        status: 500,
        message: "Oops! I was unable to get a result. Please try again shortly."
      };
      return result;
    }
  }

  async executeThread({
    prompt,
    // Model controlled within /executables
}: {
    prompt: string;
}) {
    if (!prompt) {
      throw new Error("No text provided for executeThread");
    }

    try {
      console.log(`executeThread called with prompt: ${prompt}`);

      const createGeneralAssistantResult = await this.createGeneralAssistant();
      if (createGeneralAssistantResult.status !== 200) {
        throw new Error(createGeneralAssistantResult.message);
      }
      const assistantId = createGeneralAssistantResult.data;

      // TODO: currently haven't added support for chat history - add this!
      const messages = [
        {"role": "user", "content": prompt}, // system not supported when using assistant. 
      ];

      console.log(`messages: ${JSON.stringify(messages)}`);

      const thread = await this.clientOpenAi.beta.threads.create({
        messages: messages,
      });

      console.log(`thread created with id: ${thread.id}`);

      let threadRun = await this.clientOpenAi.beta.threads.runs.create(
          thread.id,
          {assistant_id: assistantId},
      );

      console.log(`threadRun created: ${config.stringify(threadRun)}`);

      let runLoop = 1;
      const threadRunHistory: string[] = [];
      while (true) {
        if (threadRun.status === "requires_action") {
          const toolOutputs: Array<{ tool_call_id: string; output: any }> = [];
          const toolCalls = (
            threadRun &&
            threadRun.required_action &&
            threadRun.required_action.submit_tool_outputs &&
            Array.isArray(threadRun.required_action.submit_tool_outputs.tool_calls)
          ) ? threadRun.required_action.submit_tool_outputs.tool_calls : []; // assign functions to toolCalls if there are any
          console.log(`[${runLoop}] threadRun requires action(s)\n${JSON.stringify(toolCalls)}`);

          const toolPromises = toolCalls.map(async (toolCall) => {
            if (toolCall.type === "function") {
              const functionName = toolCall.function.name;
              const functionArgs = JSON.parse(toolCall.function.arguments);
              console.log(`[${runLoop}] Function called: ${functionName} with arguments: ${JSON.stringify(functionArgs)}`);
              // Handle the function call here
              const chosenFunctionImplementation = this.nlpFunctionsBase.nlpFunctions[functionName].implementation;
              const functionResult = await chosenFunctionImplementation(functionArgs);
              threadRunHistory.push(`[${runLoop}] Ran function: ${functionName}\nArguments: ${JSON.stringify(functionArgs)}\nResult: ${functionResult.message}`);
              toolOutputs.push({tool_call_id: toolCall.id, output: config.stringify(functionResult)});
            }
          });
          await Promise.all(toolPromises); // Use Promise.all to wait for all promises to resolve before continuing

          console.log(`toolOutputs: ${JSON.stringify(toolOutputs)}`);

          // const outputs = await config.sandbox.openai.actions.run(threadRun); // Orig code, seemingly calling OpenAI within the sandbox (not within the Firebase Function)
          if (toolOutputs.length > 0) {
            // Run found function (ie. "tool")
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
            message: "Successfully completed thread.",
          };
          return result;
        } else if (threadRun.status === "queued" || threadRun.status === "in_progress") {
          // Do nothing, wait for completion
        } else if (
          threadRun.status === "cancelled" ||
            threadRun.status === "cancelling" ||
            threadRun.status === "expired" ||
            threadRun.status === "failed"
        ) {
          threadRunHistory.push(`[${runLoop}] Thread run failed with status: ${threadRun.status}`);
          console.log(`threadRun failed with run history:\n${threadRunHistory.join("\n-----\n")}`);
          const result: FunctionResult = {
            status: 500,
            message: `Oops! I was unable to get a result (${threadRun.status}). Please try again shortly.`
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
        message: "Oops! I was unable to get a result. Please try again shortly."
      };
      return result;
    }
  }

  async updateFunctionDeclarations({ functionGroupsIncluded, functionsIncluded }: { functionGroupsIncluded?: string[], functionsIncluded?: string[] }) {
    // Update functionDeclarations if not set or modified
    // For each param, if not specified, all is loaded
    if (!this.functionDeclarations || functionGroupsIncluded !== this.currentFunctionGroupsIncluded || functionsIncluded !== this.currentFunctionsIncluded) {
      await this.nlpFunctionsBase.loadFunctionGroups(functionGroupsIncluded);
      this.functionDeclarations = this.nlpFunctionsBase.getFunctionDeclarations(functionsIncluded);
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

      const generalAssisantTools = [...this.functionDeclarations]; // Shallow copy to avoid affecting this.functionDeclarations
      generalAssisantTools.push({"type": "code_interpreter"}); // Adding support for code interpreter

      const assistant = await this.clientOpenAi.beta.assistants.create({
        name: "General Athenic AI Assistant",
        instructions: `You have been tasked with helping the member to create, read, update and delete signals and jobs. When creating signals, deeply analyse a given trigger, doing research like e.g. searching the object database or searching the web to uncover insight(s) that should be signals. If Athenic thinks a job(s) should be carried out as a consequence of this analysis, do that`,
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
      };
      return result;
    } catch (error) {
      console.log(`Error creating assistant: ${error.message}`);
      const result: FunctionResult = {
        status: 500,
        message: `Oops! I was unable to get a result (${error.message}). Please try again shortly.`
      };
      return result;
    }
  }

/**
 * Calculates the maximum length for each value in an object based on the number of keys
 * Includes a buffer for JSON syntax and key names
 * @param obj The input object
 * @returns Maximum allowed length for each value
 */
calculateMaxValueLength(obj: Record<string, any>): number {
    const numberOfKeys = Object.keys(obj).length;
    const syntaxBuffer = 2 + // Object braces {}
                        (numberOfKeys - 1) * 1 + // Commas between key-value pairs
                        numberOfKeys * 4; // Average characters for quotes and colon per key-value pair
    
    // Calculate average key length to reserve space for keys
    const averageKeyLength = Object.keys(obj)
        .reduce((sum, key) => sum + key.length, 0) / numberOfKeys;
    const totalKeySpace = averageKeyLength * numberOfKeys;
    
    // Total available space for values
    const availableSpace = config.NLP_EMBEDDING_MAX_CHARS - syntaxBuffer - totalKeySpace;
    
    // Divide available space by number of keys, ensuring a minimum reasonable length
    return Math.max(Math.floor(availableSpace / numberOfKeys), 100);
}

/**
 * Truncates text with an ellipsis if it exceeds the maximum length
 * @param text Text to truncate
 * @param maxLength Maximum allowed length
 * @returns Truncated text with ellipsis if necessary
 */
truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + '…';
}

/**
 * Efficiently truncates object values while maintaining relative proportions
 * @param obj Input object
 * @returns Object with truncated values
 */
truncateObjectValues(obj: Record<string, any>): Record<string, any> {
    const stringified = JSON.stringify(obj);
    if (stringified.length <= config.NLP_EMBEDDING_MAX_CHARS) return obj;

    const maxValueLength = this.calculateMaxValueLength(obj);
    
    // Calculate total length of all string values
    const valueStats = Object.entries(obj).reduce((acc, [key, value]) => {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        acc.totalLength += valueStr.length;
        acc.lengths[key] = valueStr.length;
        return acc;
    }, { totalLength: 0, lengths: {} as Record<string, number> });

    // If we still need to reduce further, calculate reduction factor
    const currentTotalLength = Object.values(valueStats.lengths)
        .reduce((sum, length) => sum + Math.min(length, maxValueLength), 0);
    const reductionFactor = currentTotalLength > config.NLP_EMBEDDING_MAX_CHARS 
        ? config.NLP_EMBEDDING_MAX_CHARS / currentTotalLength 
        : 1;

    // Create new object with truncated values
    return Object.entries(obj).reduce((acc, [key, value]) => {
        if (typeof value === 'string') {
            const adjustedMaxLength = Math.floor(
                Math.min(maxValueLength, valueStats.lengths[key]) * reductionFactor
            );
            acc[key] = this.truncateText(value, adjustedMaxLength);
        } else {
            // For non-string values, stringify if they're too long
            const valueStr = JSON.stringify(value);
            if (valueStr.length > maxValueLength) {
                acc[key] = this.truncateText(valueStr, maxValueLength);
            } else {
                acc[key] = value;
            }
        }
        return acc;
    }, {} as Record<string, any>);
}

async generateTextEmbedding(
    input: string | Record<string, any>,
): Promise<FunctionResult> {
    try {        
        if (!input) {
          throw new Error('No input provided for NLP analysis');
        }
        
        if (!this.clientOpenAi) {
          throw new Error("clientOpenAi not initialised");
        }

        // Process input based on type
        let textToEmbed: string;
        if (typeof input === 'string') {
          textToEmbed = this.truncateText(input, config.NLP_EMBEDDING_MAX_CHARS);
        } else if (typeof input === 'object') {
          const truncatedObj = this.truncateObjectValues(input);
          textToEmbed = JSON.stringify(truncatedObj);
        } else {
          throw new Error('Input must be either a string or a plain object');
        }
        
        const createEmbeddingsResult = await this.clientOpenAi.embeddings.create({
          model: config.NLP_EMBEDDING_MODEL,
          input: textToEmbed,
          encoding_format: "float",
        });

        if (!createEmbeddingsResult.data?.[0]?.embedding) {
          throw new Error('No embedding generated');
        }

        return {
            status: 200,
            message: "Embedding generated successfully",
            data: createEmbeddingsResult.data[0].embedding,
        };
    } catch (error) {
        return {
            status: 500,
            message: `❌ Failed to embed data with error: ${error.message}`,
        };
    }
}

async addEmbeddingToObject(
    objectIn: Record<string, any>,
): Promise<FunctionResult> {
    try {
        const objectToGenEmbeddingsFor = structuredClone(objectIn); // Create a deep copy

        // Remove the following keys we don't want to be a part of the embedding
        if ('embedding' in objectToGenEmbeddingsFor) {
          delete objectToGenEmbeddingsFor.embedding;
        }
        if ('child_ids' in objectToGenEmbeddingsFor.metadata) {
          delete objectToGenEmbeddingsFor.metadata.child_ids;
        }
        if ('related_ids' in objectToGenEmbeddingsFor.metadata) {
          delete objectToGenEmbeddingsFor.metadata.related_ids;
        }
        
        const embeddingRes = await this.generateTextEmbedding(
          objectToGenEmbeddingsFor,
        );
                
        if (embeddingRes.status !== 200) {
            throw new Error(embeddingRes.message || "Error embedding data.");
        }
        
        const objectUpdated = { ...objectIn, embedding: embeddingRes.data };
        
        return {
            status: 200,
            message: "Embedding added successfully",
            data: objectUpdated,
        };
    } catch (error) {
        return {
            status: 500,
            message: `❌ Failed to embed data with error: ${error.message}.`,
        };
    }
}

  sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, time));
  }
}