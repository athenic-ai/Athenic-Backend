// NOTE: This function has JWT checks disabled in settings (as Shopify won't provide a bearer token)
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { EcommercePluginShopify } from "../../_shared/services/ecommerce/ecommercePluginShopify.ts";
import { StorageService } from "../../_shared/services/storage/storageService.ts";
import { NlpService } from "../../_shared/services/nlp/nlpService.ts";
import * as config from "../../_shared/configs/index.ts";

config.initSentry(); // Initialize Sentry

// Define interface for Shopify webhook payload
interface ShopifyWebhookPayload {
  id: string;
  admin_graphql_api_id?: string;
  domain?: string;
  topic?: string;
  [key: string]: any; // To allow for various other properties based on the webhook type
}

async function handleRequest(req: Request): Promise<Response> {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Extract Shopify headers
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
    const shopDomain = req.headers.get('x-shopify-shop-domain');
    const topic = req.headers.get('x-shopify-topic');

    if (!hmacHeader || !shopDomain || !topic) {
      console.error('Missing required Shopify headers');
      return new Response('Unauthorized', { status: 401 });
    }

    // Get the raw body for HMAC verification
    const rawBody = await req.text();
    let payload: ShopifyWebhookPayload;
    
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      console.error('Invalid JSON payload:', error);
      return new Response('Bad Request - Invalid JSON', { status: 400 });
    }

    // Verify the webhook signature
    const shopifyPlugin = new EcommercePluginShopify();
    const isValid = await shopifyPlugin.verifyWebhook(rawBody, hmacHeader);
    
    if (!isValid) {
      console.error('HMAC verification failed');
      return new Response('Unauthorized - Invalid signature', { status: 401 });
    }

    // Get organization ID from the shop domain
    const storageService = new StorageService();
    const connectionMapping = await storageService.getRow({
      table: 'connection_organisation_mapping',
      keys: { connection: 'shopify', connection_id: shopDomain }
    });

    if (connectionMapping.status !== 200 || !connectionMapping.data) {
      console.error(`Shop not found: ${shopDomain}`);
      return new Response('Unauthorized - Shop not registered', { status: 401 });
    }

    const organisationId = connectionMapping.data.organisation_id;

    // Initialize the NLP service for operations that need embeddings
    const nlpService = new NlpService();
    await nlpService.initialiseClientCore();

    // Process the webhook based on topic
    console.log(`Processing webhook: ${topic} for shop: ${shopDomain}`);
    
    switch (topic) {
      // GDPR Compliance webhooks
      case 'customers/data_request':
        await handleCustomersDataRequest(organisationId, payload, storageService, nlpService);
        break;
      case 'customers/redact':
        await handleCustomersRedact(organisationId, payload, storageService, nlpService);
        break;
      case 'shop/redact':
        await handleShopRedact(organisationId, payload, storageService, nlpService);
        break;
        
      // Store events
      case 'orders/create':
        await handleOrderCreate(organisationId, payload, storageService, nlpService);
        break;
      case 'orders/updated':
        await handleOrderUpdate(organisationId, payload, storageService, nlpService);
        break;
      case 'products/create':
        await handleProductCreate(organisationId, payload, storageService, nlpService);
        break;
      case 'products/update':
        await handleProductUpdate(organisationId, payload, storageService, nlpService);
        break;
      case 'customers/create':
        await handleCustomerCreate(organisationId, payload, storageService, nlpService);
        break;
      case 'customers/update':
        await handleCustomerUpdate(organisationId, payload, storageService, nlpService);
        break;
        
      // App events
      case 'app/uninstalled':
        await handleAppUninstalled(organisationId, shopDomain, storageService, nlpService);
        break;
        
      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }
    
    // Always return 200 to acknowledge receipt
    return new Response('Webhook processed', { status: 200 });
  } catch (error) {
    console.error('Error processing webhook:', error);
    config.Sentry.captureException(error);
    
    // Still return 200 to prevent Shopify from retrying
    return new Response('Webhook acknowledged with error', { status: 200 });
  }
}

// GDPR Compliance webhook handlers
async function handleCustomersDataRequest(
  organisationId: string, 
  payload: ShopifyWebhookPayload,
  storageService: StorageService,
  nlpService: NlpService
) {
  console.log(`Processing customers/data_request for organisation ${organisationId}`);
  
  // TODO: Implement data request handling
  // This should prepare all customer data for export
  
  // Log the request for compliance purposes
  const requestId = crypto.randomUUID();
  await storageService.updateRow({
    table: 'gdpr_requests',
    keys: { id: requestId },
    rowData: {
      organisation_id: organisationId,
      request_type: 'data_request',
      user_id: payload.customer?.id || payload.id,
      shop_domain: payload.shop_domain || payload.domain,
      request_details: payload,
      status: 'received',
      created_at: new Date().toISOString()
    },
    nlpService: nlpService,
    mayAlreadyExist: false
  });
}

async function handleCustomersRedact(
  organisationId: string, 
  payload: ShopifyWebhookPayload,
  storageService: StorageService,
  nlpService: NlpService
) {
  console.log(`Processing customers/redact for organisation ${organisationId}`);
  
  // TODO: Implement customer data redaction
  // This should delete or anonymize all customer data
  
  // Log the request for compliance purposes
  const requestId = crypto.randomUUID();
  await storageService.updateRow({
    table: 'gdpr_requests',
    keys: { id: requestId },
    rowData: {
      organisation_id: organisationId,
      request_type: 'customer_redact',
      user_id: payload.customer?.id || payload.id,
      shop_domain: payload.shop_domain || payload.domain,
      request_details: payload,
      status: 'received',
      created_at: new Date().toISOString()
    },
    nlpService: nlpService,
    mayAlreadyExist: false
  });
}

async function handleShopRedact(
  organisationId: string, 
  payload: ShopifyWebhookPayload,
  storageService: StorageService,
  nlpService: NlpService
) {
  console.log(`Processing shop/redact for organisation ${organisationId}`);
  
  // TODO: Implement shop data redaction
  // This should delete all store data except what's needed for legal purposes
  
  // Log the request for compliance purposes
  const requestId = crypto.randomUUID();
  await storageService.updateRow({
    table: 'gdpr_requests',
    keys: { id: requestId },
    rowData: {
      organisation_id: organisationId,
      request_type: 'shop_redact',
      shop_domain: payload.shop_domain || payload.domain,
      request_details: payload,
      status: 'received',
      created_at: new Date().toISOString()
    },
    nlpService: nlpService,
    mayAlreadyExist: false
  });
}

// Business logic webhook handlers
async function handleOrderCreate(
  organisationId: string, 
  payload: ShopifyWebhookPayload,
  storageService: StorageService,
  nlpService: NlpService
) {
  console.log(`Processing orders/create for organisation ${organisationId}`);
  
  // TODO: Implement order creation handling
  // Store relevant order data in your database
}

async function handleOrderUpdate(
  organisationId: string, 
  payload: ShopifyWebhookPayload,
  storageService: StorageService,
  nlpService: NlpService
) {
  console.log(`Processing orders/updated for organisation ${organisationId}`);
  
  // TODO: Implement order update handling
  // Update existing order data in your database
}

async function handleProductCreate(
  organisationId: string, 
  payload: ShopifyWebhookPayload,
  storageService: StorageService,
  nlpService: NlpService
) {
  console.log(`Processing products/create for organisation ${organisationId}`);
  
  // TODO: Implement product creation handling
  // Store relevant product data in your database
}

async function handleProductUpdate(
  organisationId: string, 
  payload: ShopifyWebhookPayload,
  storageService: StorageService,
  nlpService: NlpService
) {
  console.log(`Processing products/update for organisation ${organisationId}`);
  
  // TODO: Implement product update handling
  // Update existing product data in your database
}

async function handleCustomerCreate(
  organisationId: string, 
  payload: ShopifyWebhookPayload,
  storageService: StorageService,
  nlpService: NlpService
) {
  console.log(`Processing customers/create for organisation ${organisationId}`);
  
  // TODO: Implement customer creation handling
  // Store relevant customer data in your database
}

async function handleCustomerUpdate(
  organisationId: string, 
  payload: ShopifyWebhookPayload,
  storageService: StorageService,
  nlpService: NlpService
) {
  console.log(`Processing customers/update for organisation ${organisationId}`);
  
  // TODO: Implement customer update handling
  // Update existing customer data in your database
}

async function handleAppUninstalled(
  organisationId: string, 
  shopDomain: string,
  storageService: StorageService,
  nlpService: NlpService
) {
  console.log(`Processing app/uninstalled for organisation ${organisationId} and shop ${shopDomain}`);
  
  // Get organisation details
  const organisationResult = await storageService.getRow({
    table: 'organisations',
    keys: { id: organisationId }
  });
  
  if (organisationResult.status === 200 && organisationResult.data) {
    const connectionMetadata = organisationResult.data.connection_metadata || {};
    
    if (connectionMetadata.shopify) {
      // Mark the connection as deactivated instead of deleting
      connectionMetadata.shopify.active = false;
      connectionMetadata.shopify.uninstalled_at = new Date().toISOString();
      
      await storageService.updateRow({
        table: 'organisations',
        keys: { id: organisationId },
        rowData: { connection_metadata: connectionMetadata },
        nlpService: nlpService,
        mayAlreadyExist: true
      });
    }
  }
  
  // Optionally, also update the connection mapping
  await storageService.updateRow({
    table: 'connection_organisation_mapping',
    keys: { connection: 'shopify', connection_id: shopDomain },
    rowData: { active: false, updated_at: new Date().toISOString() },
    nlpService: nlpService,
    mayAlreadyExist: true
  });
}

// Start the webhook handler
serve(handleRequest); 