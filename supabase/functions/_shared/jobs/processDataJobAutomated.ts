// // import { defineSecret } from "firebase-functions/params";
// // import { Readable } from "stream";
// // import csv from "csv-parser";
// // import NLPGeminiPlugin from "../plugins/nlp/nlpGeminiPlugin";
// // import StoragePlugin from "../plugins/storage/storagePlugin";
// // const geminiApiKeySecret = defineSecret("GEMINI_API_KEY");

// import { StorageService } from "../services/storage/storageService.ts";

// interface OrganisationData {
//   [key: string]: any;
// }

// class ProcessDataJob<T> {
//   // private nlpGeminiPlugin: NLPGeminiPlugin;
//   private storageService: StorageService;
//   // private tasksService: any;

//   constructor(
//     // tasksService: any,
//     // nlpGeminiPlugin: NLPGeminiPlugin = new NLPGeminiPlugin(),
//     storagePlugin: StorageService = new StorageService();
//   ) {
//     this.nlpGeminiPlugin = nlpGeminiPlugin;
//     this.storagePlugin = storagePlugin;
//     this.tasksService = tasksService;
//   }

//   async start(params: { source, data, dryRun = constants.TriBool.FALSE }): Promise<any> {
//     console.log(`Processing data from source: ${source}`);
//     try {
//       const [organisationId, organisationData] = await this.inferOrganisation({ source, data });
//       if (!organisationData) {
//         const error = `Couldn't find organisation (${organisationId})`;
//         console.error(error);
//         return [500, error];
//       }

//       this.nlpGeminiPlugin.setMemberVariables({
//         organisationId,
//         tasksService: this.tasksService,
//         selectedPlatformName: source,
//       });

//       await this.nlpGeminiPlugin.initializeClientCore({
//         apiKey: geminiApiKeySecret.value(),
//         functionsIncluded: ["predictProductBeingReferenced"],
//         systemInstruction: constants.VANILLA_SYSTEM_INSTRUCTION,
//         funcCallingMode: "ANY",
//       });

//       await this.nlpGeminiPlugin.initializeClientTextEmbedding(geminiApiKeySecret.value());

//       const preProcessedData = await this.preProcessData({ source, data, dryRun });
//       console.log(`Pre-processed data: ${JSON.stringify(preProcessedData)}`);

//       return this.executeWorkflow(preProcessedData, source, dryRun);
//     } catch (error) {
//       console.error(`Error in processData workflow: ${error}`);
//       return [500, `Error in processData workflow: ${error}`];
//     }
//   }

//   private async inferOrganisation({ source, data }: { source: string; data: T }): Promise<[string | null, OrganisationData | null]> {
//     if (source === "email") {
//       const organisationId = (data as any).recipient.split("@")[0];
//       const organisationDoc = await this.storagePlugin.getDoc(`organisations/${organisationId}`);
//       return [organisationId, organisationDoc.data()];
//     } else if (source === "fileUploadCsv") {
//       const organisationId = (data as any).organisationId;
//       const organisationDoc = await this.storagePlugin.getDoc(`organisations/${organisationId}`);
//       return [organisationId, organisationDoc.data()];
//     }
//     console.error(`Unsupported source: ${source}`);
//     return [null, null];
//   }

//   private async preProcessData({ source, data, dryRun }: { source: string; data: T; dryRun: boolean }): Promise<any> {
//     if (source === "email") {
//       const feedback = data as any;
//       return {
//         date: feedback.Date,
//         fromName: feedback.From.split(" <")[0],
//         fromEmail: feedback.sender,
//         subject: feedback.Subject,
//         bodyPlain: feedback["body-plain"],
//       };
//     } else if (source === "fileUploadCsv") {
//       const feedback = data as any;
//       const csvData: any[] = [];
//       await new Promise((resolve, reject) => {
//         Readable.from(feedback.csvData)
//           .pipe(csv())
//           .on("data", (row) => csvData.push(row))
//           .on("end", resolve)
//           .on("error", reject);
//       });
//       return dryRun ? csvData.slice(0, 3) : csvData;
//     }
//     return data;
//   }

//   private async executeWorkflow(preProcessedData: any, source: string, dryRun: boolean): Promise<any> {
//     if (source === "fileUploadCsv" && dryRun) {
//       return preProcessedData; // Return data directly in dry run for CSV
//     }

//     const nlpResults = [];
//     for (const item of Array.isArray(preProcessedData) ? preProcessedData : [preProcessedData]) {
//       const prompt = `Process this data: ${JSON.stringify(item)}`;
//       const result = await this.nlpGeminiPlugin.execute({
//         text: prompt,
//         allowedFunctionNames: ["extractUserData"],
//       });
//       nlpResults.push(result);
//     }
//     return nlpResults.length === 1 ? nlpResults[0] : nlpResults;
//   }
// }

// export default ProcessDataJob;
