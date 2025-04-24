/**
 * Jest setup file for E2B tests
 * Configures all the necessary test helpers and mocks
 */

import { jest } from '@jest/globals';

// Increase default timeout for tests to 30 seconds to accommodate E2B operations
jest.setTimeout(30000);

// Before all tests
beforeAll(() => {
  // Clear all mocks before running tests
  jest.clearAllMocks();
});

// After all tests
afterAll(() => {
  // Clean up all mocks after tests
  jest.clearAllMocks();
});

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

// Silence console output during tests unless in verbose mode
if (!process.env.VERBOSE_TESTS) {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  console.info = jest.fn();
  console.debug = jest.fn();

  // Restore console after all tests
  afterAll(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.info = originalConsoleInfo;
    console.debug = originalConsoleDebug;
  });
} 