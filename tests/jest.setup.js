// Set up environment variables for testing
process.env.SUPABASE_URL = 'https://test-supabase-url.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENAI_API_KEY = 'test-openai-api-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-api-key';
process.env.SENTRY_DSN = 'test-sentry-dsn';
process.env.SB_REGION = 'test-region';
process.env.SB_EXECUTION_ID = 'test-execution-id';

// Global test setup
global.console = {
  ...console,
  // Uncomment to disable specific console methods during tests
  // log: jest.fn(),
  // info: jest.fn(),
  // debug: jest.fn(),
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