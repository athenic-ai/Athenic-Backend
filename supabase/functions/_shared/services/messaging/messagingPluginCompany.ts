import { MessagingInterface } from './messagingInterface.ts';
import * as config from "../../../_shared/configs/index.ts";
import * as uuid from "jsr:@std/uuid";

export class MessagingPluginCompany implements MessagingInterface {
  async receiveMessage(dataIn: Map<string, any>) {
    try {
      console.log(`receiveMessage data is: ${config.stringify(dataIn)}`);
      
      if (Array.isArray(dataIn.companyDataContents.parts)) {
        // For consumer app, parentObject might be null
        let messageDataThreadId;
        
        if (dataIn.companyMetadata.parentObject && dataIn.companyMetadata.parentObject.id) {
          messageDataThreadId = dataIn.companyMetadata.parentObject.id;
        } else {
          // For consumer app or when parentObject is missing, generate a thread ID
          console.log("No parent object found, generating thread ID for consumer app");
          messageDataThreadId = uuid.v1.generate();
        }
        
        const messageDataAuthorId = dataIn.companyDataContents.authorId;
        const messageDataParts = dataIn.companyDataContents.parts;

        const processedMessageData = {
          messageThreadId: messageDataThreadId,
          authorId: messageDataAuthorId,
          messageParts: messageDataParts,
        };

        const result: FunctionResult = {
          status: 200,
          message: "Message received successfully",
          data: processedMessageData,
        };
        return result;
      }
      throw new Error("dataIn is not a valid array.");
    } catch (error) {
      console.error("receiveMessage error:", error);
      const result: FunctionResult = {
        status: 500,
        message: `❌ An error occurred while receiving message.\nError: ${error.message}`,
      };
      return result;
    }
  }
}