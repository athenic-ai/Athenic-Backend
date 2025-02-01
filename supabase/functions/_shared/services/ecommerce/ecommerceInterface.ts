export interface EcommerceInterface {
  auth(connection: string, connectionMetadata: Map<string, any>): Promise<any>;
  verifyWebhook(connection: string, rawBody: string, hmacHeader: string): Promise<boolean>;
}