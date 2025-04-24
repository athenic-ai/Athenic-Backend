// --- ENSURE INTERFACE IS STRICT AND MATCHES IMPLEMENTATIONS ---
export interface MessagingInterface {
  auth(connection: string, connectionMetadata: Map<string, any>): Promise<any>;
  receiveMessage(connection: string, dataIn: Map<string, any>): Promise<any>;
  storeMessage(...args: any[]): Promise<any>;
  getChatHistory(...args: any[]): Promise<any>;
}