import { EcommerceInterface } from './ecommerceInterface.ts';
import { EcommercePluginShopify } from './ecommercePluginShopify.ts';
import * as config from "../../configs/index.ts";
import * as uuid from "jsr:@std/uuid";

const connectionPlugins: Record<string, EcommerceInterface> = {
  shopify: new EcommercePluginShopify(),
};

export class EcommerceService {
  async auth(connection: string, connectionMetadata: Map<string, any>) {
    const plugin = connectionPlugins[connection];
    if (!plugin) throw new Error(`Unsupported connection: ${connection}`);
    return plugin.auth(connectionMetadata);
  }

  async verifyWebhook(connection: string, rawBody: string, hmacHeader: string): Promise<boolean> {
    const plugin = connectionPlugins[connection];
    if (!plugin) throw new Error(`Unsupported connection: ${connection}`);
    return plugin.verifyWebhook(rawBody, hmacHeader);
  }
}
