// Global setup for Jest tests

// Increase timeout for all tests
jest.setTimeout(30000);

// Mock any environment variables needed for testing
process.env.NODE_ENV = 'test';
process.env.API_SERVER_PORT = '3333'; // Use a specific port for tests

// Mock Inngest client by default
jest.mock('./src/inngest/client', () => {
  console.log('Global mock for Inngest client applied');
  return {
    inngest: {
      send: jest.fn().mockResolvedValue({}),
    },
    testInngestConnection: jest.fn().mockResolvedValue(true),
  };
});

// Mock Supabase client by default
jest.mock('./src/api/supabase', () => {
  console.log('Global mock for Supabase client applied');
  return {
    createSupabaseClient: jest.fn().mockReturnValue({
      auth: {
        getUser: jest.fn().mockImplementation((token) => {
          if (token === 'valid-token') {
            return Promise.resolve({
              data: {
                user: {
                  id: 'test-user-id',
                  email: 'test@example.com',
                },
              },
              error: null,
            });
          } else {
            return Promise.resolve({
              data: { user: null },
              error: {
                message: 'Invalid token',
              },
            });
          }
        }),
      },
    }),
  };
});

// Setup global console overrides for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  // Filter out some React-specific warnings
  if (
    typeof args[0] === 'string' && 
    (args[0].includes('Warning:') || args[0].includes('Error:'))
  ) {
    return;
  }
  originalConsoleError(...args);
};

console.warn = (...args) => {
  // Filter out some warnings
  if (
    typeof args[0] === 'string' && 
    args[0].includes('Warning:')
  ) {
    return;
  }
  originalConsoleWarn(...args);
};

// Handle open handles and timers automatically
beforeAll(() => {
  jest.useFakeTimers();
});

// Setup global cleanup
afterAll(() => {
  // Restore original console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  
  // Clean up all mocks
  jest.restoreAllMocks();
  
  // Reset timers
  jest.useRealTimers();
  
  // Force garbage collection if possible to help clean up resources
  if (global.gc) {
    global.gc();
  }
}); 