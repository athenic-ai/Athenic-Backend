import { NlpFunctionsBase } from "./nlpFunctionsBase.ts";
import { StorageService } from "../storage/storageService.ts";
// import TasksPlugin from "../tasks/tasksPlugin";
import OpenAI from "npm:openai"
import * as config from "../../configs/index.ts";

export class NlpService {
  private nlpFunctionsBase: NlpFunctionsBase;
  private storageService: StorageService;
  private clientCore: OpenAI | null = null;
  private clientEmbedding: OpenAI | null = null;
  private adminSettings: any | null = null;
  private organisationId: string | null = null;
  private organisationData: Record<string, unknown> | null = null;
  private memberId: any | null = null;
  private memberData: any | null = null;
  private supportedObjectTypeIds: string[] = [];
  private supportedObjectTypeDescriptions: string[] = [];
  private selectedObjectTypeId: string | null = null;
  private selectedObjectsIds: string[] = [];
  private objectMetadataFunctionProperties: Record<string, unknown> | null = null;
  private objectMetadataFunctionPropertiesRequiredIds: Record<string, string[]> | null = null;
  private currentFunctionSupportList: any[] | null = null;
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
    supportedObjectTypeIds,
    supportedObjectTypeDescriptions,
    selectedObjectTypeId,
    selectedObjectsIds,
    objectMetadataFunctionProperties,
    objectMetadataFunctionPropertiesRequiredIds,
    selectedMessageThreadId
  }: {
    organisationId?: string;
    organisationData?: Record<string, unknown>;
    memberId?: any;
    memberData?: any;
    supportedObjectTypeIds?: string[];
    supportedObjectTypeDescriptions?: string[];
    selectedObjectTypeId?: string;
    selectedObjectsIds?: string[];
    objectMetadataFunctionProperties?: Record<string, unknown>;
    objectMetadataFunctionPropertiesRequiredIds?: Record<string, string[]>;
    selectedMessageThreadId?: string;
  } = {}) {
    console.log("setMemberVariables called");
  
    this.organisationId = organisationId ?? this.organisationId;
    this.organisationData = organisationData ?? this.organisationData;
    this.memberId = memberId ?? this.memberId;
    this.memberData = memberData ?? this.memberData;
    this.supportedObjectTypeIds = supportedObjectTypeIds ?? this.supportedObjectTypeIds;
    this.supportedObjectTypeDescriptions = supportedObjectTypeDescriptions ?? this.supportedObjectTypeDescriptions;
    this.selectedObjectTypeId = selectedObjectTypeId ?? this.selectedObjectTypeId;
    this.selectedObjectsIds = selectedObjectsIds ?? this.selectedObjectsIds;
    this.objectMetadataFunctionProperties = objectMetadataFunctionProperties ?? this.objectMetadataFunctionProperties;
    this.objectMetadataFunctionPropertiesRequiredIds =
      objectMetadataFunctionPropertiesRequiredIds ?? this.objectMetadataFunctionPropertiesRequiredIds;
    this.selectedMessageThreadId = selectedMessageThreadId ?? this.selectedMessageThreadId;

    console.log("this.objectMetadataFunctionProperties NOW", this.objectMetadataFunctionProperties);
    console.log("this.objectMetadataFunctionPropertiesRequiredIds NOW", this.objectMetadataFunctionPropertiesRequiredIds);
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

  async initialiseClientEmbedding(apiKey: string): Promise<void> {
    console.log("initialiseClientEmbedding called");
    try {
      this.clientEmbedding = new OpenAI({apiKey: Deno.env.get('OPENAI_API_KEY')}); // Use this if calling OpenAI's API directly (needed as OpenRouter doesn't support embeddings right now)
      console.log("OpenAI client embedding initialised successfully");
    } catch (error) {
      console.error("Error initializing OpenAI client embedding:", error);
      throw error;
    }
  }


  async execute({
    promptParts,
    systemInstruction,
    chatHistory = [],
    temperature = 0,
    functionUsage = "auto", // Options: none, auto, required
    limitedFunctionSupportList,
    interpretFuncCalls = false,
    useLiteModels = true,
  }: {
    promptParts: Array;
    systemInstruction: string;
    chatHistory?: Array<{ role: string; content: string }>;
    temperature?: number;
    functionUsage?: string;
    limitedFunctionSupportList?: any[];
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

      if (!this.functionDeclarations || limitedFunctionSupportList !== this.currentFunctionSupportList) {
        await this.nlpFunctionsBase.loadFunctions();
        this.functionDeclarations = this.nlpFunctionsBase.getAllFunctionDeclarations();
        this.currentFunctionSupportList = limitedFunctionSupportList;
      }

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
      console.log("createResMessage: ", createResMessage);

      if (createResMessage.tool_calls) {
        console.log("tool_calls requested");
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
            console.error("tool_calls type not function, so not calling any function");
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

          console.log(`messages after function calls, prior to interpretedCreateResult: ${JSON.stringify(messages)}`);

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
        console.log("generateTextEmbedding called with input:", input);
        
        if (!input) {
          throw new Error('No input provided for NLP analysis');
        }
        
        if (!this.clientEmbedding) {
          throw new Error("clientEmbedding not initialised");
        }

        // Process input based on type
        let textToEmbed: string;
        if (typeof input === 'string') {
          textToEmbed = this.truncateText(input, config.NLP_EMBEDDING_MAX_CHARS);
        } else if (typeof input === 'object') {
          console.log(`Before truncating len: ${JSON.stringify(input).length}`);
          const truncatedObj = this.truncateObjectValues(input);
          textToEmbed = JSON.stringify(truncatedObj);
          console.log(`After truncating len: ${textToEmbed.length}`);
        } else {
          throw new Error('Input must be either a string or a plain object');
        }

        console.log(`Generating embedding for text of length ${textToEmbed.length}`);
        
        const createEmbeddingsResult = await this.clientEmbedding.embeddings.create({
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
        console.log("addEmbeddingToObject called");
        const objectToGenEmbeddingsFor = structuredClone(objectIn); // Create a deep copy

        // Remove the following keys we don't want to be a part of the embedding
        if ('embedding' in objectToGenEmbeddingsFor) {
          delete objectToGenEmbeddingsFor.embedding;
        }
        if ('child_ids' in objectToGenEmbeddingsFor) {
          delete objectToGenEmbeddingsFor.child_ids;
        }
        if ('related_ids' in objectToGenEmbeddingsFor) {
          delete objectToGenEmbeddingsFor.related_ids;
        }
        
        const embeddingRes = await this.generateTextEmbedding(
          objectToGenEmbeddingsFor,
        );
        
        console.log(`embeddingRes: ${JSON.stringify(embeddingRes)}`);
        
        if (embeddingRes.status !== 200) {
            throw new Error(embeddingRes.message || "Error embedding data.");
        }
        
        const objectUpdated = { ...objectIn, embedding: embeddingRes.data };
        console.log(`objectUpdated: ${JSON.stringify(objectUpdated)}`);
        
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