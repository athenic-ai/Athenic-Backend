export interface MessagingInterface {
  auth(connection: string, connectionMetadata: Map<string, any>): Promise<any>;
  // send(message: string, userId: string): Promise<any>;
}