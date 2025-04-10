import { StorageService } from '../../../../supabase/functions/_shared/services/storage/storageService';
import { NlpService } from '../../../../supabase/functions/_shared/services/nlp/nlpService';
import SupabaseMock from '../../../mocks/supabaseMock';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the createClient import from Supabase
jest.mock('jsr:@supabase/supabase-js@2', () => ({
  createClient: jest.fn((url: string, key: string, options: any) => {
    return supabaseMock.createClient();
  })
}));

// Mock NlpService
jest.mock('../../../../supabase/functions/_shared/services/nlp/nlpService');

// Create and initialize supabase mock
const supabaseMock = new SupabaseMock();

describe('StorageService', () => {
  let mockNlpService: jest.Mocked<NlpService>;

  // Reset mock data before each test
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock NLP service
    mockNlpService = new NlpService() as jest.Mocked<NlpService>;
    mockNlpService.generateTextEmbedding = jest.fn().mockResolvedValue({
      status: 200,
      data: [0.1, 0.2, 0.3, 0.4, 0.5],
      message: "Embedding generated successfully"
    });

    // Mock organization data
    const orgData = [
      { 
        id: 'test-org-1', 
        name: 'Test Organization 1',
        enabled: true,
        connection_metadata: { shopify: { shop: { id: 12345 } } }
      }
    ];
    
    // Mock object types
    const objectTypes = [
      { 
        id: 'product', 
        name: 'Product',
        description: 'A product in the store'
      },
      { 
        id: 'order', 
        name: 'Order',
        description: 'An order from a customer'
      }
    ];
    
    // Set mock data for tables
    supabaseMock
      .setMockData('organisations', orgData)
      .setMockData('object_types', objectTypes);
  });

  describe('getRow', () => {
    it('should get a single row successfully', async () => {
      const storageService = new StorageService();
      const result = await storageService.getRow({
        table: 'organisations',
        keys: { id: 'test-org-1' }
      });
      
      expect(result.status).toBe(200);
      expect(result.data).toBeDefined();
      expect(result.data.id).toBe('test-org-1');
      expect(result.data.name).toBe('Test Organization 1');
    });

    it('should return error when table is not provided', async () => {
      const storageService = new StorageService();
      const result = await storageService.getRow({
        table: '',
        keys: { id: 'test-org-1' }
      });
      
      expect(result.status).toBe(500);
      expect(result.message).toContain('Error in getRow');
    });

    it('should return error when keys are not provided', async () => {
      const storageService = new StorageService();
      const result = await storageService.getRow({
        table: 'organisations',
        keys: {}
      });
      
      expect(result.status).toBe(500);
      expect(result.message).toContain('Error in getRow');
    });
  });

  describe('getRows', () => {
    it('should get multiple rows with AND conditions', async () => {
      const storageService = new StorageService();
      const result = await storageService.getRows('object_types', {
        whereAndConditions: [
          { column: 'id', operator: 'eq', value: 'product' }
        ]
      });
      
      expect(result.status).toBe(200);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('product');
    });

    it('should handle OR conditions correctly', async () => {
      const storageService = new StorageService();
      const result = await storageService.getRows('object_types', {
        whereOrConditions: [
          { column: 'id', operator: 'eq', value: 'product' },
          { column: 'id', operator: 'eq', value: 'order' }
        ]
      });
      
      expect(result.status).toBe(200);
      expect(result.data).toHaveLength(2);
      expect(result.data.map((item: any) => item.id)).toContain('product');
      expect(result.data.map((item: any) => item.id)).toContain('order');
    });

    it('should respect limit parameter', async () => {
      const storageService = new StorageService();
      const result = await storageService.getRows('object_types', {
        limitCount: 1
      });
      
      expect(result.status).toBe(200);
      expect(result.data).toHaveLength(1);
    });

    it('should handle orderBy conditions', async () => {
      const storageService = new StorageService();
      const result = await storageService.getRows('object_types', {
        orderByConditions: [
          { column: 'name', ascending: true }
        ]
      });
      
      expect(result.status).toBe(200);
      // Verify correct sorting (Order before Product alphabetically)
      expect(result.data[0].id).toBe('order');
      expect(result.data[1].id).toBe('product');
    });

    it('should exclude embeddings when requested', async () => {
      // Add data with embeddings
      supabaseMock.setMockData('objects', [
        { 
          id: 'obj-1', 
          embedding: [0.1, 0.2, 0.3],
          metadata: { title: 'Test Object' }
        }
      ]);

      const storageService = new StorageService();
      const result = await storageService.getRows('objects', {
        removeEmbeddings: true
      });
      
      expect(result.status).toBe(200);
      // Check that embeddings are not included
      expect(result.data[0]).not.toHaveProperty('embedding');
    });
  });

  describe('searchRows', () => {
    beforeEach(() => {
      // Mock RPC function for vector search
      supabaseMock.setMockRpcResult('match_table_rows', [
        { 
          id: 'product-1', 
          title: 'Test Product', 
          similarity: 0.85 
        }
      ]);
    });

    it('should perform vector search with embeddings', async () => {
      const storageService = new StorageService();
      const result = await storageService.searchRows({
        table: 'objects',
        queryText: 'test product',
        matchThreshold: 0.7,
        matchCount: 5,
        nlpService: mockNlpService,
        organisationId: 'test-org-1'
      });

      expect(result.status).toBe(200);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Test Product');
      expect(mockNlpService.generateTextEmbedding).toHaveBeenCalledWith('test product');
    });

    it('should use default threshold and count when not provided', async () => {
      const storageService = new StorageService();
      const result = await storageService.searchRows({
        table: 'objects',
        queryText: 'test product',
        nlpService: mockNlpService
      });

      expect(result.status).toBe(200);
      // Default values should be used and search should still work
      expect(result.data).toBeTruthy();
    });

    it('should handle error when embedding generation fails', async () => {
      mockNlpService.generateTextEmbedding = jest.fn().mockResolvedValue({
        status: 500,
        message: "Failed to generate embedding"
      });

      const storageService = new StorageService();
      const result = await storageService.searchRows({
        table: 'objects',
        queryText: 'test product',
        nlpService: mockNlpService
      });

      expect(result.status).toBe(500);
      expect(result.message).toContain('Error in searchRows');
    });
  });

  describe('updateRow', () => {
    it('should update an existing row successfully', async () => {
      const storageService = new StorageService();
      const result = await storageService.updateRow({
        table: 'organisations',
        keys: { id: 'test-org-1' },
        rowData: { name: 'Updated Organization Name' },
        nlpService: mockNlpService,
        mayAlreadyExist: true
      });

      expect(result.status).toBe(200);
      
      // Verify the update was applied
      const updatedOrg = supabaseMock['mockData']['organisations'].find(
        (org: any) => org.id === 'test-org-1'
      );
      expect(updatedOrg.name).toBe('Updated Organization Name');
    });

    it('should create a new row when it does not exist', async () => {
      const storageService = new StorageService();
      const newOrg = {
        id: 'new-org',
        name: 'New Organization',
        enabled: true
      };

      const result = await storageService.updateRow({
        table: 'organisations',
        keys: { id: 'new-org' },
        rowData: newOrg,
        nlpService: mockNlpService,
        mayAlreadyExist: false
      });

      expect(result.status).toBe(200);
      
      // Verify the new row was added
      const addedOrg = supabaseMock['mockData']['organisations'].find(
        (org: any) => org.id === 'new-org'
      );
      expect(addedOrg).toBeDefined();
      expect(addedOrg.name).toBe('New Organization');
    });

    it('should merge metadata for objects', async () => {
      // Set up an existing object
      supabaseMock.setMockData('objects', [
        { 
          id: 'obj-1', 
          related_object_type_id: 'product',
          metadata: { 
            title: 'Test Product',
            price: 100
          }
        }
      ]);

      const storageService = new StorageService();
      const result = await storageService.updateRow({
        table: 'objects',
        keys: { id: 'obj-1' },
        rowData: { 
          metadata: { 
            description: 'New description',
            stock: 50
          }
        },
        nlpService: mockNlpService,
        mayAlreadyExist: true
      });

      expect(result.status).toBe(200);
      
      // Verify the metadata was merged, not replaced
      const updatedObj = supabaseMock['mockData']['objects'].find(
        (obj: any) => obj.id === 'obj-1'
      );
      
      expect(updatedObj.metadata).toEqual({
        title: 'Test Product',
        price: 100,
        description: 'New description',
        stock: 50
      });
    });
  });

  describe('mergeData', () => {
    it('should merge simple objects', () => {
      const storageService = new StorageService();
      const existing = { a: 1, b: 2 };
      const incoming = { c: 3, d: 4 };
      
      const result = storageService['mergeData']({
        existing,
        incoming
      });
      
      expect(result).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });
    
    it('should merge nested objects', () => {
      const storageService = new StorageService();
      const existing = { 
        a: 1, 
        nested: { 
          x: 10, 
          y: 20 
        } 
      };
      const incoming = { 
        b: 2, 
        nested: { 
          z: 30 
        } 
      };
      
      const result = storageService['mergeData']({
        existing,
        incoming
      });
      
      expect(result).toEqual({ 
        a: 1, 
        b: 2, 
        nested: { 
          x: 10, 
          y: 20, 
          z: 30 
        } 
      });
    });
    
    it('should overwrite fields when specified', () => {
      const storageService = new StorageService();
      const existing = { a: 1, b: 2, nested: { x: 10 } };
      const incoming = { a: 100, nested: { x: 1000 } };
      
      const result = storageService['mergeData']({
        existing,
        incoming,
        overwriteFields: ['a', 'nested.x']
      });
      
      expect(result).toEqual({ 
        a: 100, 
        b: 2, 
        nested: { 
          x: 1000 
        } 
      });
    });
    
    it('should handle arrays by replacing them', () => {
      const storageService = new StorageService();
      const existing = { arr: [1, 2, 3] };
      const incoming = { arr: [4, 5] };
      
      const result = storageService['mergeData']({
        existing,
        incoming
      });
      
      // Arrays should be replaced, not merged
      expect(result).toEqual({ arr: [4, 5] });
    });
  });
}); 