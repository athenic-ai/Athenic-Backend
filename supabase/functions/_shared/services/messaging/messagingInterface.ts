export interface MessagingInterface {
  auth(connection: string, connectionMetadata: Map<string, any>): Promise<any>;
  receiveMessage(connection: string, dataIn: Map<string, any>): Promise<any>;
  storeMessage(params: {
    organisationId: string;
    memberId?: string; // Optional, since you use a default value in your implementation
    connectionId: string;
    messageThreadId: string;
    messageIsFromBot: boolean;
    authorId: string;
    message: string;
    storageService: StorageService;
  }): Promise<any>;
  getChatHistory(params: {
    organisationId: string;
    memberId?: string; // Optional, if `memberId` can be null or undefined
    messageThreadId: string;
    storageService: StorageService;
    nlpService: NlpService;
  }): Promise<any>;
}