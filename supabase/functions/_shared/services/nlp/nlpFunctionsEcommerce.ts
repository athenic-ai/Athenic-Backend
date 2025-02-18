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
            "Create a new product in Shopify with multiple attributes provided via parameters. Note: to variants should be created after this product is created via the separate variant creation function.",
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
            "Update an existing product by ID, including fields like title, description, vendor, tags. Excludes handling variant data, that other functions handle instead.",
          strict: true,
          parameters: {
            type: "object",
            properties: {
              productId: {
                type: ["string", "null"],
                description: "ID of the product to update"
              },
              title: {
                type: ["string", "null"],
                description: "Updated title of the product"
              },
              body_html: {
                type: ["string", "null"],
                description: "Updated product description in HTML"
              },
              vendor: {
                type: ["string", "null"],
                description: "Updated vendor information"
              },
              product_type: {
                type: ["string", "null"],
                description: "Updated product type"
              },
              tags: {
                type: ["array", "null"],
                items: { type: "string" },
                description: "Updated list of tags"
              },
            },
            required: ["productId", "title", "body_html", "vendor", "product_type", "tags"],
            additionalProperties: false
          }
        }
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
    
          const payload: any = {
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
            message: "❌ Error in updateShopifyProduct: " + error.message,
          };
        }
      },
    };

    // Add these functions to your existing code alongside the other Shopify functions

    /*************** createShopifyVariant Function ***************/
    functionsToReturn.createShopifyVariant = {
      declaration: {
        type: "function",
        function: {
          name: "createShopifyVariant",
          description: "Create a new variant for an existing Shopify product with complete metadata",
          strict: true,
          parameters: {
            type: "object",
            properties: {
              productId: {
                type: ["string", "null"],
                description: "ID of the product to add the variant to"
              },
              option: {
                type: ["object", "null"],
                description: "Variant option details",
                properties: {
                  name: { type: ["string", "null"] },
                  value: { type: ["string", "null"] }
                },
                required: ["name", "value"],
                additionalProperties: false
              },
              price: {
                type: ["number", "null"],
                description: "Selling price of the variant"
              },
              compare_at_price: {
                type: ["number", "null"],
                description: "Original price for comparison"
              },
              sku: {
                type: ["string", "null"],
                description: "Stock Keeping Unit"
              },
              barcode: {
                type: ["string", "null"],
                description: "Barcode (ISBN, UPC, GTIN, etc.)"
              },
              weight: {
                type: ["number", "null"],
                description: "Weight in grams"
              },
              weight_unit: {
                type: ["string", "null"],
                enum: ["g", "kg", "oz", "lb"],
                description: "Weight unit"
              },
              requires_shipping: {
                type: ["boolean", "null"],
                description: "Whether this is a physical product requiring shipping"
              },
              inventory_quantity: {
                type: ["number", "null"],
                description: "Initial inventory quantity"
              },
              inventory_management: {
                type: ["string", "null"],
                enum: ["shopify", null],
                description: "Inventory management system"
              },
              inventory_policy: {
                type: ["string", "null"],
                enum: ["deny", "continue"],
                description: "Whether to allow sales when out of stock"
              },
              cost: {
                type: ["number", "null"],
                description: "Cost per item"
              }
            },
            required: [
              "productId",
              "option",
              "price",
              "compare_at_price",
              "sku",
              "barcode",
              "weight",
              "weight_unit",
              "requires_shipping",
              "inventory_quantity",
              "inventory_management",
              "inventory_policy",
              "cost"
            ],
            additionalProperties: false
          }
        }
      },
      implementation: async ({
        productId,
        option,
        price,
        compare_at_price,
        sku,
        barcode,
        weight,
        weight_unit,
        requires_shipping,
        inventory_quantity,
        inventory_management,
        inventory_policy,
        cost
      }) => {
        try {
          console.log(`createShopifyVariant called for productId: ${productId}`);

          // Construct the variant payload
          const variantPayload = {
            variant: {
              option1: option?.value,  // The option value (e.g., "Small" for a "Size" option)
              price: price?.toString(),
              compare_at_price: compare_at_price?.toString(),
              sku,
              barcode,
              weight,
              weight_unit,
              requires_shipping,
              inventory_quantity,
              inventory_management,
              inventory_policy,
              cost: cost?.toString()
            }
          };

          // Create the variant using the Shopify API
          const response = await shopifyAPI.post(
            `/admin/api/2024-01/products/${productId}/variants.json`,
            variantPayload
          ).catch((error) => {
            console.error("Shopify API Error in createShopifyVariant:", {
              productId,
              payload: variantPayload,
              error: error.response?.errors || error.message,
              headers: error.response?.headers,
              status: error.response?.status,
            });
            throw error;
          });

          const data = response.data || response;
          console.log(`createShopifyVariant response: ${config.stringify(data)}`);

          return {
            status: 200,
            message: "Variant created successfully",
            data: data.variant
          };
        } catch (error) {
          return {
            status: 500,
            message: "❌ Error in createShopifyVariant: " + error.message
          };
        }
      }
    };

    /*************** updateShopifyVariant Function ***************/
    functionsToReturn.updateShopifyVariant = {
      declaration: {
        type: "function",
        function: {
          name: "updateShopifyVariant",
          description: "Update an existing variant's details including pricing, inventory, and metadata",
          strict: true,
          parameters: {
            type: "object",
            properties: {
              productId: {
                type: ["string", "null"],
                description: "ID of the product containing the variant"
              },
              variantId: {
                type: ["string", "null"],
                description: "ID of the variant to update"
              },
              updates: {
                type: ["object", "null"],
                properties: {
                  option: {
                    type: ["object", "null"],
                    properties: {
                      name: { type: ["string", "null"] },
                      value: { type: ["string", "null"] }
                    },
                    required: ["name", "value"],
                    additionalProperties: false
                  },
                  price: { type: ["number", "null"] },
                  compare_at_price: { type: ["number", "null"] },
                  sku: { type: ["string", "null"] },
                  barcode: { type: ["string", "null"] },
                  weight: { type: ["number", "null"] },
                  weight_unit: {
                    type: ["string", "null"],
                    enum: ["g", "kg", "oz", "lb"]
                  },
                  requires_shipping: { type: ["boolean", "null"] },
                  inventory_quantity: { type: ["number", "null"] },
                  inventory_management: {
                    type: ["string", "null"],
                    enum: ["shopify", null]
                  },
                  inventory_policy: {
                    type: ["string", "null"],
                    enum: ["deny", "continue"]
                  },
                  cost: { type: ["number", "null"] }
                },
                required: [
                  "option",
                  "price",
                  "compare_at_price",
                  "sku",
                  "barcode",
                  "weight",
                  "weight_unit",
                  "requires_shipping",
                  "inventory_quantity",
                  "inventory_management",
                  "inventory_policy",
                  "cost"
                ],
                additionalProperties: false
              }
            },
            required: ["productId", "variantId", "updates"],
            additionalProperties: false
          }
        }
      },
      implementation: async ({ productId, variantId, updates }) => {
        try {
          console.log(`updateShopifyVariant called for variantId: ${variantId}`);

          // Construct the update payload, converting numeric values to strings as required by Shopify
          const updatePayload = {
            variant: {
              id: variantId,
              ...(updates?.option && { option1: updates.option.value }),
              ...(updates?.price !== undefined && { price: updates.price.toString() }),
              ...(updates?.compare_at_price !== undefined && { 
                compare_at_price: updates.compare_at_price.toString() 
              }),
              ...(updates?.sku !== undefined && { sku: updates.sku }),
              ...(updates?.barcode !== undefined && { barcode: updates.barcode }),
              ...(updates?.weight !== undefined && { weight: updates.weight }),
              ...(updates?.weight_unit !== undefined && { weight_unit: updates.weight_unit }),
              ...(updates?.requires_shipping !== undefined && { 
                requires_shipping: updates.requires_shipping 
              }),
              ...(updates?.inventory_quantity !== undefined && { 
                inventory_quantity: updates.inventory_quantity 
              }),
              ...(updates?.inventory_management !== undefined && { 
                inventory_management: updates.inventory_management 
              }),
              ...(updates?.inventory_policy !== undefined && { 
                inventory_policy: updates.inventory_policy 
              }),
              ...(updates?.cost !== undefined && { cost: updates.cost.toString() })
            }
          };

          // Update the variant using the Shopify API
          const response = await shopifyAPI.put(
            `/admin/api/2024-01/variants/${variantId}.json`,
            updatePayload
          ).catch((error) => {
            console.error("Shopify API Error in updateShopifyVariant:", {
              variantId,
              payload: updatePayload,
              error: error.response?.errors || error.message,
              headers: error.response?.headers,
              status: error.response?.status,
            });
            throw error;
          });

          const data = response.data || response;
          console.log(`updateShopifyVariant response: ${config.stringify(data)}`);

          return {
            status: 200,
            message: "Variant updated successfully",
            data: data.variant
          };
        } catch (error) {
          return {
            status: 500,
            message: "❌ Error in updateShopifyVariant: " + error.message
          };
        }
      }
    };

    /*************** deleteShopifyVariant Function ***************/
    functionsToReturn.deleteShopifyVariant = {
      declaration: {
        type: "function",
        function: {
          name: "deleteShopifyVariant",
          description: "Delete a specific variant from a Shopify product",
          strict: true,
          parameters: {
            type: "object",
            properties: {
              productId: {
                type: ["string", "null"],
                description: "ID of the product containing the variant"
              },
              variantId: {
                type: ["string", "null"],
                description: "ID of the variant to delete"
              }
            },
            required: ["productId", "variantId"],
            additionalProperties: false
          }
        }
      },
      implementation: async ({ productId, variantId }) => {
        try {
          console.log(`deleteShopifyVariant called for variantId: ${variantId}`);

          // Delete the variant using the Shopify API
          const response = await shopifyAPI.delete(
            `/admin/api/2024-01/products/${productId}/variants/${variantId}.json`
          ).catch((error) => {
            console.error("Shopify API Error in deleteShopifyVariant:", {
              productId,
              variantId,
              error: error.response?.errors || error.message,
              headers: error.response?.headers,
              status: error.response?.status,
            });
            throw error;
          });

          return {
            status: 200,
            message: "Variant deleted successfully"
          };
        } catch (error) {
          return {
            status: 500,
            message: "❌ Error in deleteShopifyVariant: " + error.message
          };
        }
      }
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






    // Temporarily disabled as dont want it calling it accidentally without proper checks
    /*************** deleteShopifyProduct Function ***************/
    // console.log("Attempting to initialise deleteShopifyProduct");
    // functionsToReturn.deleteShopifyProduct = {
    //   declaration: {
    //     type: "function",
    //     function: {
    //       name: "deleteShopifyProduct",
    //       description:
    //         "Delete an existing Shopify product given its ID.",
    //       strict: true,
    //       parameters: {
    //         type: "object",
    //         properties: {
    //           productId: {
    //             type: ["string", "null"],
    //             description: "ID of the product to delete",
    //           },
    //         },
    //         required: ["productId"],
    //         additionalProperties: false,
    //       },
    //     },
    //   },
    //   implementation: async ({
    //     productId,
    //   }: {
    //     productId?: string;
    //   }) => {
    //     try {
    //       console.log(`deleteShopifyProduct called for productId: ${productId}`);

    //       const response = await shopifyAPI.delete(
    //         `/admin/api/2024-01/products/${productId}.json`,
    //       ).catch((error) => {
    //         console.error("Shopify API Error in deleteShopifyProduct:", {
    //           productId,
    //           error: error.response?.errors || error.message,
    //           headers: error.response?.headers,
    //           status: error.response?.status,
    //         });
    //         throw error;
    //       });

    //       console.log(`deleteShopifyProduct response: ${config.stringify(response)}`);

    //       return {
    //         status: 200,
    //         message: "Product deleted successfully",
    //         data: response,
    //       };
    //     } catch (error) {
    //       return {
    //         status: 500,
    //         message:
    //           "❌ Error in deleteShopifyProduct: " + error.message,
    //       };
    //     }
    //   },
    // };