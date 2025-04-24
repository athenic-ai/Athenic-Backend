import axios from 'axios';
import { StorageService } from "../storage/storageService";
import { NlpService } from "../nlp/nlpService";
import { FunctionResult } from "../../_shared/configs/index";

// Authentication helper functions
export async function verifyAuth(params: Record<string, string>): Promise<boolean> {
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
      new TextEncoder().encode(Deno.env.get("SHOPIFY_CLIENT_SECRET") || ''),
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
export async function verifyWebhook(rawBody: string, hmacHeader: string): Promise<boolean> {
  try {
    const calculatedHmac = await createHmac(
      rawBody,
      Deno.env.get("SHOPIFY_CLIENT_SECRET") || ''
    );
    
    return hmacHeader === calculatedHmac;
  } catch (error) {
    console.error('Webhook verification failed:', error);
    return false;
  }
}

// Verify Shopify HMAC signature
export async function createHmac(data: string, secret: string): Promise<string> {
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
export async function syncCustomers(shopDomain: string, accessToken: string, organisationId: string, 
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
        const processedCustomer = mapShopifyCustomerToDbObject(customer);
        const shopifyId = customer.id.toString();
        
        // Check if an object with this shopify_id already exists
        const existingObjectsQuery = await storageService.getRows("objects", {
          whereAndConditions: [
            { column: "owner_organisation_id", value: organisationId, operator: "eq" },
            { column: "related_object_type_id", value: "customer", operator: "eq" },
            { column: "metadata", jsonPath: ["shopify_id"], value: shopifyId, operator: "eq" }
          ]
        });
        
        let objectId;
        let mayAlreadyExist = false;
        
        if (existingObjectsQuery.status === 200 && existingObjectsQuery.data && existingObjectsQuery.data.length > 0) {
          // Use the existing object ID
          objectId = existingObjectsQuery.data[0].id;
          mayAlreadyExist = true;
          console.log(`Updating existing customer with Shopify ID ${shopifyId}`);
        } else {
          // Generate a new UUID for a new object
          objectId = crypto.randomUUID();
          console.log(`Creating new customer with Shopify ID ${shopifyId}`);
        }
        
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
          mayAlreadyExist: mayAlreadyExist,
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
export async function syncProducts(shopDomain: string, accessToken: string, organisationId: string,
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
        const processedProduct = mapShopifyProductToDbObject(product, shopDomain);
        const shopifyId = product.id.toString();
        
        // Check if an object with this shopify_id already exists
        const existingObjectsQuery = await storageService.getRows("objects", {
          whereAndConditions: [
            { column: "owner_organisation_id", value: organisationId, operator: "eq" },
            { column: "related_object_type_id", value: "product", operator: "eq" },
            { column: "metadata", jsonPath: ["shopify_id"], value: shopifyId, operator: "eq" }
          ]
        });
        
        let objectId;
        let mayAlreadyExist = false;
        
        if (existingObjectsQuery.status === 200 && existingObjectsQuery.data && existingObjectsQuery.data.length > 0) {
          // Use the existing object ID
          objectId = existingObjectsQuery.data[0].id;
          mayAlreadyExist = true;
          console.log(`Updating existing product with Shopify ID ${shopifyId}`);
        } else {
          // Generate a new UUID for a new object
          objectId = crypto.randomUUID();
          console.log(`Creating new product with Shopify ID ${shopifyId}`);
        }
        
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
          mayAlreadyExist: mayAlreadyExist,
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
export async function syncOrders(shopDomain: string, accessToken: string, organisationId: string,
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
        const processedOrder = mapShopifyOrderToDbObject(order);
        const shopifyId = order.id.toString();
        
        // Check if an object with this shopify_id already exists
        const existingObjectsQuery = await storageService.getRows("objects", {
          whereAndConditions: [
            { column: "owner_organisation_id", value: organisationId, operator: "eq" },
            { column: "related_object_type_id", value: "order", operator: "eq" },
            { column: "metadata", jsonPath: ["shopify_id"], value: shopifyId, operator: "eq" }
          ]
        });
        
        let objectId;
        let mayAlreadyExist = false;
        
        if (existingObjectsQuery.status === 200 && existingObjectsQuery.data && existingObjectsQuery.data.length > 0) {
          // Use the existing object ID
          objectId = existingObjectsQuery.data[0].id;
          mayAlreadyExist = true;
          console.log(`Updating existing order with Shopify ID ${shopifyId}`);
        } else {
          // Generate a new UUID for a new object
          objectId = crypto.randomUUID();
          console.log(`Creating new order with Shopify ID ${shopifyId}`);
        }
        
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
          mayAlreadyExist: mayAlreadyExist,
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
export function mapShopifyCustomerToDbObject(customer: any): Record<string, any> {
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
export function mapShopifyProductToDbObject(product: any, shopDomain: string): Record<string, any> {
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
export function mapShopifyOrderToDbObject(order: any): Record<string, any> {
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
    delivery_status: mapDeliveryStatus(order),
    delivery_method: order.shipping_lines?.[0]?.title || "Standard",
    products: productsList,
    shopify_id: order.id.toString(),
    created_at: order.created_at,
    updated_at: order.updated_at
  };
}

// Helper to map Shopify order status to a delivery status
export function mapDeliveryStatus(order: any): string {
  if (!order.fulfillment_status) return "Not shipped";
  if (order.fulfillment_status === "fulfilled") return "Delivered";
  if (order.fulfillments?.some((f: any) => f.status === "in_transit")) return "In transit";
  if (order.fulfillments?.some((f: any) => f.status === "pending")) return "Processing";
  return "Unknown";
} 