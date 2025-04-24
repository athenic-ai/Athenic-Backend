import { ExecuteJobs } from '../../../supabase/functions/_shared/jobs/executeJobs';
import { StorageService } from '../../../supabase/functions/_shared/services/storage/storageService';
import { NlpService } from '../../../supabase/functions/_shared/services/nlp/nlpService';
import * as config from '../../../supabase/functions/_shared/configs/index';

// Mock dependencies
jest.mock('../../../supabase/functions/_shared/services/storage/storageService');
jest.mock('../../../supabase/functions/_shared/services/nlp/nlpService');
jest.mock('../../../supabase/functions/_shared/configs/index', () => {
  // Keep the original module
  const originalModule = jest.requireActual('../../../supabase/functions/_shared/configs/index');
  
  // Mock specific methods
  return {
    ...originalModule,
    getOrganisationObjectTypes: jest.fn(),
    getObjectMetadataTypes: jest.fn(),
    getFieldTypes: jest.fn(),
    getDictionaryTerms: jest.fn(),
    createObjectTypeDescriptions: jest.fn(),
    createObjectMetadataFunctionProperties: jest.fn().mockReturnValue([{}, {}]),
    stringify: jest.fn(x => JSON.stringify(x)),
    OBJECT_TABLE_NAME: 'objects',
    OBJECT_TYPE_ID_SIGNAL: 'signal',
    OBJECT_TYPE_ID_JOB: 'job',
    OBJECT_TYPE_ID_JOB_RUN: 'job_run'
  };
});

const mockedConfig = config as jest.Mocked<typeof config>;

describe('ExecuteJobs', () => {
  let mockNlpService: jest.Mocked<NlpService>;
  let mockStorageService: jest.Mocked<StorageService>;
  let executeJobs: ExecuteJobs<any>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mocks
    mockNlpService = new NlpService() as jest.Mocked<NlpService>;
    mockStorageService = new StorageService() as jest.Mocked<StorageService>;
    
    // Initialize with mocks
    executeJobs = new ExecuteJobs(mockNlpService, mockStorageService);
    
    // Mock NLP service methods
    mockNlpService.initialiseClientCore = jest.fn().mockResolvedValue(undefined);
    mockNlpService.initialiseClientOpenAi = jest.fn().mockResolvedValue(undefined);
    mockNlpService.executeThread = jest.fn().mockResolvedValue({ status: 200, message: 'Success' });
    mockNlpService.setMemberVariables = jest.fn();
    mockNlpService.upsertedObjectIds = {};
    
    // Mock config methods
    mockedConfig.getOrganisationObjectTypes.mockResolvedValue({ 
      status: 200, 
      data: [{ id: 'job', name: 'Job' }], 
      message: null, 
      references: null 
    });
    mockedConfig.getObjectMetadataTypes.mockResolvedValue({ 
      status: 200, 
      data: [{ id: 'title', name: 'Title' }], 
      message: null, 
      references: null 
    });
    mockedConfig.getFieldTypes.mockResolvedValue({ 
      status: 200, 
      data: [{ id: 'text', name: 'Text' }], 
      message: null, 
      references: null 
    });
    mockedConfig.getDictionaryTerms.mockResolvedValue({ 
      status: 200, 
      data: [{ id: 'done', name: 'Done' }], 
      message: null, 
      references: null 
    });
    mockedConfig.createObjectTypeDescriptions.mockReturnValue({
      job: { 
        name: 'Job', 
        description: 'A task to be done', 
        metadata: {} 
      },
      signal: { 
        name: 'Signal', 
        description: 'An insight or notification', 
        metadata: {} 
      }
    });
  });

  describe('start', () => {
    it('should throw error if organisationId is not provided', async () => {
      const result = await executeJobs.start({ dataIn: {} });
      expect(result.status).toBe(500);
      expect(result.message).toContain('Unable to find organisationId');
    });

    it('should successfully process jobs when valid data is provided', async () => {
      // Mock storage service responses
      mockStorageService.getRow = jest.fn().mockResolvedValue({
        status: 200,
        data: { id: 'test-org', name: 'Test Org' }
      });
      
      mockStorageService.getRows = jest.fn().mockResolvedValue({
        status: 200,
        data: [
          { 
            id: 'job-1', 
            related_object_type_id: 'job',
            owner_organisation_id: 'test-org',
            metadata: { title: 'Test Job' } 
          }
        ]
      });
      
      mockStorageService.updateRow = jest.fn().mockResolvedValue({
        status: 200,
        message: 'Row updated successfully'
      });
      
      // Call start with valid data
      const result = await executeJobs.start({
        dataIn: {
          companyMetadata: { organisationId: 'test-org' },
          companyDataContents: ['job-1']
        }
      });
      
      // Verify success
      expect(result.status).toBe(200);
      
      // Verify NLP service was initialized
      expect(mockNlpService.initialiseClientCore).toHaveBeenCalled();
      expect(mockNlpService.initialiseClientOpenAi).toHaveBeenCalled();
      
      // Verify job was executed
      expect(mockNlpService.executeThread).toHaveBeenCalled();
      expect(mockNlpService.executeThread.mock.calls[0][0].promptParts[0].text).toContain('A job needs to be executed');
      
      // Verify job run was created
      expect(mockStorageService.updateRow).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'objects',
          keys: expect.any(Object),
          rowData: expect.objectContaining({
            related_object_type_id: 'job_run',
            metadata: expect.objectContaining({
              parent_id: 'job-1'
            })
          })
        })
      );
    });

    it('should handle errors during job execution', async () => {
      // Mock storage service for organization data
      mockStorageService.getRow = jest.fn().mockResolvedValue({
        status: 200,
        data: { id: 'test-org', name: 'Test Org' }
      });
      
      // Mock for fetching jobs
      mockStorageService.getRows = jest.fn().mockResolvedValue({
        status: 200,
        data: [
          { 
            id: 'job-1', 
            related_object_type_id: 'job',
            owner_organisation_id: 'test-org',
            metadata: { title: 'Test Job' } 
          }
        ]
      });
      
      // Mock NLP service to fail
      mockNlpService.executeThread = jest.fn().mockResolvedValue({ 
        status: 500, 
        message: 'Execution failed' 
      });
      
      // Call start with valid data
      const result = await executeJobs.start({
        dataIn: {
          companyMetadata: { organisationId: 'test-org' },
          companyDataContents: ['job-1']
        }
      });
      
      // Verify successful function call (even though job execution failed)
      expect(result.status).toBe(200);
      
      // Verify job run was created with failure status
      expect(mockStorageService.updateRow).toHaveBeenCalledWith(
        expect.objectContaining({
          rowData: expect.objectContaining({
            metadata: expect.objectContaining({
              job_run_status: 'failed'
            })
          })
        })
      );
    });
  });
}); 