// Increase default test timeout to accommodate E2B operations
jest.setTimeout(30000); // 30 seconds

// Silence console output during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

if (process.env.VERBOSE_TESTS !== 'true') {
  console.log = (...args) => {};
  console.error = (...args) => {};
  console.warn = (...args) => {};
}

// Restore console functions after all tests
afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
}); 