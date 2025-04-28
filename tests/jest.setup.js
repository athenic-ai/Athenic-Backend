// Set up environment variables for testing
process.env.SUPABASE_URL = 'https://test-supabase-url.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENAI_API_KEY = 'test-openai-api-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-api-key';
process.env.SENTRY_DSN = 'test-sentry-dsn';
process.env.SB_REGION = 'test-region';
process.env.SB_EXECUTION_ID = 'test-execution-id';

// Set up any global test configuration here
process.env.NODE_ENV = 'test';

// Mock the console methods to reduce noise during tests
global.console = {
  ...console,
  // Comment out these lines to see the console output during tests
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Deno.env.get to return our test environment variables
global.Deno = {
  env: {
    get: (key) => process.env[key] || null,
  },
};

// Add any additional test setup here 