import request from 'supertest';
import app from '../../src/api/server';
import { createSupabaseClient } from '../../src/api/supabase';
import { inngest } from '../../src/inngest/client';

// Mock the Supabase client
jest.mock('../../src/api/supabase');
(createSupabaseClient as jest.Mock).mockReturnValue({
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
      error: null
    })
  }
});

// Mock the Inngest client
jest.mock('../../src/inngest/client', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue({ success: true }),
  }
}));

describe('Chat Response API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/chat/response', () => {
    it('should accept a chat response from Inngest and update client session', async () => {
      const clientId = 'test-client-id';
      const response = 'This is a test response from Inngest';
      
      const res = await request(app)
        .post('/api/chat/response')
        .send({
          clientId,
          response,
          requiresE2B: false
        });
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'success',
        message: 'Response received'
      });
      
      // Client session should be updated
      // Test this by retrieving the session
      const sessionRes = await request(app)
        .get(`/api/chat/session/${clientId}`);
      
      expect(sessionRes.status).toBe(200);
      expect(sessionRes.body).toMatchObject({
        lastResponse: response,
        requiresE2B: false,
        processingState: 'completed'
      });
    });
    
    it('should handle responses that require E2B execution', async () => {
      const clientId = 'test-client-id-e2b';
      const response = 'I will execute some code for you';
      const e2bResult = { success: true, message: 'Code execution started' };
      
      const res = await request(app)
        .post('/api/chat/response')
        .send({
          clientId,
          response,
          requiresE2B: true,
          e2bResult
        });
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'success',
        message: 'Response received'
      });
      
      // Client session should be updated with E2B info
      const sessionRes = await request(app)
        .get(`/api/chat/session/${clientId}`);
      
      expect(sessionRes.status).toBe(200);
      expect(sessionRes.body).toMatchObject({
        lastResponse: response,
        requiresE2B: true,
        e2bResult,
        processingState: 'awaiting_e2b'
      });
    });
    
    it('should return an error if required parameters are missing', async () => {
      const res = await request(app)
        .post('/api/chat/response')
        .send({
          // Missing clientId and response
        });
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });
  
  describe('E2B Execution Flow', () => {
    it('should handle E2B execution start notification', async () => {
      const clientId = 'test-client-id-e2b';
      const sandboxId = 'sandbox-123';
      
      const res = await request(app)
        .post('/api/chat/execution-started')
        .send({
          clientId,
          sandboxId
        });
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'success',
        message: 'E2B execution start notification received',
        sandboxId
      });
      
      // Client session should be updated with E2B execution info
      const sessionRes = await request(app)
        .get(`/api/chat/session/${clientId}`);
      
      expect(sessionRes.status).toBe(200);
      expect(sessionRes.body).toMatchObject({
        sandboxId,
        processingState: 'e2b_executing'
      });
    });
    
    it('should return an error if required parameters are missing for execution start', async () => {
      const res = await request(app)
        .post('/api/chat/execution-started')
        .send({
          // Missing clientId and sandboxId
        });
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });
}); 