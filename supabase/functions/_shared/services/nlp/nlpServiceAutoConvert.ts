import PluginInterface from "../pluginInterface";
import NLPSharedFunctions from "./nlpSharedFunctions";
import StoragePlugin from "../storage/storagePlugin";
import TasksPlugin from "../tasks/tasksPlugin";
import OpenAI from "openai";
import * as constants from "../../constants";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

const nlpAssistantDeveloperIdSecret = defineSecret("NLP_ASSISTANT_DEVELOPER_ID");

interface MemberVariables {
  tasksService?: any;
  organisationId?: string;
  organisationData?: Record<string, unknown>;
  memberId?: any;
  memberData?: any;
  threadId?: string;
  selectedProductName?: string;
  selectedPlatformName?: string;
  processingDryRun?: any;
}

interface ExecuteParams {
  text: string;
  systemInstruction: string;
  chatHistory?: Array<{ role: string; content: string }>;
  temperature?: number;
  functionsIncluded?: any[];
  interpretFuncCalls?: boolean;
  useLiteModel?: boolean;
}

interface ExecuteThreadParams {
  text: string;
  systemInstruction: string;
}

class NLPPlugin extends PluginInterface {
  private nlpSharedFunctions: NLPSharedFunctions;
  private storagePlugin: StoragePlugin;
  private tasksPlugin: TasksPlugin;
  private tasksService: any | null = null;
  private clientCore: OpenAI | null = null;
  private clientTextEmbedding: any | null = null;
  private adminSettings: any | null = null;
  private organisationId: string | null = null;
  private organisationData: Record<string, unknown> | null = null;
  private productDataAll: Record<string, any> = {};
  private memberId: any | null = null;
  private memberData: any | null = null;
  private threadId: string | null = null;
  private supportedProductNames: string[] = [];
  private defaultProductName: string | null = null;
  private selectedProductName: string | null = null;
  private tasksMap: Record<string, any> = {};
  private supportedPlatformNames: string[] = ["email"];
  private selectedPlatformName: string | null = null;
  private dataIfFeedbackFromUser: any | null = null;
  private currentFunctionsIncluded: any[] | null = null;
  private functionDeclarations: any[] | null = null;
  private selectedNlp: string = "openai";
  private processingDryRun: any = constants.TriBool.UNKNOWN;

  constructor(
    storagePlugin: StoragePlugin = new StoragePlugin(),
    tasksPlugin: TasksPlugin = new TasksPlugin()
  ) {
    super();
    this.nlpSharedFunctions = new NLPSharedFunctions(this, admin);
    this.storagePlugin = storagePlugin;
    this.tasksPlugin = tasksPlugin;
  }

  setMemberVariables({
    tasksService,
    organisationId,
    organisationData,
    memberId,
    memberData,
    threadId,
    selectedProductName,
    selectedPlatformName,
    processingDryRun,
  }: MemberVariables) {
    console.log("setMemberVariables called");
    if (tasksService) this.tasksService = tasksService;
    if (organisationId) this.organisationId = organisationId;
    if (organisationData) this.organisationData = organisationData;
    if (memberId) this.memberId = memberId;
    if (memberData) this.memberData = memberData;
    if (threadId) this.threadId = threadId;
    if (selectedProductName) this.selectedProductName = selectedProductName;
    if (selectedPlatformName) this.selectedPlatformName = selectedPlatformName;
    if (processingDryRun) this.processingDryRun = processingDryRun;
  }

  async initializeClientCore(apiKey: string): Promise<void> {
    console.log("initializeClientCore called");
    try {
      this.clientCore = new OpenAI(apiKey);
      console.log("OpenAI client initialized successfully");
    } catch (error) {
      console.error("Error initializing OpenAI client:", error);
      throw error;
    }
  }

  async execute({
    text,
    systemInstruction,
    chatHistory = [],
    temperature = 0,
    functionsIncluded,
    interpretFuncCalls = false,
    useLiteModel = true,
  }: ExecuteParams): Promise<any> {
    if (!text) {
      throw new Error("No text provided for NLP analysis");
    }

    try {
      console.log(`NLP called with prompt: ${text}\n and chat history: ${JSON.stringify(chatHistory)}`);
      const model = useLiteModel
        ? constants.NLP_OPENAI_MODEL_LITE
        : constants.NLP_OPENAI_MODEL_FULL;

      if (!this.functionDeclarations || functionsIncluded !== this.currentFunctionsIncluded) {
        this.functionDeclarations = await this.nlpSharedFunctions.getFunctionDeclarations(functionsIncluded);
        this.currentFunctionsIncluded = functionsIncluded;
      }

      const messages = [
        { role: "system", content: systemInstruction },
        { role: "user", content: text },
      ];

      console.log(`functionDeclarations: ${JSON.stringify(this.functionDeclarations)}`);

      const initialCreateResult = await this.clientCore!.chat.completions.create({
        model,
        messages,
        tools: this.functionDeclarations,
      });

      const createResMessage = initialCreateResult.choices[0].message;

      if (createResMessage.tool_calls) {
        const functionResultsData = [];
        for (const toolCall of createResMessage.tool_calls) {
          if (toolCall.type === "function") {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            console.log(`Function called: ${functionName}`);
            console.log(`Arguments: ${JSON.stringify(functionArgs)}`);
            const functionResult = await this.nlpSharedFunctions.nlpFunctions[functionName](functionArgs);
            functionResultsData.push({ name: functionName, functionResult });
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
            model,
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
          return functionResultsData;
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

  sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, time));
  }
}

export default NLPPlugin;
