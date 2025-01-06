export interface MessagingInterface {
  auth(connection: string, connectionMetadata: Map<string, any>): Promise<any>;
  receiveMessage(connection: string, messageData: Map<string, any>): Promise<any>;
}