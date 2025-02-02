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
  const functionsToReturn = {};

  if (baseInstance?.parent?.organisationData?.connection_metadata?.shopify?.shop?.domain && 
      baseInstance?.parent?.organisationData?.connection_metadata?.shopify?.access_token) {
    const shopifyAPI = new ShopifyAPI(
      baseInstance.parent.organisationData.connection_metadata.shopify.shop.domain,
      baseInstance.parent.organisationData.connection_metadata.shopify.access_token
    );

    console.log("Attempting to initialise searchShopifyProducts");
    functionsToReturn.searchShopifyProducts = {
      declaration: {
        type: "function",
        function: {
          name: "searchShopifyProducts",
          description: "Search and filter Shopify products using various criteria including text search, price ranges, dates, and more",
          strict: true, // As this is here, all properties must be required & additionalProperties set to false
          parameters: {
            type: "object",
            properties: {
              query: {
                type: ["string", "null"],
                description: "Text search query",
              },
              status: {
                type: ["string", "null"],
                enum: ['active', 'archived', 'draft'],
                description: "Product status filter",
              },
              priceRange: {
                type: ["object", "null"],
                properties: {
                  min: { type: ["number", "null"] },
                  max: { type: ["number", "null"] }
                },
                required: ["min", "max"],
                additionalProperties: false
              },
              dateCreated: {
                type: ["object", "null"],
                properties: {
                  from: { type: ["string", "null"], description: "Use ISO 8601 to format this date." },
                  to: { type: ["string", "null"], description: "Use ISO 8601 to format this date." }
                },
                required: ["from", "to"],
                additionalProperties: false
              },
              inventoryQuantity: {
                type: ["object", "null"],
                properties: {
                  min: { type: ["number", "null"] },
                  max: { type: ["number", "null"] }
                },
                required: ["min", "max"],
                additionalProperties: false
              },
              sort: {
                type: ["object", "null"],
                properties: {
                  field: {
                    type: ["string", "null"],
                    enum: ['title', 'price', 'created_at', 'updated_at', 'inventory_quantity', 'vendor']
                  },
                  direction: {
                    type: ["string", "null"],
                    enum: ['asc', 'desc']
                  }
                },
                required: ["field", "direction"],
                additionalProperties: false
              },
              limit: {
                type: ["number", "null"],
                description: "Maximum number of results to return. Default should be 50.",
              }
            },
            required: ["query", "status", "priceRange", "dateCreated", "inventoryQuantity", "sort", "limit"],
            additionalProperties: false
          }
        }
      },
      implementation: async ({
        query,
        status,
        priceRange,
        dateCreated,
        inventoryQuantity,
        sort,
        limit = 50
      }: {
        query?: string;
        status?: ProductStatus;
        priceRange?: PriceRange;
        dateCreated?: DateRange;
        inventoryQuantity?: PriceRange;
        sort?: ProductSort;
        limit?: number;
      }) => {
        try {
          console.log(`searchShopifyProducts called with query: ${query}, status: ${status}, priceRange: ${JSON.stringify(priceRange)}, dateCreated: ${JSON.stringify(dateCreated)}, inventoryQuantity: ${JSON.stringify(inventoryQuantity)}, sort: ${JSON.stringify(sort)}, limit: ${limit}`);
          
          const graphqlQuery = `
            query searchProducts(
              $query: String
              $first: Int!
              ${sort ? '$sortKey: ProductSortKeys!, $reverse: Boolean!' : ''}
            ) {
              products(
                first: $first
                query: $query
                ${sort ? 'sortKey: $sortKey, reverse: $reverse' : ''}
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
              inventoryQuantity
            })
          };

          if (sort) {
            variables.sortKey = sort.field.toUpperCase();
            variables.reverse = sort.direction === 'desc';
          }

          // Updated to use post method instead of graphQL
          const response = await shopifyAPI.post(
            "/admin/api/2024-01/graphql.json",
            {
              query: graphqlQuery,
              variables
            }
          ).catch(async (error) => {
            console.error("Full Shopify API Error:", {
              query: graphqlQuery,
              variables,
              error: error.response?.errors || error.message,
              headers: error.response?.headers,
              status: error.response?.status
            });
            throw error;
          });

          // Extract data from the modified response structure
          const data = response.data || response;
          console.log(`response: ${config.stringify(data)}`);

          return {
            status: 200,
            message: "Successfully retrieved products",
            data: data.products.edges.map((edge: any) => edge.node)
          };

        } catch (error) {
          return {
            status: 500,
            message: "❌ Error in searchShopifyProducts: " + error.message
          };
        }
      }
    };

    type SortDirection = 'asc' | 'desc';
    type ProductSort = {
      field: 'title' | 'price' | 'created_at' | 'updated_at' | 'inventory_quantity' | 'vendor';
      direction: SortDirection;
    };
    type DateRange = {
      from: string; // ISO date string
      to: string; // ISO date string
    };
    type PriceRange = {
      min?: number;
      max?: number;
    };
    type ProductStatus = 'active' | 'archived' | 'draft';

    function constructSearchQuery({
      textQuery,
      status,
      priceRange,
      dateCreated,
      inventoryQuantity
    }: {
      textQuery?: string;
      status?: ProductStatus;
      priceRange?: PriceRange;
      dateCreated?: DateRange;
      inventoryQuantity?: PriceRange;
    }) {
      const queryParts: string[] = [];
      if (textQuery) queryParts.push(textQuery);
      if (status) queryParts.push(`status:${status}`);
      if (priceRange) {
        if (priceRange.min) queryParts.push(`price:>=${priceRange.min}`);
        if (priceRange.max) queryParts.push(`price:<=${priceRange.max}`);
      }
      if (dateCreated) {
        if (dateCreated.from) queryParts.push(`created_at:>=${dateCreated.from}`);
        if (dateCreated.to) queryParts.push(`created_at:<=${dateCreated.to}`);
      }
      if (inventoryQuantity) {
        if (inventoryQuantity.min) queryParts.push(`inventory_quantity:>=${inventoryQuantity.min}`);
        if (inventoryQuantity.max) queryParts.push(`inventory_quantity:<=${inventoryQuantity.max}`);
      }
      return queryParts.join(' ');
    }
  } else {
    console.log("Failed to add searchShopifyProducts function as missing variable(s)");
  }

  return functionsToReturn;
}