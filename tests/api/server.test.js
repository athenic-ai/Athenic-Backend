const axios = require('axios');
const { startServer } = require('../../src/api/server');
const { startServer: startInngestServer } = require('../../src/inngest/server');

describe('API Server', () => {
  let apiServer;
  let inngestServer;
  let apiPort = 3001;
  let inngestPort = 8001;
  
  beforeAll(async () => {
    // Set environment variables for testing
    process.env.API_SERVER_PORT = apiPort.toString();
    process.env.INNGEST_SERVER_PORT = inngestPort.toString();
    
    // Start both servers
    inngestServer = startInngestServer();
    apiServer = startServer();
    
    // Give servers time to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
  
  afterAll(async () => {
    // Close servers
    await new Promise(resolve => {
      apiServer.close(() => {
        inngestServer.close(() => {
          resolve();
        });
      });
    });
  });
  
  test('Health check endpoint returns success', async () => {
    const response = await axios.get(`http://localhost:${apiPort}/api/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
    expect(response.data.service).toBe('api-server');
  });
  
  test('Chat endpoint accepts messages and returns client ID', async () => {
    const response = await axios.post(`http://localhost:${apiPort}/api/chat`, {
      message: 'Hello, Athenic!'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.clientId).toBeDefined();
    
    // Give time for async processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if we can retrieve the response
    const clientId = response.data.clientId;
    const responseCheck = await axios.get(`http://localhost:${apiPort}/api/chat/response/${clientId}`);
    
    expect(responseCheck.status).toBe(200);
    expect(responseCheck.data.lastMessage).toBe('Hello, Athenic!');
    expect(responseCheck.data.lastResponse).toBeDefined();
  });
}); 