import { NlpFunctionsBase } from "./nlpFunctionsBase.ts";
import { StorageService } from "../storage/storageService.ts";
// import TasksPlugin from "../tasks/tasksPlugin";
import OpenAI from "npm:openai"
import * as config from "../../configs/index.ts";

interface ExecuteParams {
  text: string;
  systemInstruction: string;
  chatHistory?: Array<{ role: string; content: string }>;
  temperature?: number;
  functionUsage?: string;
  limitedFunctionSupportList?: any[];
  interpretFuncCalls?: boolean;
  useLiteModels?: boolean;
}

interface ExecuteThreadParams {
  text: string;
  systemInstruction: string;
}

export class NlpService {
  private nlpFunctionsBase: NlpFunctionsBase;
  private storageService: StorageService;
  private clientCore: OpenAI | null = null;
  private clientEmbedding: OpenAI | null = null;
  private adminSettings: any | null = null;
  private organisationId: string | null = null;
  private organisationData: Record<string, unknown> | null = null;
  private memberFire: any | null = null;
  private memberData: any | null = null;
  private supportedObjectTypeIds: string[] = [];
  private selectedObjectTypeId: string | null = null;
  private selectedObjectsIds: string[] = [];
  private objectMetadataFunctionProperties: Record<string, unknown> | null = null;
  private objectMetadataFunctionPropertiesRequiredIds: Record<string, string[]> | null = null;
  private currentFunctionSupportList: any[] | null = null;
  private functionDeclarations: any[] | null = null;
  // private tasksPlugin: TasksPlugin;
  // private tasksService: any | null = null;
  // private productDataAll: Record<string, any> = {};
  // private threadId: string | null = null;
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
    memberFire,
    memberData,
    supportedObjectTypeIds,
    selectedObjectTypeId,
    selectedObjectsIds,
    objectMetadataFunctionProperties,
    objectMetadataFunctionPropertiesRequiredIds,
  }: {
    organisationId?: string;
    organisationData?: Record<string, unknown>;
    memberFire?: any;
    memberData?: any;
    supportedObjectTypeIds?: string[];
    selectedObjectTypeId?: string;
    selectedObjectsIds?: string[];
    objectMetadataFunctionProperties?: Record<string, unknown>;
    objectMetadataFunctionPropertiesRequiredIds?: Record<string, string[]>;
  } = {}) {
    console.log("setMemberVariables called");
  
    this.organisationId = organisationId ?? this.organisationId;
    this.organisationData = organisationData ?? this.organisationData;
    this.memberFire = memberFire ?? this.memberFire;
    this.memberData = memberData ?? this.memberData;
    this.supportedObjectTypeIds = supportedObjectTypeIds ?? this.supportedObjectTypeIds;
    this.selectedObjectTypeId = selectedObjectTypeId ?? this.selectedObjectTypeId;
    this.selectedObjectsIds = selectedObjectsIds ?? this.selectedObjectsIds;
    this.objectMetadataFunctionProperties = objectMetadataFunctionProperties ?? this.objectMetadataFunctionProperties;
    this.objectMetadataFunctionPropertiesRequiredIds =
      objectMetadataFunctionPropertiesRequiredIds ?? this.objectMetadataFunctionPropertiesRequiredIds;
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
    text,
    systemInstruction,
    chatHistory = [],
    temperature = 0,
    functionUsage = "auto", // Options: none, auto, required
    limitedFunctionSupportList,
    interpretFuncCalls = false,
    useLiteModels = true,
  }: ExecuteParams): Promise<any> {
    if (!text) {
      throw new Error("No text provided for NLP analysis");
    }

    if (!this.clientCore) {
      throw new Error("this.clientCore not initialised. Please call initialiseClientCore first.");
    }

    console.log(`functionUsage: ${functionUsage}`);

    try {
      console.log(`NLP called with prompt:\n${text}\n\nand chat history:\n${JSON.stringify(chatHistory)}`);
      const models = useLiteModels
        ? config.NLP_MODELS_LITE
        : config.NLP_MODELS_FULL;

      if (!this.functionDeclarations || limitedFunctionSupportList !== this.currentFunctionSupportList) {
        await this.nlpFunctionsBase.loadFunctions();
        this.functionDeclarations = this.nlpFunctionsBase.getAllFunctionDeclarations();
        this.currentFunctionSupportList = limitedFunctionSupportList;
      }

      const messages = [
        { role: "system", content: systemInstruction },
        { role: "user", content: text },
      ];

      console.log("this.functionDeclarations: ", this.functionDeclarations);

      const initialCreateResult = await this.clientCore!.chat.completions.create({
        models,
        messages,
        tools: this.functionDeclarations,
        tool_choice: functionUsage, // NOTE: not supported by a number of models
        // provider: { // TODO: enable this before going to production
        //   data_collection: "deny"
        // },
      });
      const createResMessage = initialCreateResult.choices[0].message;

      if (createResMessage.tool_calls) {
        console.log("tool_calls requested with current functions:", this.nlpFunctionsBase.nlpFunctions); // FYI can't JSON parse this specific var, so to show it, need to do it like this
        const functionResultsData = [];
        for (const toolCall of createResMessage.tool_calls) {
          if (toolCall.type === "function") {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            console.log(`Function called: ${functionName} with args: ${JSON.stringify(functionArgs)}`);
            const chosenFunctionImplementation = this.nlpFunctionsBase.nlpFunctions[functionName].implementation;
            const functionResult = await chosenFunctionImplementation(functionArgs);
            functionResultsData.push({ name: functionName, functionResult: functionResult });
            break; // Currently only allowing it to call the first function with this. Also when not interpreting, as part of this just returning the first function's data below. May want to change in the future to allow it to call all the functions it found
          }
        }

        if (interpretFuncCalls) {
          const referencesList: any[] = [];
          for (const functionResultData of functionResultsData) {
            if (functionResultData.functionResult.references) {
              referencesList.push(functionResultData.functionResult.references);
            }
            const result = typeof functionResultData.result === "object"
              ? JSON.stringify(functionResultData.result)
              : functionResultData.result;

            messages.push({
              role: "assistant",
              content: `Response after running function "${functionResultData.name}": ${result}`,
            });
          }

          const interpretedCreateResult = await this.clientCore!.chat.completions.create({
            models,
            messages,
            tools: this.functionDeclarations,
          });

          if (referencesList.length > 0) {
            const referencesStr = referencesList.map((ref, idx) => `<${ref}|here>`).join(", ");
            return { result: `${interpretedCreateResult.response.text()}\n_References: ${referencesStr}._` };
          } else {
            return { result: interpretedCreateResult.response.text() };
          }
        } else {
          return functionResultsData[0].functionResult;
        }
      } else {
        console.log("No function calls were made by the model.");
        return { result: createResMessage.content };
      }
    } catch (error) {
      console.error("Error during NLP execution:", error);
      return "Oops! I was unable to get a result. Please try again shortly.";
    }
  }

  async addEmbeddingToObject(objectIn: Record<string, any>): Promise<Record<string, any>> {
    try {
      console.log("addEmbeddingToObject called");
      const embeddingRes = await this.generateTextEmbedding(objectIn);  
      console.log(`embeddingRes: ${JSON.stringify(embeddingRes)}`);
      if (embeddingRes.status != 200) {
        throw new Error(embeddingRes.message || "Error embedding data.");
      }
      const objectUpdated = { ...objectIn, embedding: embeddingRes.data };
      console.log(`objectUpdated: ${JSON.stringify(objectUpdated)}`);
      
      const result: FunctionResult = {
        status: 200,
        message: "Embedding added successfully",
        data: objectUpdated,
      };
      return result;
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: `❌ Failed to embed data with error: ${error.message}.`,
      };
      return result;
    }
  }

  /**
   * Checks if the input is a plain object (map-like)
   */
  private isPlainObject(input: any): boolean {
    return input && typeof input === 'object' && !Array.isArray(input);
  }

  /**
   * Splits text into chunks while respecting sentence boundaries
   */
  private splitTextIntoChunks(
    text: string,
    chunkSize: number,
    overlap: number,
    respectSentences: boolean
  ): string[] {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    const chunks: string[] = [];

    if (cleanText.length <= chunkSize) {
      return [cleanText];
    }

    let startIndex = 0;
    while (startIndex < cleanText.length) {
      let endIndex = startIndex + chunkSize;
      
      if (endIndex > cleanText.length) {
        endIndex = cleanText.length;
      } else if (respectSentences) {
        // Look for sentence boundaries within the last 100 characters of the chunk
        const searchArea = cleanText.slice(Math.max(endIndex - 100, startIndex), endIndex);
        const lastSentenceMatch = searchArea.match(/[.!?][^\w]*(?=[A-Z]|$)/);
        
        if (lastSentenceMatch) {
          endIndex = endIndex - (100 - lastSentenceMatch.index);
        }
      }

      chunks.push(cleanText.slice(startIndex, endIndex).trim());
      startIndex = endIndex - overlap;
    }

    return chunks;
  }

  /**
   * Splits a map object into chunks based on character count of stringified values
   */
  private splitMapIntoChunks(
    inputMap: Record<string, any>,
    chunkSize: number
  ): Record<string, any>[] {
    const chunks: Record<string, any>[] = [{}];
    let currentChunkSize = 0;
    let currentChunkIndex = 0;

    // Sort keys by value length to try to optimize chunk distribution
    const sortedEntries = Object.entries(inputMap).sort((a, b) => 
      JSON.stringify(b[1]).length - JSON.stringify(a[1]).length
    );

    for (const [key, value] of sortedEntries) {
      const valueSize = JSON.stringify(value).length;
      
      // If a single value is larger than chunk size, split it if it's a string
      if (valueSize > chunkSize && typeof value === 'string') {
        const textChunks = this.splitTextIntoChunks(
          value,
          chunkSize,
          this.DEFAULT_OVERLAP,
          this.DEFAULT_RESPECT_SENTENCES
        );
        
        textChunks.forEach((chunk, index) => {
          if (index === 0 && currentChunkSize < chunkSize) {
            chunks[currentChunkIndex][key] = chunk;
            currentChunkSize += chunk.length;
          } else {
            chunks.push({ [key]: chunk });
            currentChunkIndex++;
            currentChunkSize = chunk.length;
          }
        });
        continue;
      }

      // If adding this value would exceed chunk size, create new chunk
      if (currentChunkSize + valueSize > chunkSize && Object.keys(chunks[currentChunkIndex]).length > 0) {
        chunks.push({});
        currentChunkIndex++;
        currentChunkSize = 0;
      }

      // Add the key-value pair to current chunk
      chunks[currentChunkIndex][key] = value;
      currentChunkSize += valueSize;
    }

    return chunks;
  }

  /**
   * Main chunking function that handles both text and map inputs
   */
  private splitIntoChunks(
    input: string | Record<string, any>,
    chunkSize = config.NLP_EMBEDDING_CHUNK_SIZE,
    overlap = config.NLP_EMBEDDING_OVERLAP,
    respectSentences = config.NLP_EMBEDDING_RESPECT_SENTENCES
  ): (string | Record<string, any>)[] {
    if (typeof input === 'string') {
      return this.splitTextIntoChunks(input, chunkSize, overlap, respectSentences);
    }
    
    if (this.isPlainObject(input)) {
      return this.splitMapIntoChunks(input, chunkSize);
    }

    throw new Error('Input must be either a string or a plain object');
  }

  /**
   * Generates embeddings for the input, handling both text and map inputs
   */
  async generateTextEmbedding(
    input: string | Record<string, any>,
    chunkSize?: number,
    overlap?: number,
    respectSentences?: boolean
  ): Promise<FunctionResult> {
    try {
      if (!input) {
        throw new Error('No input provided for NLP analysis');
      }

      if (!this.clientEmbedding) {
        throw new Error("this.clientEmbedding not initialised. Please call initialiseClientEmbedding first.");
      }  

      const chunks = this.splitIntoChunks(input, chunkSize, overlap, respectSentences);
      const embeddings: any = [];

      // Generate embeddings for each chunk
      for (const chunk of chunks) {
        const textToEmbed = typeof chunk === 'string' 
          ? chunk 
          : JSON.stringify(chunk);

        console.log(`Generating embeddings for chunk of length ${textToEmbed.length}`);
        console.log(`Model: ${config.NLP_EMBEDDING_MODEL}`);
        console.log(`Chunk: ${textToEmbed}`);
        console.log(`this.clientEmbedding: ${this.clientEmbedding}`);
        const createEmbeddingsResult = await this.clientEmbedding.embeddings.create({
          model: config.NLP_EMBEDDING_MODEL,
          input: textToEmbed,
          encoding_format: "float",
        });

        embeddings.push(createEmbeddingsResult.data[0].embedding);
      }

      const result: FunctionResult = {
        status: 200,
        message: embeddings.length === 1 
          ? "Embedding generated successfully"
          : `Successfully generated embeddings for ${chunks.length} chunks`,
        data: embeddings.length === 1 ? embeddings[0] : embeddings,
      };
      return result;

    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: `❌ Failed to embed data with error: ${error.message}`,
      };
      return result;
    }
  }

  sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, time));
  }
}