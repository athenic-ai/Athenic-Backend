// A standalone Jest test file that only tests the health endpoint
const request = require('supertest');
const express = require('express');

// Create a simple Express app for testing
const app = express();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'test-api' });
});

describe('Simple API Test', () => {
  test('GET /api/health returns healthy status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('service', 'test-api');
  });
});

// A super simple test to verify the test runner
describe('Simple test', () => {
  it('should pass', () => {
    console.log('This test is running');
    expect(true).toBe(true);
  });
  
  it('should fail', () => {
    console.log('This test is also running');
    expect(false).toBe(true);
  });
}); 