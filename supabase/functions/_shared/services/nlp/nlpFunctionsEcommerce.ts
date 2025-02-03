import * as uuid from "jsr:@std/uuid";
import { req, res, Server } from "https://deno.land/x/faster/mod.ts";
import {
  ShopifyAPI,
  ShopifyApp,
  WebHookCall,
} from "https://deno.land/x/shopify_deno/mod.ts";
import * as config from "../../configs/index.ts";

// Exporting functions and declarations
// NOTE: must add this file when calling nlpFunctionsBase's loadFunctionGroups()
export async function initialiseFunctions(baseInstance: any) {
  console.log("initialiseFunctions called for nlpFunctionsEcommerce");
  const functionsToReturn: any = {};

  // Check if the required Shopify connection metadata is available.
  if (
    baseInstance?.parent?.organisationData?.connection_metadata?.shopify?.shop?.domain &&
    baseInstance?.parent?.organisationData?.connection_metadata?.shopify?.access_token
  ) {
    // Create the Shopify API instance once
    const shopDomain =
      baseInstance.parent.organisationData.connection_metadata.shopify.shop.domain;
    const accessToken =
      baseInstance.parent.organisationData.connection_metadata.shopify.access_token;
    const shopifyAPI = new ShopifyAPI(shopDomain, accessToken);

    /*************** searchShopifyProducts Function ***************/
    console.log("Attempting to initialise searchShopifyProducts");
    functionsToReturn.searchShopifyProducts = {
      declaration: {
        type: "function",
        function: {
          name: "searchShopifyProducts",
          description:
            "Search and filter Shopify products using various criteria including text search, price ranges, dates, and inventory quantities.",
          strict: true,
          parameters: {
            type: "object",
            properties: {
              query: {
                type: ["string", "null"],
                description: "Text search query",
              },
              status: {
                type: ["string", "null"],
                enum: ["active", "archived", "draft"],
                description: "Product status filter",
              },
              priceRange: {
                type: ["object", "null"],
                properties: {
                  min: { type: ["number", "null"] },
                  max: { type: ["number", "null"] },
                },
                required: ["min", "max"],
                additionalProperties: false,
              },
              dateCreated: {
                type: ["object", "null"],
                properties: {
                  from: {
                    type: ["string", "null"],
                    description: "ISO 8601 date string for start.",
                  },
                  to: {
                    type: ["string", "null"],
                    description: "ISO 8601 date string for end.",
                  },
                },
                required: ["from", "to"],
                additionalProperties: false,
              },
              inventoryQuantity: {
                type: ["object", "null"],
                properties: {
                  min: { type: ["number", "null"] },
                  max: { type: ["number", "null"] },
                },
                required: ["min", "max"],
                additionalProperties: false,
              },
              sort: {
                type: ["object", "null"],
                properties: {
                  field: {
                    type: ["string", "null"],
                    enum: [
                      "relevance",
                      "title",
                      "price",
                      "created_at",
                      "updated_at",
                      "inventory_total",
                      "vendor",
                    ],
                  },
                  direction: {
                    type: ["string", "null"],
                    enum: ["asc", "desc"],
                  },
                },
                required: ["field", "direction"],
                additionalProperties: false,
              },
              limit: {
                type: ["number", "null"],
                description:
                  "Maximum number of results to return. Default is 50 if not provided.",
              },
            },
            required: [
              "query",
              "status",
              "priceRange",
              "dateCreated",
              "inventoryQuantity",
              "sort",
              "limit",
            ],
            additionalProperties: false,
          },
        },
      },
      implementation: async ({
        query,
        status,
        priceRange,
        dateCreated,
        inventoryQuantity,
        sort,
        limit = 50,
      }: {
        query?: string;
        status?: "active" | "archived" | "draft";
        priceRange?: { min: number | null; max: number | null };
        dateCreated?: { from: string | null; to: string | null };
        inventoryQuantity?: { min: number | null; max: number | null };
        sort?: {
          field:
            | "relevance"
            | "title"
            | "price"
            | "created_at"
            | "updated_at"
            | "inventory_total"
            | "vendor";
          direction: "asc" | "desc";
        };
        limit?: number;
      }) => {
        try {
          console.log(
            `searchShopifyProducts called with query: ${query}, status: ${status}, priceRange: ${JSON.stringify(
              priceRange,
            )}, dateCreated: ${JSON.stringify(dateCreated)}, inventoryQuantity: ${JSON.stringify(
              inventoryQuantity,
            )}, sort: ${JSON.stringify(sort)}, limit: ${limit}`,
          );

          // Construct the GraphQL query and variables
          const graphqlQuery = `
            query searchProducts(
              $query: String,
              $first: Int!
              ${sort ? "$sortKey: ProductSortKeys!, $reverse: Boolean!" : ""}
            ) {
              products(
                first: $first,
                query: $query,
                ${sort ? "sortKey: $sortKey, reverse: $reverse" : ""}
              ) {
                edges {
                  node {
                    id
                    title
                    status
                    createdAt
                    updatedAt
                    vendor
                    totalInventory
                    priceRangeV2 {
                      minVariantPrice {
                        amount
                        currencyCode
                      }
                      maxVariantPrice {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          `;
          const variables: any = {
            first: limit,
            query: constructSearchQuery({
              textQuery: query,
              status,
              priceRange,
              dateCreated,
              inventoryQuantity,
            }),
          };
          if (sort) {
            variables.sortKey = sort.field.toUpperCase();
            variables.reverse = sort.direction === "desc";
          }

          const response = await shopifyAPI.post(
            "/admin/api/2024-01/graphql.json",
            {
              query: graphqlQuery,
              variables,
            },
          ).catch(async (error) => {
            console.error("Shopify API Error in searchShopifyProducts:", {
              query: graphqlQuery,
              variables,
              error: error.response?.errors || error.message,
              headers: error.response?.headers,
              status: error.response?.status,
            });
            throw error;
          });

          const data = response.data || response;
          console.log(`searchShopifyProducts response: ${config.stringify(data)}`);

          return {
            status: 200,
            message: "Successfully retrieved products",
            data: data.products.edges.map((edge: any) => edge.node),
          };
        } catch (error) {
          return {
            status: 500,
            message:
              "❌ Error in searchShopifyProducts: " + error.message,
          };
        }
      },
    };

    /*************** fetchShopifyOrders Function ***************/
    console.log("Attempting to initialise fetchShopifyOrders");
    functionsToReturn.fetchShopifyOrders = {
      declaration: {
        type: "function",
        function: {
          name: "fetchShopifyOrders",
          description:
            "Fetch Shopify orders with various filters such as financial status, fulfillment status, date ranges, and more.",
          strict: true,
          parameters: {
            type: "object",
            properties: {
              status: {
                type: ["string", "null"],
                enum: ["open", "closed", "cancelled"],
                description: "Order status filter",
              },
              financialStatus: {
                type: ["string", "null"],
                description: "Order financial status",
              },
              fulfillmentStatus: {
                type: ["string", "null"],
                description: "Order fulfillment status",
              },
              createdAtRange: {
                type: ["object", "null"],
                properties: {
                  from: {
                    type: ["string", "null"],
                    description: "ISO 8601 date string for start date",
                  },
                  to: {
                    type: ["string", "null"],
                    description: "ISO 8601 date string for end date",
                  },
                },
                required: ["from", "to"],
                additionalProperties: false,
              },
              limit: {
                type: ["number", "null"],
                description: "Maximum number of orders to return. Default is 50.",
              },
            },
            required: ["status", "financialStatus", "fulfillmentStatus", "createdAtRange", "limit"],
            additionalProperties: false,
          },
        },
      },
      implementation: async ({
        status,
        financialStatus,
        fulfillmentStatus,
        createdAtRange,
        limit = 50,
      }: {
        status?: "open" | "closed" | "cancelled";
        financialStatus?: string | null;
        fulfillmentStatus?: string | null;
        createdAtRange?: { from: string | null; to: string | null };
        limit?: number;
      }) => {
        try {
          console.log(
            `fetchShopifyOrders called with status: ${status}, financialStatus: ${financialStatus}, fulfillmentStatus: ${fulfillmentStatus}, createdAtRange: ${JSON.stringify(
              createdAtRange,
            )}, limit: ${limit}`,
          );

          // Build query parameters for the REST API call
          const params = new URLSearchParams();
          if (status) params.append("status", status);
          if (financialStatus) params.append("financial_status", financialStatus);
          if (fulfillmentStatus) params.append("fulfillment_status", fulfillmentStatus);
          if (createdAtRange?.from) params.append("created_at_min", createdAtRange.from);
          if (createdAtRange?.to) params.append("created_at_max", createdAtRange.to);
          params.append("limit", String(limit));

          const response = await shopifyAPI.get(
            "/admin/api/2024-01/orders.json?" + params.toString(),
          ).catch((error) => {
            console.error("Shopify API Error in fetchShopifyOrders:", {
              params,
              error: error.response?.errors || error.message,
              headers: error.response?.headers,
              status: error.response?.status,
            });
            throw error;
          });

          const data = response.data || response;
          console.log(`fetchShopifyOrders response: ${config.stringify(data)}`);

          return {
            status: 200,
            message: "Successfully fetched orders",
            data: data.orders,
          };
        } catch (error) {
          return {
            status: 500,
            message: "❌ Error in fetchShopifyOrders: " + error.message,
          };
        }
      },
    };

    /*************** createShopifyProduct Function ***************/
    console.log("Attempting to initialise createShopifyProduct");
    functionsToReturn.createShopifyProduct = {
      declaration: {
        type: "function",
        function: {
          name: "createShopifyProduct",
          description:
            "Create a new product in Shopify with multiple attributes provided via parameters.",
          strict: true,
          parameters: {
            type: "object",
            properties: {
              title: {
                type: ["string", "null"],
                description: "Title of the product",
              },
              body_html: {
                type: ["string", "null"],
                description: "HTML description of the product",
              },
              vendor: {
                type: ["string", "null"],
                description: "Vendor for the product",
              },
              product_type: {
                type: ["string", "null"],
                description: "Type of the product",
              },
              tags: {
                type: ["array", "null"],
                items: { type: "string" },
                description: "Array of product tags",
              },
            },
            required: ["title", "body_html", "vendor", "product_type", "tags"],
            additionalProperties: false,
          },
        },
      },
      implementation: async ({
        title,
        body_html,
        vendor,
        product_type,
        tags,
      }: {
        title?: string;
        body_html?: string;
        vendor?: string;
        product_type?: string;
        tags?: string[];
      }) => {
        try {
          console.log(
            `createShopifyProduct called with title: ${title}, vendor: ${vendor}`,
          );

          // Create product payload following Shopify's API specification
          const payload = {
            product: {
              title,
              body_html,
              vendor,
              product_type,
              tags,
            },
          };

          const response = await shopifyAPI.post(
            "/admin/api/2024-01/products.json",
            payload,
          ).catch((error) => {
            console.error("Shopify API Error in createShopifyProduct:", {
              payload,
              error: error.response?.errors || error.message,
              headers: error.response?.headers,
              status: error.response?.status,
            });
            throw error;
          });

          const data = response.data || response;
          console.log(`createShopifyProduct response: ${config.stringify(data)}`);

          return {
            status: 200,
            message: "Product created successfully",
            data: data.product,
          };
        } catch (error) {
          return {
            status: 500,
            message:
              "❌ Error in createShopifyProduct: " + error.message,
          };
        }
      },
    };

    /*************** updateShopifyProduct Function ***************/
    console.log("Attempting to initialise updateShopifyProduct");
    functionsToReturn.updateShopifyProduct = {
      declaration: {
        type: "function",
        function: {
          name: "updateShopifyProduct",
          description:
            "Update an existing Shopify product by providing its ID and the fields to modify.",
          strict: true,
          parameters: {
            type: "object",
            properties: {
              productId: {
                type: ["string", "null"],
                description: "ID of the product to update",
              },
              title: {
                type: ["string", "null"],
                description: "Updated title of the product",
              },
              body_html: {
                type: ["string", "null"],
                description: "Updated HTML description",
              },
              vendor: {
                type: ["string", "null"],
                description: "Updated vendor",
              },
              product_type: {
                type: ["string", "null"],
                description: "Updated product type",
              },
              tags: {
                type: ["array", "null"],
                items: { type: "string" },
                description: "Updated array of tags",
              },
            },
            required: ["productId", "title", "body_html", "vendor", "product_type", "tags"],
            additionalProperties: false,
          },
        },
      },
      implementation: async ({
        productId,
        title,
        body_html,
        vendor,
        product_type,
        tags,
      }: {
        productId?: string;
        title?: string;
        body_html?: string;
        vendor?: string;
        product_type?: string;
        tags?: string[];
      }) => {
        try {
          console.log(`updateShopifyProduct called for productId: ${productId}`);

          const payload = {
            product: {
              id: productId,
              title,
              body_html,
              vendor,
              product_type,
              tags,
            },
          };

          const response = await shopifyAPI.put(
            `/admin/api/2024-01/products/${productId}.json`,
            payload,
          ).catch((error) => {
            console.error("Shopify API Error in updateShopifyProduct:", {
              productId,
              payload,
              error: error.response?.errors || error.message,
              headers: error.response?.headers,
              status: error.response?.status,
            });
            throw error;
          });

          const data = response.data || response;
          console.log(`updateShopifyProduct response: ${config.stringify(data)}`);

          return {
            status: 200,
            message: "Product updated successfully",
            data: data.product,
          };
        } catch (error) {
          return {
            status: 500,
            message:
              "❌ Error in updateShopifyProduct: " + error.message,
          };
        }
      },
    };

    /*************** deleteShopifyProduct Function ***************/
    console.log("Attempting to initialise deleteShopifyProduct");
    functionsToReturn.deleteShopifyProduct = {
      declaration: {
        type: "function",
        function: {
          name: "deleteShopifyProduct",
          description:
            "Delete an existing Shopify product given its ID.",
          strict: true,
          parameters: {
            type: "object",
            properties: {
              productId: {
                type: ["string", "null"],
                description: "ID of the product to delete",
              },
            },
            required: ["productId"],
            additionalProperties: false,
          },
        },
      },
      implementation: async ({
        productId,
      }: {
        productId?: string;
      }) => {
        try {
          console.log(`deleteShopifyProduct called for productId: ${productId}`);

          const response = await shopifyAPI.delete(
            `/admin/api/2024-01/products/${productId}.json`,
          ).catch((error) => {
            console.error("Shopify API Error in deleteShopifyProduct:", {
              productId,
              error: error.response?.errors || error.message,
              headers: error.response?.headers,
              status: error.response?.status,
            });
            throw error;
          });

          console.log(`deleteShopifyProduct response: ${config.stringify(response)}`);

          return {
            status: 200,
            message: "Product deleted successfully",
            data: response,
          };
        } catch (error) {
          return {
            status: 500,
            message:
              "❌ Error in deleteShopifyProduct: " + error.message,
          };
        }
      },
    };

    /*************** Helper function for constructing search queries ***************/
    // This helper constructs a query string based on multiple optional parameters.
    function constructSearchQuery({
      textQuery,
      status,
      priceRange,
      dateCreated,
      inventoryQuantity,
    }: {
      textQuery?: string;
      status?: "active" | "archived" | "draft";
      priceRange?: { min: number | null; max: number | null };
      dateCreated?: { from: string | null; to: string | null };
      inventoryQuantity?: { min: number | null; max: number | null };
    }) {
      const queryParts: string[] = [];
      if (textQuery) queryParts.push(textQuery);
      if (status) queryParts.push(`status:${status}`);
      if (priceRange) {
        if (priceRange.min != null) queryParts.push(`price:>=${priceRange.min}`);
        if (priceRange.max != null) queryParts.push(`price:<=${priceRange.max}`);
      }
      if (dateCreated) {
        if (dateCreated.from) queryParts.push(`created_at:>=${dateCreated.from}`);
        if (dateCreated.to) queryParts.push(`created_at:<=${dateCreated.to}`);
      }
      if (inventoryQuantity) {
        if (inventoryQuantity.min != null) queryParts.push(`inventory_quantity:>=${inventoryQuantity.min}`);
        if (inventoryQuantity.max != null) queryParts.push(`inventory_quantity:<=${inventoryQuantity.max}`);
      }
      return queryParts.join(" ");
    }
  } else {
    console.log("Failed to initialise Shopify functions due to missing connection metadata");
  }

  return functionsToReturn;
}