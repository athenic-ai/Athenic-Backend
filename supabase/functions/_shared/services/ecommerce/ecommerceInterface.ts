export interface EcommerceInterface {
  auth(connection: string, connectionMetadata: Map<string, any>): Promise<any>;
}