// Simple debug test to identify server issues
const http = require('http');
const path = require('path');

console.log('Setting up mock modules');

// Manual module mocking
require.cache[require.resolve('../../src/inngest/client')] = {
  id: require.resolve('../../src/inngest/client'),
  filename: require.resolve('../../src/inngest/client'),
  loaded: true,
  exports: {
    inngest: {
      send: async function() {
        console.log('Mock Inngest send called');
        return {};
      }
    },
    testInngestConnection: async function() {
      console.log('Mock testInngestConnection called');
      return true;
    }
  }
};

require.cache[require.resolve('../../src/api/supabase')] = {
  id: require.resolve('../../src/api/supabase'),
  filename: require.resolve('../../src/api/supabase'),
  loaded: true,
  exports: {
    createSupabaseClient: function() {
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
  }
};

console.log('Importing server');
const app = require('../../src/api/server').default;

console.log('Debug test started');

// Simple test to see if the server starts
async function testServer() {
  console.log('Creating server');
  const server = http.createServer(app);
  
  // Start the server
  console.log('Starting server');
  await new Promise(resolve => {
    server.listen(0, () => {
      console.log(`Server started on port ${server.address().port}`);
      resolve();
    });
  });
  
  // Make a request to the health endpoint
  console.log('Making request to health endpoint');
  const port = server.address().port;
  
  try {
    // 1. Test the health endpoint
    const healthResponse = await makeRequest(`http://localhost:${port}/api/health`);
    console.log('Health response received:', healthResponse);
    
    // 2. Test the chat endpoint with missing message
    const chatMissingMsgResponse = await makePostRequest(
      `http://localhost:${port}/api/chat`, 
      {}
    );
    console.log('Chat missing message response:', chatMissingMsgResponse);
    
    // 3. Test the chat endpoint with valid message
    const chatValidResponse = await makePostRequest(
      `http://localhost:${port}/api/chat`, 
      { message: 'Hello test' }
    );
    console.log('Chat valid response:', chatValidResponse);
    
    // 4. Test the chat response endpoint with missing params
    const responseInvalidResponse = await makePostRequest(
      `http://localhost:${port}/api/chat/response`, 
      {}
    );
    console.log('Chat response invalid response:', responseInvalidResponse);
    
    // 5. Test the chat response endpoint with valid params
    const responseValidResponse = await makePostRequest(
      `http://localhost:${port}/api/chat/response`, 
      { clientId: 'test-client', response: 'Test response' }
    );
    console.log('Chat response valid response:', responseValidResponse);
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    // Close the server
    console.log('Closing server');
    await new Promise(resolve => {
      server.close(() => {
        console.log('Server closed');
        resolve();
      });
    });
  }
  
  console.log('Test completed successfully');
}

// Helper function to make HTTP GET requests
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

// Helper function to make HTTP POST requests
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

// Run the test
testServer()
  .then(() => {
    console.log('Test finished successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  }); 