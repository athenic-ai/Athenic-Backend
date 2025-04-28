// A standalone test file to verify basic server functionality
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');

console.log('Creating a basic Express server for testing');

// Create a simplified express app that mimics the main server
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check endpoint called');
  res.json({ status: 'healthy', service: 'test-server' });
});

// Chat endpoint - simplified version
app.post('/api/chat', async (req, res) => {
  console.log('Chat endpoint called with body:', req.body);
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Missing required parameter: message' });
  }
  
  return res.status(202).json({
    status: 'processing',
    message: 'Message received and is being processed',
    clientId: 'test-client-id',
  });
});

// Chat response endpoint
app.post('/api/chat/response', (req, res) => {
  console.log('Chat response endpoint called with body:', req.body);
  const { clientId, response } = req.body;
  
  if (!clientId || !response) {
    return res.status(400).json({ error: 'Missing required parameters: clientId, response' });
  }
  
  res.json({ status: 'success', message: 'Response received' });
});

// Create and start a server
const server = http.createServer(app);
const port = 3001;

server.listen(port, () => {
  console.log(`Test server running on port ${port}`);
  console.log(`Now testing endpoints...`);
  
  // Run the tests sequentially
  testHealthEndpoint()
    .then(() => testChatEndpointMissingMessage())
    .then(() => testChatEndpointValidMessage())
    .then(() => testChatResponseEndpointMissingParams())
    .then(() => testChatResponseEndpointValidParams())
    .then(() => {
      console.log('\n✅ All tests completed successfully!');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    })
    .catch(error => {
      console.error('\n❌ Test failed:', error);
      server.close(() => {
        console.log('Server closed due to error');
        process.exit(1);
      });
    });
});

// Test functions
async function testHealthEndpoint() {
  console.log('\n📋 Testing GET /api/health');
  try {
    const response = await makeRequest(`http://localhost:${port}/api/health`);
    console.log('Response:', response);
    
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    if (response.body.status !== 'healthy') {
      throw new Error(`Expected body.status to be 'healthy', got '${response.body.status}'`);
    }
    
    console.log('✅ Health endpoint test passed');
  } catch (error) {
    console.error('❌ Health endpoint test failed:', error);
    throw error;
  }
}

async function testChatEndpointMissingMessage() {
  console.log('\n📋 Testing POST /api/chat with missing message');
  try {
    const response = await makePostRequest(`http://localhost:${port}/api/chat`, {});
    console.log('Response:', response);
    
    if (response.status !== 400) {
      throw new Error(`Expected status 400, got ${response.status}`);
    }
    if (!response.body.error || !response.body.error.includes('Missing required parameter')) {
      throw new Error(`Expected error about missing parameter, got ${JSON.stringify(response.body)}`);
    }
    
    console.log('✅ Chat missing message test passed');
  } catch (error) {
    console.error('❌ Chat missing message test failed:', error);
    throw error;
  }
}

async function testChatEndpointValidMessage() {
  console.log('\n📋 Testing POST /api/chat with valid message');
  try {
    const response = await makePostRequest(`http://localhost:${port}/api/chat`, { message: 'Hello test' });
    console.log('Response:', response);
    
    if (response.status !== 202) {
      throw new Error(`Expected status 202, got ${response.status}`);
    }
    if (response.body.status !== 'processing') {
      throw new Error(`Expected body.status to be 'processing', got '${response.body.status}'`);
    }
    
    console.log('✅ Chat valid message test passed');
  } catch (error) {
    console.error('❌ Chat valid message test failed:', error);
    throw error;
  }
}

async function testChatResponseEndpointMissingParams() {
  console.log('\n📋 Testing POST /api/chat/response with missing params');
  try {
    const response = await makePostRequest(`http://localhost:${port}/api/chat/response`, {});
    console.log('Response:', response);
    
    if (response.status !== 400) {
      throw new Error(`Expected status 400, got ${response.status}`);
    }
    if (!response.body.error || !response.body.error.includes('Missing required parameters')) {
      throw new Error(`Expected error about missing parameters, got ${JSON.stringify(response.body)}`);
    }
    
    console.log('✅ Chat response missing params test passed');
  } catch (error) {
    console.error('❌ Chat response missing params test failed:', error);
    throw error;
  }
}

async function testChatResponseEndpointValidParams() {
  console.log('\n📋 Testing POST /api/chat/response with valid params');
  try {
    const response = await makePostRequest(
      `http://localhost:${port}/api/chat/response`, 
      { clientId: 'test-client', response: 'Test response' }
    );
    console.log('Response:', response);
    
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    if (response.body.status !== 'success') {
      throw new Error(`Expected body.status to be 'success', got '${response.body.status}'`);
    }
    
    console.log('✅ Chat response valid params test passed');
  } catch (error) {
    console.error('❌ Chat response valid params test failed:', error);
    throw error;
  }
}

// Helper functions
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
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
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
            headers: res.headers,
            body: responseData ? JSON.parse(responseData) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
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