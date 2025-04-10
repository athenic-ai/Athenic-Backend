import { ExecuteJobs } from '../../../supabase/functions/_shared/jobs/executeJobs';
import { StorageService } from '../../../supabase/functions/_shared/services/storage/storageService';
import { NlpService } from '../../../supabase/functions/_shared/services/nlp/nlpService';
import SupabaseMock from '../../mocks/supabaseMock';

// Mock OpenAI
jest.mock('npm:openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: "Test response for job execution",
                tool_calls: null
              }
            }
          ]
        })
      }
    },
    embeddings: {
      create: jest.fn().mockResolvedValue({
        data: [
          { embedding: [0.1, 0.2, 0.3, 0.4, 0.5] } // Mock embedding vector
        ]
      })
    }
  }));
});

// Mock Supabase client
jest.mock('jsr:@supabase/supabase-js@2', () => ({
  createClient: jest.fn((url, key, options) => {
    return supabaseMock.createClient();
  })
}));

// Mock UUID generation
jest.mock('jsr:@std/uuid', () => ({
  v1: {
    generate: jest.fn().mockReturnValue('test-uuid-1234')
  }
}));

// Create a Supabase mock for the integration test
const supabaseMock = new SupabaseMock();

describe('ExecuteJobs Integration', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock Deno.env.get for environment variables
    global.Deno = {
      env: {
        get: jest.fn().mockImplementation((key) => {
          const envVars = {
            'OPENAI_API_KEY': 'test-api-key',
            'OPENROUTER_API_KEY': 'test-openrouter-key',
            'SUPABASE_URL': 'https://test.supabase.co',
            'SUPABASE_ANON_KEY': 'test-anon-key',
            'SUPABASE_SERVICE_ROLE_KEY': 'test-service-role-key'
          };
          return envVars[key] || null;
        })
      }
    };

    // Setup test data
    const organisations = [
      {
        id: 'test-org',
        name: 'Test Organisation',
        enabled: true,
        connection_metadata: { shopify: { shop: { id: 12345 } } }
      }
    ];

    const objectTypes = [
      {
        id: 'job',
        name: 'Job',
        description: 'A task to be done by the AI'
      },
      {
        id: 'signal',
        name: 'Signal',
        description: 'An insight or observation'
      },
      {
        id: 'job_run',
        name: 'Job Run',
        description: 'A record of a job execution'
      }
    ];

    const objectMetadataTypes = [
      {
        id: 'title',
        name: 'Title',
        related_object_type_id: 'job',
        description: 'The title of the job'
      },
      {
        id: 'description',
        name: 'Description',
        related_object_type_id: 'job',
        description: 'Detailed description of the job'
      },
      {
        id: 'status',
        name: 'Status',
        related_object_type_id: 'job',
        description: 'Current status of the job'
      },
      {
        id: 'parent_id',
        name: 'Parent ID',
        related_object_type_id: 'job_run',
        description: 'ID of the parent job'
      }
    ];

    const fieldTypes = [
      {
        id: 'text',
        name: 'Text',
        data_type: 'string'
      },
      {
        id: 'status',
        name: 'Status',
        data_type: 'string'
      }
    ];

    const dictionaryTerms = [
      {
        id: 'planned',
        type: 'job_status',
        value: 'Planned'
      },
      {
        id: 'done',
        type: 'job_status',
        value: 'Done'
      },
      {
        id: 'failed',
        type: 'job_status',
        value: 'Failed'
      },
      {
        id: 'completed',
        type: 'job_run_status',
        value: 'Completed'
      }
    ];

    const objects = [
      {
        id: 'job-1',
        owner_organisation_id: 'test-org',
        related_object_type_id: 'job',
        metadata: {
          title: 'Test Job 1',
          description: 'This is a test job for integration testing',
          status: 'planned'
        }
      }
    ];

    // Set mock data
    supabaseMock
      .setMockData('organisations', organisations)
      .setMockData('object_types', objectTypes)
      .setMockData('object_metadata_types', objectMetadataTypes)
      .setMockData('field_types', fieldTypes)
      .setMockData('dictionary_terms', dictionaryTerms)
      .setMockData('objects', objects);
  });

  it('should execute a job end-to-end', async () => {
    // Create real service instances (that use our mocked Supabase)
    const storageService = new StorageService();
    const nlpService = new NlpService(storageService);
    const executeJobs = new ExecuteJobs(nlpService, storageService);

    // Run the job execution
    const result = await executeJobs.start({
      dataIn: {
        companyMetadata: { organisationId: 'test-org' },
        companyDataContents: ['job-1']
      }
    });

    // Verify result
    expect(result.status).toBe(200);
    
    // Check that we got stored objects in Supabase mock
    const storedObjects = supabaseMock['mockData']['objects'];
    
    // Verify job_run was created
    const jobRun = storedObjects.find(obj => obj.related_object_type_id === 'job_run');
    expect(jobRun).toBeTruthy();
    expect(jobRun.metadata.parent_id).toBe('job-1');
    
    // Verify job status was updated
    const updatedJob = storedObjects.find(obj => obj.id === 'job-1');
    expect(updatedJob.metadata.status).toBe('done');
  });

  it('should handle failures in job execution', async () => {
    // Create real service instances with modified NLP service
    const storageService = new StorageService();
    const nlpService = new NlpService(storageService);
    
    // Override executeThread to simulate failure
    nlpService.executeThread = jest.fn().mockResolvedValue({
      status: 500,
      message: 'Failed to execute job'
    });
    
    const executeJobs = new ExecuteJobs(nlpService, storageService);

    // Run the job execution
    const result = await executeJobs.start({
      dataIn: {
        companyMetadata: { organisationId: 'test-org' },
        companyDataContents: ['job-1']
      }
    });

    // Verify result - overall process should still "succeed" even if job execution failed
    expect(result.status).toBe(200);
    
    // Check that we got stored objects in Supabase mock
    const storedObjects = supabaseMock['mockData']['objects'];
    
    // Verify job_run was created with failure status
    const jobRun = storedObjects.find(obj => obj.related_object_type_id === 'job_run');
    expect(jobRun).toBeTruthy();
    expect(jobRun.metadata.job_run_status).toBe('failed');
    
    // Verify job status was updated to failed
    const updatedJob = storedObjects.find(obj => obj.id === 'job-1');
    expect(updatedJob.metadata.status).toBe('failed');
  });
}); 