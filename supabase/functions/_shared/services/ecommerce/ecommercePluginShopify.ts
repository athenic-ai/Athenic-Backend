import { EcommerceInterface } from './ecommerceInterface.ts';
import axios from 'npm:axios@1.7.9';
import * as config from "../../configs/index.ts";
import { StorageService } from "../storage/storageService.ts";
import { NlpService } from "../nlp/nlpService.ts";

export class EcommercePluginShopify implements EcommerceInterface {
  async auth(connection: string, connectionMetadata: Map<string, any>) {
    console.log(`Auth Shopify with connection: ${connection} and connectionMetadata: ${JSON.stringify(connectionMetadata)}`);
    const stateMap = JSON.parse(connectionMetadata.state);
    console.log(`stateMap: ${JSON.stringify(stateMap)}`);
    const shop = connectionMetadata["shop"];

    try {
      // Verify HMAC if present (Shopify security measure)
      if (connectionMetadata["hmac"]) {
        const isValid = await this.verifyHmac(connectionMetadata);
        if (!isValid) {
          throw new Error("Invalid HMAC signature");
        }
      }

      // Exchange the authorization code for an access token
      const tokenResponse = await axios.post(
        `https://${shop}/admin/oauth/access_token`,
        {
          client_id: Deno.env.get("SHOPIFY_CLIENT_ID"),
          client_secret: Deno.env.get("SHOPIFY_CLIENT_SECRET"),
          code: connectionMetadata["code"],
        }
      );

      const shopifyAccessToken = tokenResponse.data.access_token;
      const shopifyScope = tokenResponse.data.scope;

      if (!shopifyAccessToken) {
        throw new Error(
          "Failed to retrieve access token from Shopify: " +
          JSON.stringify(tokenResponse.data)
        );
      }

      // Verify the shop details
      const shopResponse = await axios.get(
        `https://${shop}/admin/api/2024-01/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': shopifyAccessToken
          }
        }
      );

      const shopData = shopResponse.data.shop;

      // Prepare the organisation data update
      const organisationRow = {
        connection_metadata: {
          shopify: {
            access_token: shopifyAccessToken,
            scope: shopifyScope,
            shop: {
              id: shopData.id,
              name: shopData.name,
              domain: shop,
              email: shopData.email,
            },
            reports_enabled: true,
            updated_at: new Date().toISOString(),
          },
        },
      };

      // Update the database
      const storageService = new StorageService();
      const nlpService = new NlpService();
      await nlpService.initialiseClientCore();

      const organisationsUpdateResult = await storageService.updateRow({
        table: "organisations",
        keys: {id: stateMap.organisationId},
        rowData: organisationRow,
        nlpService: nlpService,
        mayAlreadyExist: true,
      });

      if (organisationsUpdateResult.status != 200) {
        return organisationsUpdateResult;
      }

      // Update connection mapping
      const connectionOrganisationMappingUpdateResult = await storageService.updateRow({
        table: "connection_organisation_mapping",
        keys: {connection: "shopify", connection_id: shopData.id.toString()},
        rowData: {organisation_id: stateMap.organisationId},
        mayBeNew: true,
        nlpService: nlpService,
      });

      if (connectionOrganisationMappingUpdateResult.status == 200) {
        const result: FunctionResult = {
          status: 200,
          message: "Shopify store connected successfully!\nYou can close this tab now.",
        };
        return result;
      } else {
        return connectionOrganisationMappingUpdateResult;
      }
    } catch (error) {
      console.error("Auth callback error:", error);
      const result: FunctionResult = {
        status: 500,
        message: `❌ An error occurred while connecting Shopify.\nError: ${error.message}`,
      };
      return result;
    }
  }

  // Verify Shopify HMAC signature
  private async verifyHmac(params: any): Promise<boolean> {
    const hmac = params["hmac"];
    delete params["hmac"];  // Remove hmac from params before verification

    // Sort parameters
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    // Create HMAC
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(Deno.env.get("SHOPIFY_CLIENT_SECRET")),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(sortedParams)
    );

    const calculatedHmac = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return hmac === calculatedHmac;
  }
}
