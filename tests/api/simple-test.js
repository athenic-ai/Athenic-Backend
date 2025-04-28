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