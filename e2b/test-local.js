// Test script to verify E2B service
const http = require('http');

const requestData = {
  code: 'echo "Hello from E2B"',
  clientId: 'test-client-' + Date.now(),
  language: 'code-interpreter-v1',
  timeout: 30000
};

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/execute-stream',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(JSON.stringify(requestData))
  }
};

console.log('Sending request to E2B service...');
console.log('Request data:', requestData);

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    console.log(`BODY CHUNK: ${chunk}`);
  });
  
  res.on('end', () => {
    console.log('Response data:', data);
    try {
      const parsedData = JSON.parse(data);
      console.log('Parsed response:', parsedData);
      console.log('SUCCESS: E2B service responded correctly!');
      console.log(`To connect to WebSocket, use clientId: ${requestData.clientId}`);
    } catch (e) {
      console.error('Error parsing response:', e);
    }
  });
});

req.on('error', (e) => {
  console.error(`ERROR: ${e.message}`);
  console.error('Make sure the E2B service is running on port 4000');
});

req.write(JSON.stringify(requestData));
req.end(); 