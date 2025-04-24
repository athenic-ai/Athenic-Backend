import { describe, it, jest, beforeEach, afterEach, expect } from '@jest/globals';
import * as nlpFunctionsData from '../../../../supabase/functions/_shared/services/nlp/nlpFunctionsData';
import { NlpService } from '../../../../supabase/functions/_shared/services/nlp/nlpService';
import { NlpFunctionsBase } from '../../../../supabase/functions/_shared/services/nlp/nlpFunctionsBase';
import { StorageService } from '../../../../supabase/functions/_shared/services/storage/storageService';
import { UpsertDataJob } from '../../../../supabase/functions/_shared/jobs/upsertDataJob';

// Mock dependencies
jest.mock('../../../../supabase/functions/_shared/services/nlp/nlpService');
jest.mock('../../../../supabase/functions/_shared/services/storage/storageService');
jest.mock('../../../../supabase/functions/_shared/jobs/upsertDataJob');

// --- Fix: Subclass NlpService to expose storageService for testing ---
class TestNlpService extends NlpService {
  public getStorageService() {
    return this.storageService;
  }
}

// --- Fix: Use only public methods/constructor for NlpService test setup ---
// Helper to create a fully initialized TestNlpService
function createTestNlpService(): TestNlpService {
  const svc = new TestNlpService(new StorageService());
  // Instead of setting private fields, mock public methods that access them
  // For example, if getOrganisationId() exists, mock it:
  (svc as any).getOrganisationId = jest.fn(() => 'test-org');
  (svc as any).getOrganisationData = jest.fn(() => ({ id: 'test-org', name: 'Test Organization' }));
  (svc as any).getObjectTypes = jest.fn(() => [
    { id: 'product', name: 'Product' },
    { id: 'signal', name: 'Signal' },
    { id: 'job', name: 'Job' }
  ]);
  (svc as any).getObjectMetadataTypes = jest.fn(() => [
    { id: 'title', name: 'Title', related_object_type_id: 'product' },
    { id: 'description', name: 'Description', related_object_type_id: 'product' }
  ]);
  (svc as any).getObjectTypeDescriptions = jest.fn(() => ({
    product: { name: 'Product', description: 'A product' },
    signal: { name: 'Signal', description: 'A notification' },
    job: { name: 'Job', description: 'A task' }
  }));
  (svc as any).getFieldTypes = jest.fn(() => [{ id: 'text', name: 'Text' }]);
  (svc as any).getDictionaryTerms = jest.fn(() => [{ id: 'active', name: 'Active' }]);
  // Attach upsertData/searchForObjects as needed for test
  (svc as any).upsertData = jest.fn();
  (svc as any).searchForObjects = jest.fn();
  return svc;
}

describe('nlpFunctionsData', () => {
  let mockParent: jest.Mocked<TestNlpService>;
  let mockNlpFunctionsBase: NlpFunctionsBase;
  let mockUpsertDataJob: jest.Mocked<UpsertDataJob<any>>;
  let upsertDataFunc: (args: any) => Promise<any>;
  let searchForObjectsFunc: (args: any) => Promise<any>;
  let storageServiceSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    storageServiceSpy = jest.spyOn(StorageService.prototype, 'searchRows').mockResolvedValue({
      status: 200,
      data: [{ id: 'product-1', title: 'Test Product' }],
      message: 'Success',
      references: null
    });
    mockParent = createTestNlpService() as jest.Mocked<TestNlpService>;
    mockNlpFunctionsBase = { parent: mockParent } as unknown as NlpFunctionsBase;
    mockUpsertDataJob = {
      start: jest.fn().mockResolvedValue({
        status: 200,
        message: 'Data upserted successfully',
        data: { id: 'mock' },
        references: null
      })
    } as unknown as jest.Mocked<UpsertDataJob<any>>;
    (UpsertDataJob as jest.Mock).mockImplementation(() => mockUpsertDataJob);
  });

  afterEach(() => {
    storageServiceSpy.mockRestore();
  });

  describe('initialiseFunctions', () => {
    it('should initialise functions with required properties', async () => {
      const functions = await nlpFunctionsData.initialiseFunctions(mockNlpFunctionsBase);

      // Check that both expected functions are available
      expect(functions).toHaveProperty('upsertData');
      expect(functions).toHaveProperty('searchForObjects');

      // Check that each function has declaration and implementation
      expect(functions.upsertData).toHaveProperty('declaration');
      expect(functions.upsertData).toHaveProperty('implementation');
      expect(functions.searchForObjects).toHaveProperty('declaration');
      expect(functions.searchForObjects).toHaveProperty('implementation');
    });

    it('should not include functions if missing required parent properties', async () => {
      // Create parent missing required properties
      const incompleteParent = { ...mockParent };
      delete incompleteParent.organisationId;
      const incompleteBase = { parent: incompleteParent } as unknown as NlpFunctionsBase;

      const functions = await nlpFunctionsData.initialiseFunctions(incompleteBase);

      // Functions should not be available
      expect(functions).not.toHaveProperty('upsertData');
    });
  });

  describe('upsertData function', () => {
    beforeEach(async () => {
      const functions = await nlpFunctionsData.initialiseFunctions(mockNlpFunctionsBase);
      upsertDataFunc = functions.upsertData.implementation;
    });

    it('should successfully upsert data', async () => {
      const result = await upsertDataFunc({
        objectTypeId: 'product',
        dataContents: '{"title": "New Product", "price": 9.99}',
        dataDescription: 'New product from API'
      });

      expect(result.status).toBe(200);
      expect(mockUpsertDataJob.start).toHaveBeenCalled();

      // Check that the correct data was passed to upsertDataJob.start
      const callArg = mockUpsertDataJob.start.mock.calls[0][0];
      expect(callArg.dataIn.companyMetadata.organisationId).toBe('test-org');
      expect(callArg.dataIn.companyMetadata.objectTypeId).toBe('product');
      expect(callArg.initialCall).toBe(false);
    });

    it('should handle errors during data upsertion', async () => {
      // Mock the job to fail
      mockUpsertDataJob.start.mockResolvedValue({
        status: 500,
        message: 'Failed to upsert data',
        data: null,
        references: null
      });

      const result = await upsertDataFunc({
        objectTypeId: 'product',
        dataContents: '{"title": "Bad Product"}',
        dataDescription: 'Invalid product'
      });

      expect(result.status).toBe(500);
      expect(result.message).toContain('Failed to upsert data');
    });

    it('should catch exceptions during execution', async () => {
      // Make the job throw an error
      mockUpsertDataJob.start.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await upsertDataFunc({
        objectTypeId: 'product',
        dataContents: '{}',
        dataDescription: 'Test'
      });

      expect(result.status).toBe(500);
      expect(result.message).toContain('Unexpected error');
    });
  });

  describe('searchForObjects function', () => {
    beforeEach(async () => {
      const functions = await nlpFunctionsData.initialiseFunctions(mockNlpFunctionsBase);
      searchForObjectsFunc = functions.searchForObjects.implementation;
    });

    it('should successfully search for objects', async () => {
      const result = await searchForObjectsFunc({
        queryText: 'test product',
        matchThreshold: 0.7,
        matchCount: 5,
        relatedObjectTypeId: 'product'
      });

      expect(result.status).toBe(200);
      expect(storageServiceSpy).toHaveBeenCalledWith({
        table: expect.any(String),
        queryText: 'test product',
        matchThreshold: 0.7,
        matchCount: 5,
        nlpService: mockParent,
        organisationId: 'test-org',
        memberId: undefined,
        relatedObjectTypeId: 'product'
      });
      expect((result.data as { id: string }[])).toEqual([{ id: 'product-1', title: 'Test Product' }]);
    });

    it('should handle search with default parameters', async () => {
      const result = await searchForObjectsFunc({
        queryText: 'test product'
      });

      expect(result.status).toBe(200);
      expect(storageServiceSpy).toHaveBeenCalled();

      // Default values should be passed
      const callArgs = storageServiceSpy.mock.calls[0][0];
      expect(callArgs.matchThreshold).toBeUndefined();
      expect(callArgs.matchCount).toBeUndefined();
      expect(callArgs.relatedObjectTypeId).toBeUndefined();
    });

    it('should handle search errors', async () => {
      // Mock the search to fail
      storageServiceSpy.mockResolvedValue({
        status: 500,
        message: 'Search failed',
        data: null,
        references: null
      });

      const result = await searchForObjectsFunc({
        queryText: 'error query'
      });

      expect(result.status).toBe(500);
      expect(result.message).toContain('Error in searchForObjects');
    });

    it('should catch exceptions during search', async () => {
      // Make the search throw an error
      storageServiceSpy.mockImplementation(() => {
        throw new Error('Unexpected search error');
      });

      const result = await searchForObjectsFunc({
        queryText: 'problematic query'
      });

      expect(result.status).toBe(500);
      expect(result.message).toContain('Error in searchForObjects');
    });
  });
});