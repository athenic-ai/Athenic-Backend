import { EcommerceInterface } from './ecommerceInterface.ts';
import axios from 'npm:axios';
import * as config from "../../configs/index.ts";
// fallback: if above fails, try the following
// import * as config from "../../_shared/configs/index.ts";
import { StorageService } from "../storage/storageService.ts";
import { NlpService } from "../nlp/nlpService.ts";
import { 
  verifyAuth, 
  syncCustomers, 
  syncProducts, 
  syncOrders 
} from './ecommercePluginShopifyHelpers.ts';
import { FunctionResult } from "../../configs/index.ts";

export class EcommercePluginShopify implements EcommerceInterface {
  async auth(connection: string, connectionMetadata: Map<string, any>): Promise<any> {
    console.log(`Auth Shopify with connectionMetadata: ${JSON.stringify(connectionMetadata)}`);
    const metadataObj = Object.fromEntries(connectionMetadata.entries());
    const stateMap = JSON.parse(metadataObj.state);
    const shop = metadataObj["shop"];

    try {
      // Verify HMAC if present (Shopify security measure)
      if (metadataObj["hmac"]) {
        const isValid = await verifyAuth(metadataObj as Record<string, string>);
        if (!isValid) {
          throw new Error("Invalid HMAC signature");
        }
      }

      // Exchange the authorization code for an access token
      const tokenResponse = await axios.post(
        `https://${shop}/admin/oauth/access_token`,
        {
          client_id: process.env.SHOPIFY_CLIENT_ID,
          client_secret: process.env.SHOPIFY_CLIENT_SECRET,
          code: metadataObj["code"],
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

      console.log(`Received Shopify access token with scopes: ${shopifyScope}`);
      
      // Check if we have the necessary scopes for reading customers, products, and orders
      const requiredScopes = ['read_customers', 'read_products', 'read_orders'];
      const scopeList = shopifyScope.split(',');
      
      const missingScopes = requiredScopes.filter(requiredScope => {
        // Check for direct match
        if (scopeList.includes(requiredScope)) return false;
        
        // Check for expanded scopes that include the required scope
        if (requiredScope === 'read_products' && scopeList.includes('write_products')) return false;
        if (requiredScope === 'read_orders' && scopeList.includes('read_all_orders')) return false;
        
        return true;
      });
      
      if (missingScopes.length > 0) {
        console.warn(`Missing Shopify API scopes: ${missingScopes.join(', ')}. Some data may not be synced.`);
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
      await nlpService.initialiseClientCore(process.env.OPENROUTER_API_KEY || '');
      await nlpService.initialiseClientOpenAi(process.env.OPENAI_API_KEY || '');

      const organisationsUpdateResult = await storageService.updateRow({
        table: "organisations",
        keys: {id: stateMap.organisationId},
        rowData: organisationRow,
        nlpService,
        mayAlreadyExist: true,
      });

      if (organisationsUpdateResult.status != 200) {
        return organisationsUpdateResult;
      }

      // Update connection mapping
      const connectionOrganisationMappingUpdateResult = await storageService.updateRow({
        table: "connection_organisation_mapping",
        keys: {connection: "shopify", connection_id: shop.toString()},
        rowData: {organisation_id: stateMap.organisationId},
        mayAlreadyExist: true,
        nlpService: nlpService,
      });
      
      // Pull data
      try {
        console.log("Starting Shopify data synchronization...");
        
        // Fetch customers from Shopify
        await syncCustomers(shop, shopifyAccessToken, stateMap.organisationId, storageService, nlpService);
        
        // Fetch products from Shopify
        await syncProducts(shop, shopifyAccessToken, stateMap.organisationId, storageService, nlpService);
        
        // Fetch orders from Shopify
        await syncOrders(shop, shopifyAccessToken, stateMap.organisationId, storageService, nlpService);
        
        console.log("Shopify data synchronization completed successfully.");
      } catch (syncError) {
        console.error("Error during data synchronization:", syncError);
        // Continue with the connection process even if sync fails
      }

      if (connectionOrganisationMappingUpdateResult.status == 200) {
        const result: FunctionResult = {
          status: 200,
          message: "Shopify store connected successfully!\nYou can close this tab now.",
          data: null,
          references: null,
        };
        return result;
      } else {
        return connectionOrganisationMappingUpdateResult;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { status: 500, message: `❌ Error: ${errMsg}`, data: null, references: null };
    }
  }

  // For auth verification
  async verifyAuth(params: Record<string, string>): Promise<boolean> {
    try {
      const hmac = params["hmac"];
      const paramsWithoutHmac = { ...params };
      delete paramsWithoutHmac["hmac"];

      // Sort parameters
      const sortedParams = Object.keys(paramsWithoutHmac)
        .sort()
        .map(key => `${key}=${paramsWithoutHmac[key]}`)
        .join('&');

      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(process.env.SHOPIFY_CLIENT_SECRET || ''),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(sortedParams)
      );

      // Keep hex format for auth verification
      const calculatedHmac = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      return hmac === calculatedHmac;
    } catch (error) {
      console.error('Auth verification failed:', error);
      return false;
    }
  }

  // For webhook verification
  async verifyWebhook(rawBody: string, hmacHeader: string): Promise<boolean> {
    try {
      const calculatedHmac = await this.createHmac(
        rawBody,
        process.env.SHOPIFY_CLIENT_SECRET || ''
      );
      
      return hmacHeader === calculatedHmac;
    } catch (error) {
      console.error('Webhook verification failed:', error);
      return false;
    }
  }

  // Verify Shopify HMAC signature
  private async createHmac(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(data)
    );

    // Convert to Base64 instead of hex
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  // Synchronize Shopify customers to database
  private async syncCustomers(shopDomain: string, accessToken: string, organisationId: string, 
    storageService: StorageService, nlpService: NlpService) {
    
    console.log("Syncing customers from Shopify...");
    let pageInfo = null;
    let hasMoreCustomers = true;
    
    while (hasMoreCustomers) {
      try {
        // Fetch customers with cursor-based pagination
        console.log(`Fetching customers batch from ${shopDomain}`);
        
        // Build params object based on whether we have a page_info cursor
        const params: Record<string, any> = { limit: 50 };
        if (pageInfo) {
          params.page_info = pageInfo;
        }
        
        const response = await axios.get(
          `https://${shopDomain}/admin/api/2024-01/customers.json`,
          {
            headers: { 
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            },
            params
          }
        );
        
        // Extract pagination links from Link header
        const linkHeader = response.headers.link || response.headers.Link;
        pageInfo = null;
        
        if (linkHeader) {
          // Parse the Link header to get the next page info
          const nextLink = linkHeader.split(',').find((link: string) => link.includes('rel="next"'));
          if (nextLink) {
            const pageInfoMatch = nextLink.match(/page_info=([^&>]*)/);
            if (pageInfoMatch && pageInfoMatch[1]) {
              pageInfo = decodeURIComponent(pageInfoMatch[1]);
            }
          }
        }
        
        hasMoreCustomers = !!pageInfo;
        
        const customers = response.data.customers || [];
        console.log(`Retrieved ${customers.length} customers`);
        if (customers.length === 0) {
          hasMoreCustomers = false;
          continue;
        }
        
        // Process and store each customer
        for (const customer of customers) {
          const processedCustomer = this.mapShopifyCustomerToDbObject(customer);
          const shopifyId = customer.id.toString();
          
          // Generate a new UUID for each object
          const objectId = crypto.randomUUID();
          
          // Create or update the object
          await storageService.updateRow({
            table: "objects",
            keys: {
              id: objectId,
              owner_organisation_id: organisationId,
              related_object_type_id: "customer"
            },
            rowData: {
              metadata: processedCustomer
            },
            mayAlreadyExist: false, // Set to false since we're creating a new object
            nlpService: nlpService,
          });
        }
      } catch (error) {
        console.error("Error syncing customers:", error);
        console.error("Error details:", {
          url: `https://${shopDomain}/admin/api/2024-01/customers.json`,
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        hasMoreCustomers = false;
      }
    }
  }
  
  // Synchronize Shopify products to database
  private async syncProducts(shopDomain: string, accessToken: string, organisationId: string,
    storageService: StorageService, nlpService: NlpService) {
    
    console.log("Syncing products from Shopify...");
    let pageInfo = null;
    let hasMoreProducts = true;
    
    while (hasMoreProducts) {
      try {
        // Fetch products with cursor-based pagination
        console.log(`Fetching products batch from ${shopDomain}`);
        
        // Build params object based on whether we have a page_info cursor
        const params: Record<string, any> = { limit: 50 };
        if (pageInfo) {
          params.page_info = pageInfo;
        }
        
        const response = await axios.get(
          `https://${shopDomain}/admin/api/2024-01/products.json`,
          {
            headers: { 
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            },
            params
          }
        );
        
        // Extract pagination links from Link header
        const linkHeader = response.headers.link || response.headers.Link;
        pageInfo = null;
        
        if (linkHeader) {
          // Parse the Link header to get the next page info
          const nextLink = linkHeader.split(',').find((link: string) => link.includes('rel="next"'));
          if (nextLink) {
            const pageInfoMatch = nextLink.match(/page_info=([^&>]*)/);
            if (pageInfoMatch && pageInfoMatch[1]) {
              pageInfo = decodeURIComponent(pageInfoMatch[1]);
            }
          }
        }
        
        hasMoreProducts = !!pageInfo;
        
        const products = response.data.products || [];
        console.log(`Retrieved ${products.length} products`);
        if (products.length === 0) {
          hasMoreProducts = false;
          continue;
        }
        
        // Process and store each product
        for (const product of products) {
          const processedProduct = this.mapShopifyProductToDbObject(product, shopDomain);
          const shopifyId = product.id.toString();
          
          // Generate a new UUID for each object
          const objectId = crypto.randomUUID();
          
          // Create or update the object
          await storageService.updateRow({
            table: "objects",
            keys: {
              id: objectId,
              owner_organisation_id: organisationId,
              related_object_type_id: "product"
            },
            rowData: {
              metadata: processedProduct
            },
            mayAlreadyExist: false, // Set to false since we're creating a new object
            nlpService: nlpService,
          });
        }
      } catch (error) {
        console.error("Error syncing products:", error);
        console.error("Error details:", {
          url: `https://${shopDomain}/admin/api/2024-01/products.json`,
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        hasMoreProducts = false;
      }
    }
  }
  
  // Synchronize Shopify orders to database
  private async syncOrders(shopDomain: string, accessToken: string, organisationId: string,
    storageService: StorageService, nlpService: NlpService) {
    
    console.log("Syncing orders from Shopify...");
    let pageInfo = null;
    let hasMoreOrders = true;
    
    while (hasMoreOrders) {
      try {
        // Fetch orders with cursor-based pagination
        console.log(`Fetching orders batch from ${shopDomain}`);
        
        // Build params object based on whether we have a page_info cursor
        const params: Record<string, any> = { limit: 50 };
        if (pageInfo) {
          params.page_info = pageInfo;
        }
        
        const response = await axios.get(
          `https://${shopDomain}/admin/api/2024-01/orders.json`,
          {
            headers: { 
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            },
            params
          }
        );
        
        // Extract pagination links from Link header
        const linkHeader = response.headers.link || response.headers.Link;
        pageInfo = null;
        
        if (linkHeader) {
          // Parse the Link header to get the next page info
          const nextLink = linkHeader.split(',').find((link: string) => link.includes('rel="next"'));
          if (nextLink) {
            const pageInfoMatch = nextLink.match(/page_info=([^&>]*)/);
            if (pageInfoMatch && pageInfoMatch[1]) {
              pageInfo = decodeURIComponent(pageInfoMatch[1]);
            }
          }
        }
        
        hasMoreOrders = !!pageInfo;
        
        const orders = response.data.orders || [];
        console.log(`Retrieved ${orders.length} orders`);
        if (orders.length === 0) {
          hasMoreOrders = false;
          continue;
        }
        
        // Process and store each order
        for (const order of orders) {
          const processedOrder = this.mapShopifyOrderToDbObject(order);
          const shopifyId = order.id.toString();
          
          // Generate a new UUID for each object
          const objectId = crypto.randomUUID();
          
          // Create or update the object
          await storageService.updateRow({
            table: "objects",
            keys: {
              id: objectId,
              owner_organisation_id: organisationId,
              related_object_type_id: "order"
            },
            rowData: {
              metadata: processedOrder
            },
            mayAlreadyExist: false, // Set to false since we're creating a new object
            nlpService: nlpService,
          });
        }
      } catch (error) {
        console.error("Error syncing orders:", error);
        console.error("Error details:", {
          url: `https://${shopDomain}/admin/api/2024-01/orders.json`,
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        hasMoreOrders = false;
      }
    }
  }
  
  // Map Shopify customer data to our database schema
  private mapShopifyCustomerToDbObject(customer: any): Record<string, any> {
    return {
      title: customer.first_name && customer.last_name ? 
        `${customer.first_name} ${customer.last_name}` : "Anonymous",
      email_subscription: customer.accepts_marketing ? "Subscribed" : "Not subscribed",
      location: customer.default_address ? 
        [customer.default_address.city, customer.default_address.province, customer.default_address.country]
          .filter(Boolean).join(", ") : "",
      orders: customer.orders_count || 0,
      spent: customer.total_spent ? 
        `${parseFloat(customer.total_spent).toFixed(2)} ${customer.currency || "USD"}` : "0.00",
      shopify_id: customer.id.toString(),
      created_at: customer.created_at,
      updated_at: customer.updated_at
    };
  }
  
  // Map Shopify product data to our database schema
  private mapShopifyProductToDbObject(product: any, shopDomain: string): Record<string, any> {
    const defaultVariant = product.variants?.[0] || {};
    
    // Calculate inventory numbers
    const availableInventory = product.variants?.reduce((sum: number, variant: any) => 
      sum + (variant.inventory_quantity || 0), 0) || 0;
    
    return {
      title: product.title || "",
      description: product.body_html || "",
      category: product.product_type || "",
      price: defaultVariant.price ? 
        `${parseFloat(defaultVariant.price).toFixed(2)} ${product.currency || "USD"}` : "",
      compare_at_price: defaultVariant.compare_at_price ? 
        `${parseFloat(defaultVariant.compare_at_price).toFixed(2)} ${product.currency || "USD"}` : "",
      available_inventory: availableInventory,
      committed_inventory: 0, // This information isn't directly available from basic product fetch
      unavailable_inventory: 0, // This information isn't directly available from basic product fetch
      sku: defaultVariant.sku || "",
      types: product.tags ? product.tags.split(", ") : [],
      marketing_url: product.handle ? `https://${shopDomain}/products/${product.handle}` : "",
      shopify_id: product.id.toString(),
      status: product.status === "active",
      created_at: product.created_at,
      updated_at: product.updated_at
    };
  }
  
  // Map Shopify order data to our database schema
  private mapShopifyOrderToDbObject(order: any): Record<string, any> {
    // Format products list
    const productsList = (order.line_items || [])
      .map((item: any) => `${item.name} x${item.quantity}`)
      .join("\n");
    
    return {
      title: `#${order.name || order.order_number || order.id}`,
      customer_name: order.customer ? 
        `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim() || "Anonymous" : 
        "Anonymous",
      total_paid: order.total_price ? 
        `${parseFloat(order.total_price).toFixed(2)} ${order.currency || "USD"}` : "0.00",
      channel: "Shopify",
      payment_status: order.financial_status || "Unknown",
      fulfillment_status: order.fulfillment_status || "Unfulfilled",
      delivery_status: this.mapDeliveryStatus(order),
      delivery_method: order.shipping_lines?.[0]?.title || "Standard",
      products: productsList,
      shopify_id: order.id.toString(),
      created_at: order.created_at,
      updated_at: order.updated_at
    };
  }
  
  // Helper to map Shopify order status to a delivery status
  private mapDeliveryStatus(order: any): string {
    if (!order.fulfillment_status) return "Not shipped";
    if (order.fulfillment_status === "fulfilled") return "Delivered";
    if (order.fulfillments?.some((f: any) => f.status === "in_transit")) return "In transit";
    if (order.fulfillments?.some((f: any) => f.status === "pending")) return "Processing";
    return "Unknown";
  }
}
