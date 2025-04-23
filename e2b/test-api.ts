import fetch from 'node-fetch';

// Test the health endpoint
async function testHealthEndpoint() {
  try {
    const response = await fetch('http://localhost:4000/health');
    const data = await response.json();
    console.log('Health endpoint:', data);
  } catch (error) {
    console.error('Health endpoint error:', error);
  }
}

// Test code execution
async function testCodeExecution() {
  try {
    const pythonCode = 'import time\nprint("Hello from Python!")\ntime.sleep(1)\nprint("After 1 second delay")\n2 + 2';
    
    const response = await fetch('http://localhost:4000/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: pythonCode,
        timeout: 10000
      })
    });
    
    const result = await response.json();
    console.log('Execute result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Execute error:', error);
  }
}

// Run tests
async function runTests() {
  console.log('Testing E2B server API...');
  
  await testHealthEndpoint();
  await testCodeExecution();
  
  console.log('Tests completed.');
}

runTests().catch(console.error); 