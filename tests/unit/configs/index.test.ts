import * as config from '../../../supabase/functions/_shared/configs/index';
import { StorageService } from '../../../supabase/functions/_shared/services/storage/storageService';

// Mock the StorageService
jest.mock('../../../supabase/functions/_shared/services/storage/storageService');

describe('Config Functions', () => {
  let mockStorageService: jest.Mocked<StorageService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageService = new StorageService() as jest.Mocked<StorageService>;
  });

  describe('stringify', () => {
    it('should stringify normal objects', () => {
      const testObj = { a: 1, b: 'test', c: true };
      const result = config.stringify(testObj);
      expect(result).toBe(JSON.stringify(testObj));
    });

    it('should handle circular references', () => {
      const circularObj: any = { a: 1 };
      circularObj.self = circularObj;
      
      // This should not throw
      const result = config.stringify(circularObj);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle primitive values', () => {
      expect(config.stringify('text')).toBe('text');
      expect(config.stringify(123)).toBe('123');
      expect(config.stringify(null)).toBe('null');
      expect(config.stringify(undefined)).toBe('undefined');
    });
  });

  describe('getOrganisationObjectTypes', () => {
    it('should return object types for an organisation', async () => {
      const mockObjectTypes = [
        { id: 'product', name: 'Product' },
        { id: 'order', name: 'Order' }
      ];
      
      // Setup the mock implementation
      mockStorageService.getRows = jest.fn().mockResolvedValue({
        status: 200,
        data: mockObjectTypes,
        message: 'Success'
      });

      const result = await config.getOrganisationObjectTypes({
        storageService: mockStorageService,
        organisationId: 'test-org',
        memberId: 'test-member'
      });
      
      expect(result.status).toBe(200);
      expect(result.data).toEqual(mockObjectTypes);
      
      // Verify the correct parameters were passed to getRows
      expect(mockStorageService.getRows).toHaveBeenCalledWith('object_types', {
        whereAndConditions: expect.arrayContaining([
          expect.objectContaining({ column: 'category', operator: 'neq', value: 'company_data' })
        ]),
        whereOrConditions: expect.arrayContaining([
          expect.objectContaining({ column: 'owner_organisation_id', operator: 'is', value: null }),
          expect.objectContaining({ column: 'owner_member_id', operator: 'is', value: null }),
          expect.objectContaining({ column: 'owner_organisation_id', operator: 'eq', value: 'test-org' }),
          expect.objectContaining({ column: 'owner_member_id', operator: 'eq', value: 'test-member' })
        ])
      });
    });

    it('should handle errors from the storage service', async () => {
      // Setup the mock to return an error
      mockStorageService.getRows = jest.fn().mockResolvedValue({
        status: 500,
        message: 'Database error'
      });

      const result = await config.getOrganisationObjectTypes({
        storageService: mockStorageService,
        organisationId: 'test-org',
        memberId: 'test-member'
      });
      
      expect(result.status).toBe(500);
      expect(result.message).toContain('❌');
    });
  });

  describe('getObjectMetadataTypes', () => {
    it('should return metadata types for an organisation', async () => {
      const mockMetadataTypes = [
        { id: 'title', name: 'Title', related_object_type_id: 'product' },
        { id: 'price', name: 'Price', related_object_type_id: 'product' }
      ];
      
      // Setup the mock implementation
      mockStorageService.getRows = jest.fn().mockResolvedValue({
        status: 200,
        data: mockMetadataTypes,
        message: 'Success'
      });

      const result = await config.getObjectMetadataTypes({
        storageService: mockStorageService,
        organisationId: 'test-org',
        memberId: 'test-member'
      });
      
      expect(result.status).toBe(200);
      expect(result.data).toEqual(mockMetadataTypes);
      
      // Verify the correct parameters were passed to getRows
      expect(mockStorageService.getRows).toHaveBeenCalledWith('object_metadata_types', {
        whereOrConditions: expect.arrayContaining([
          expect.objectContaining({ column: 'owner_organisation_id', operator: 'is', value: null }),
          expect.objectContaining({ column: 'owner_member_id', operator: 'is', value: null }),
          expect.objectContaining({ column: 'owner_organisation_id', operator: 'eq', value: 'test-org' }),
          expect.objectContaining({ column: 'owner_member_id', operator: 'eq', value: 'test-member' })
        ])
      });
    });
  });

  describe('createObjectTypeDescriptions', () => {
    it('should create object type descriptions correctly', () => {
      const objectTypes = [
        { id: 'product', name: 'Product', description: 'A product' },
        { id: 'order', name: 'Order', description: 'An order' }
      ];
      
      const metadataTypes = [
        { id: 'title', related_object_type_id: 'product', name: 'Title', description: 'Product title' },
        { id: 'price', related_object_type_id: 'product', name: 'Price', description: 'Product price' },
        { id: 'order_id', related_object_type_id: 'order', name: 'Order ID', description: 'Order identifier' },
        { id: 'global', related_object_type_id: null, name: 'Global', description: 'Global field' }
      ];
      
      const result = config.createObjectTypeDescriptions(objectTypes, metadataTypes);
      
      // Expect keys for each object type
      expect(Object.keys(result)).toContain('product');
      expect(Object.keys(result)).toContain('order');
      
      // Check that metadata is included for each object type
      expect(result.product).toHaveProperty('name', 'Product');
      expect(result.product).toHaveProperty('description', 'A product');
      
      // Check that global metadata (null related_object_type_id) is included for all types
      expect(result.product.metadata).toHaveProperty('global');
    });
  });

  // More tests for other config functions...
}); 