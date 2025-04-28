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

// Mock Supabase client (to avoid actual authentication attempts)
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

describe('API Server Integration Tests', () => {
  let server: http.Server;
  
  beforeAll(async () => {
    // Create HTTP server using Express app
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve()); // Use a random available port
    });
  });
  
  afterAll(async () => {
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
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'backend-api');
    });
  });

  describe('POST /api/chat', () => {
    it('should return 400 when message is missing', async () => {
      const response = await request(server).post('/api/chat').send({});
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing required parameter: message');
    });

    it('should process a message successfully', async () => {
      const response = await request(server)
        .post('/api/chat')
        .send({ message: 'Hello world' });
      
      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('status', 'processing');
      expect(response.body).toHaveProperty('clientId');
      expect(inngest.send).toHaveBeenCalledWith({
        name: 'athenic/chat.message.received',
        data: expect.objectContaining({ 
          message: 'Hello world',
          userId: 'anonymous',
          organisationId: 'default',
          clientId: response.body.clientId
        }),
      });
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
}); 