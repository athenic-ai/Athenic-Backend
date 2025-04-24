import { MessagingInterface } from './messagingInterface';
import * as config from "../../../_shared/configs/index";

export class MessagingPluginCompany implements MessagingInterface {
  async auth(connection: string, connectionMetadata: Map<string, any>): Promise<any> {
    // Dummy implementation for compatibility
    return { status: 200, message: "Company auth not required." };
  }

  async receiveMessage(connection: string, dataIn: Map<string, any>): Promise<any> {
    // Convert Map to plain object for compatibility
    const dataObj = Object.fromEntries(dataIn.entries());
    try {
      console.log(`receiveMessage data is: ${config.stringify(dataIn)}`);
      
      if (Array.isArray(dataObj.companyDataContents?.parts)) {
        const messageDataThreadId = dataObj.companyMetadata?.parentObject?.id;
        const messageDataAuthorId = dataObj.companyDataContents?.authorId;
        const messageDataParts = dataObj.companyDataContents?.parts;

        const processedMessageData = {
          messageThreadId: messageDataThreadId,
          authorId: messageDataAuthorId,
          messageParts: messageDataParts,
        };

        const result: any = {
          status: 200,
          message: "Message received successfully",
          data: processedMessageData,
        };
        return result;
      }
      throw new Error("dataIn is not a valid array.");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("receiveMessage error:", error);
      const result: any = {
        status: 500,
        message: `❌ An error occurred while receiving message.\nError: ${errMsg}`,
      };
      return result;
    }
  }

  async storeMessage(): Promise<any> {
    // TODO: implement
  }

  async getChatHistory(): Promise<any> {
    // TODO: implement
  }
}