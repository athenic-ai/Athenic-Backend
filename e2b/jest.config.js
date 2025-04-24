/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      isolatedModules: true
    }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 60000, // 60 seconds
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/mocks/',
    '/tests/helpers/',
    '/dist/'
  ],
  coverageReporters: ['text', 'html'],
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ]
}; 