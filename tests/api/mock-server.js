// A mock implementation of the server.ts file to test in isolation
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const { v4: uuid } = require('uuid');

console.log('Server module is being loaded');

// Mock the inngest client
const inngest = {
  send: async function(event) {
    console.log('Mock Inngest send called with event:', event);
    return {};
  }
};

// Mock the Supabase client
function createSupabaseClient() {
  console.log('Mock createSupabaseClient called');
  return {
    auth: {
      getUser: async function(token) {
        console.log('Mock Supabase getUser called with token:', token);
        if (token === 'valid-token') {
          return {
            data: {
              user: {
                id: 'test-user-id',
                email: 'test@example.com',
              },
            },
            error: null,
          };
        } else {
          return {
            data: { user: null },
            error: {
              message: 'Invalid token',
            },
          };
        }
      }
    }
  };
}

console.log('Environment variables loaded');

// Create Express app
const app = express();
console.log('Express app created');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev')); // Logging
console.log('Middleware configured');

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check endpoint called');
  res.json({ status: 'healthy', service: 'backend-api' });
  console.log('Health check response sent');
});

// Chat endpoint - handles messages from the Flutter app
app.post('/api/chat', async (req, res) => {
  console.log('Chat endpoint called');
  try {
    const { message, userId, organisationId } = req.body;
    
    // Validate required parameters
    if (!message) {
      console.log('Missing message parameter');
      return res.status(400).json({ error: 'Missing required parameter: message' });
    }
    
    // Validate auth token if provided
    const authHeader = req.headers.authorization;
    if (authHeader) {
      console.log('Auth header found, validating token');
      // Extract the token
      const token = authHeader.split(' ')[1];
      
      // Initialize Supabase client
      const supabase = createSupabaseClient();
      
      // Verify the token
      console.log('Verifying token with Supabase');
      const { data, error } = await supabase.auth.getUser(token);
      
      if (error) {
        console.error('Auth error:', error);
        return res.status(401).json({ error: 'Invalid authentication token' });
      }
      
      console.log('Authenticated user:', data.user);
    }
    
    // Generate a unique client ID for this session
    const clientId = req.body.clientId || uuid();
    
    // Log the incoming message
    console.log(`Received chat message from client ${clientId}:`, message.substring(0, 100) + (message.length > 100 ? '...' : ''));
    
    // Send the event to Inngest for processing
    console.log('Sending event to Inngest');
    await inngest.send({
      name: 'athenic/chat.message.received',
      data: {
        message,
        userId: userId || 'anonymous',
        organisationId: organisationId || 'default',
        clientId,
        timestamp: new Date().toISOString(),
      },
    });
    console.log('Inngest event sent successfully');
    
    // Immediately return 202 Accepted, indicating the request is being processed
    console.log('Returning 202 response');
    return res.status(202).json({
      status: 'processing',
      message: 'Message received and is being processed',
      clientId, // Return the clientId to the client for later use
    });
  } catch (error) {
    console.error('Error processing chat message:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Endpoint for Inngest to send responses back to the client (will be handled via WebSocket)
app.post('/api/chat/response', (req, res) => {
  console.log('Chat response endpoint called');
  const { clientId, response, requiresE2B } = req.body;
  
  if (!clientId || !response) {
    console.log('Missing required parameters');
    return res.status(400).json({ error: 'Missing required parameters: clientId, response' });
  }
  
  // Normally in a WebSocket setup, we would push this response directly to the connected client
  // For now, we'll just log it and return a success response
  console.log(`Response for client ${clientId}:`, response.substring(0, 100) + (response.length > 100 ? '...' : ''));
  console.log(`Requires E2B execution: ${requiresE2B ? 'Yes' : 'No'}`);
  
  // In the future, this endpoint would trigger a WebSocket message to the client
  // or store the response for retrieval by a polling mechanism
  console.log('Returning success response');
  res.json({ status: 'success', message: 'Response received' });
});

// Start the server function
function startApiServer(port = 3000) {
  console.log(`Starting API server on port ${port}`);
  const server = app.listen(port, () => {
    console.log(`Backend API server listening on port ${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
  });
  return server;
}

console.log('Server module fully loaded');

// Create server and run tests
const port = 3003;
const server = startApiServer(port);

// Run a series of tests against the server
async function runTests() {
  try {
    // 1. Test health endpoint
    console.log('\n📋 Testing health endpoint...');
    const healthResponse = await makeRequest(`http://localhost:${port}/api/health`);
    console.log('Health response:', healthResponse);
    
    // 2. Test chat with missing message
    console.log('\n📋 Testing chat with missing message...');
    const chatMissingMsgResponse = await makePostRequest(
      `http://localhost:${port}/api/chat`, 
      {}
    );
    console.log('Missing message response:', chatMissingMsgResponse);
    
    // 3. Test chat with valid message
    console.log('\n📋 Testing chat with valid message...');
    const chatValidResponse = await makePostRequest(
      `http://localhost:${port}/api/chat`, 
      { message: 'Hello test' }
    );
    console.log('Valid message response:', chatValidResponse);
    
    // 4. Test chat/response with missing params
    console.log('\n📋 Testing chat/response with missing params...');
    const responseInvalidResponse = await makePostRequest(
      `http://localhost:${port}/api/chat/response`, 
      {}
    );
    console.log('Missing params response:', responseInvalidResponse);
    
    // 5. Test chat/response with valid params
    console.log('\n📋 Testing chat/response with valid params...');
    const responseValidResponse = await makePostRequest(
      `http://localhost:${port}/api/chat/response`, 
      { clientId: 'test-client', response: 'Test response' }
    );
    console.log('Valid params response:', responseValidResponse);
    
    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test error:', error);
  } finally {
    setTimeout(() => {
      console.log('\nClosing server...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    }, 1000); // Give a second for any pending operations to complete
  }
}

// Helper functions
const http = require('http');

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: data,
            error: e.message
          });
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function makePostRequest(url, data) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    const req = http.request(url, options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: responseData ? JSON.parse(responseData) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: responseData,
            error: e.message
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(JSON.stringify(data));
    req.end();
  });
}

// Run the tests
runTests(); 