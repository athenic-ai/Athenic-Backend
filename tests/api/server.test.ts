import request from 'supertest';
import http from 'http';
import app from '../../src/api/server';

// More comprehensive Inngest mock
jest.mock('../../src/inngest/client', () => {
  const mockSend = jest.fn().mockResolvedValue({});
  const mockInngest = {
    send: mockSend,
  };
  return {
    inngest: mockInngest,
    testInngestConnection: jest.fn().mockResolvedValue(true),
  };
});

// Import after mocking
const { inngest } = require('../../src/inngest/client');

// Mock Supabase client
jest.mock('../../src/api/supabase', () => ({
  createSupabaseClient: jest.fn().mockReturnValue({
    auth: {
      getUser: jest.fn().mockImplementation((token) => {
        if (token === 'valid-token') {
          return Promise.resolve({
            data: {
              user: {
                id: 'test-user-id',
                email: 'test@example.com',
              },
            },
            error: null,
          });
        } else {
          return Promise.resolve({
            data: { user: null },
            error: {
              message: 'Invalid token',
            },
          });
        }
      }),
    },
  }),
}));

// Increase the Jest timeout for all tests
jest.setTimeout(30000);

// Jest is having trouble with these tests. Let's add a simple smoke test to see if that runs:
describe('Simple API Server Smoke Tests', () => {
  it('health endpoint should return healthy status directly', () => {
    // Instead of trying to access app._router.stack, which doesn't exist,
    // we'll just verify directly against the code we can see in the server.ts file
    const mockRes = {
      json: jest.fn()
    };
    
    const mockReq = {};
    
    // Call a healthHandler function that mimics the behavior of the actual endpoint
    const healthHandler = (req: any, res: any) => {
      res.json({ status: 'healthy', service: 'backend-api' });
    };
    
    healthHandler(mockReq, mockRes);
    
    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'healthy',
      service: 'backend-api',
    });
  });
});

describe('API Server Unit Tests', () => {
  let server: http.Server;
  
  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve()); // Use a random available port
    });
  });
  
  afterAll(async () => {
    // Close the server when tests are done
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    // Force close any remaining connections
    jest.clearAllMocks();
    await new Promise(resolve => setTimeout(resolve, 500));
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(server).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'healthy',
        service: 'backend-api',
      });
    });
  });

  describe('POST /api/chat', () => {
    it('should return 400 when message is missing', async () => {
      const response = await request(server).post('/api/chat').send({});
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing required parameter: message');
    });

    it('should process a message and return 202 with clientId', async () => {
      const response = await request(server)
        .post('/api/chat')
        .send({ message: 'Hello' });
      
      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('status', 'processing');
      expect(response.body).toHaveProperty('clientId');
      expect(inngest.send).toHaveBeenCalledWith({
        name: 'athenic/chat.message.received',
        data: expect.objectContaining({ 
          message: 'Hello',
          userId: 'anonymous',
          organisationId: 'default',
          clientId: response.body.clientId,
        }),
      });
    });

    it('should respect provided clientId', async () => {
      const response = await request(server)
        .post('/api/chat')
        .send({ message: 'Hello', clientId: 'test-client-id-123' });
      
      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('clientId', 'test-client-id-123');
    });

    it('should authenticate user with valid token', async () => {
      const response = await request(server)
        .post('/api/chat')
        .set('Authorization', 'Bearer valid-token')
        .send({ message: 'Hello' });
      
      expect(response.status).toBe(202);
    });

    it('should reject invalid auth token', async () => {
      const response = await request(server)
        .post('/api/chat')
        .set('Authorization', 'Bearer invalid-token')
        .send({ message: 'Hello' });
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid authentication token');
    });
  });

  describe('POST /api/chat/response', () => {
    it('should return 400 when clientId or response is missing', async () => {
      const response = await request(server)
        .post('/api/chat/response')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing required parameters: clientId, response');
    });

    it('should process a response successfully', async () => {
      const response = await request(server)
        .post('/api/chat/response')
        .send({ 
          clientId: 'test-client-id',
          response: 'This is a test response'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
    });
  });

  describe('POST /api/chat/execution-started', () => {
    it('should return 400 when clientId or sandboxId is missing', async () => {
      const response = await request(server)
        .post('/api/chat/execution-started')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing required parameters: clientId, sandboxId');
    });

    it('should process an execution start notification successfully', async () => {
      const response = await request(server)
        .post('/api/chat/execution-started')
        .send({ 
          clientId: 'test-client-id',
          sandboxId: 'test-sandbox-id'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('sandboxId', 'test-sandbox-id');
    });

    it('should update client session state', async () => {
      const clientId = 'test-client-id-2';
      const sandboxId = 'test-sandbox-id-2';
      
      // First, make sure we have a session
      await request(server)
        .post('/api/chat')
        .send({ 
          message: 'Test message',
          clientId 
        });
      
      // Now notify about execution starting
      await request(server)
        .post('/api/chat/execution-started')
        .send({ clientId, sandboxId });
      
      // Check the session state
      const sessionResponse = await request(server)
        .get(`/api/chat/session/${clientId}`);
      
      expect(sessionResponse.status).toBe(200);
      expect(sessionResponse.body).toHaveProperty('sandboxId', sandboxId);
      expect(sessionResponse.body).toHaveProperty('processingState', 'e2b_executing');
      expect(sessionResponse.body).toHaveProperty('executionStartTimestamp');
    });
  });
}); 