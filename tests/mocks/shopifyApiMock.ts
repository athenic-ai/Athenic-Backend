// Mock for Shopify API
export class ShopifyAPI {
  constructor(public domain: string, public accessToken: string) {}

  get(endpoint: string) {
    // Mock responses based on endpoint
    if (endpoint.includes('/products.json')) {
      return Promise.resolve({
        data: {
          products: [
            {
              id: 'test-product-id',
              title: 'Test Product',
              variants: [{ id: 'test-variant-id', price: '19.99' }]
            }
          ]
        }
      });
    } else if (endpoint.includes('/orders.json')) {
      return Promise.resolve({
        data: {
          orders: [
            {
              id: 'test-order-id',
              name: '#1001',
              financial_status: 'paid'
            }
          ]
        }
      });
    }
    return Promise.resolve({ data: {} });
  }

  post(endpoint: string, data: any) {
    // Mock responses based on endpoint
    if (endpoint.includes('/products.json')) {
      return Promise.resolve({
        data: {
          product: {
            id: 'test-product-id',
            ...data.product
          }
        }
      });
    } else if (endpoint.includes('/variants.json')) {
      return Promise.resolve({
        data: {
          variant: {
            id: 'test-variant-id',
            ...data.variant
          }
        }
      });
    }
    return Promise.resolve({ data: {} });
  }

  put(endpoint: string, data: any) {
    // Mock responses based on endpoint
    if (endpoint.includes('/products/')) {
      return Promise.resolve({
        data: {
          product: {
            id: data.product.id || 'test-product-id',
            ...data.product
          }
        }
      });
    } else if (endpoint.includes('/variants/')) {
      return Promise.resolve({
        data: {
          variant: {
            id: data.variant.id || 'test-variant-id',
            ...data.variant
          }
        }
      });
    }
    return Promise.resolve({ data: {} });
  }

  delete(endpoint: string) {
    return Promise.resolve({ status: 200 });
  }
}

export class ShopifyApp {}
export class WebHookCall {} 