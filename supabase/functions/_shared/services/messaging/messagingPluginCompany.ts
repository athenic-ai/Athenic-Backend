import { MessagingInterface } from './messagingInterface.ts';

export class MessagingPluginCompany implements MessagingInterface {
  async receiveMessage(messageData: Map<string, any>) {
    try {
      console.log(`receiveMessage data is: ${JSON.stringify(messageData)}`);
      
      if (Array.isArray(messageData.parts)) {
        const messageDataThreadId = messageData.threadId;
        const messageDataAuthorId = messageData.authorId;
        const messageDataParts = messageData.parts;

        const processedMessageData = {
          threadId: messageDataThreadId,
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
      throw new Error("messageData is not a valid array.");
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