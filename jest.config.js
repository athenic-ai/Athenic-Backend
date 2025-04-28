/** @type {import('ts-jest').JestConfigWithTsJest} */
console.log('##### LOADING JEST CONFIG FILE #####');
console.log('Current working directory:', process.cwd());
console.log('Node version:', process.version);

const config = {
  // Test environment
  testEnvironment: 'node',
  
  // Test patterns
  testMatch: [
    "**/__tests__/**/*.js?(x)",
    "**/?(*.)+(spec|test).js?(x)",
    "**/__tests__/**/*.ts?(x)",
    "**/?(*.)+(spec|test).ts?(x)"
  ],
  
  // File extensions
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  
  // Babel for ESM support
  transform: {
    "^.+\\.(ts|tsx|js|jsx)$": "babel-jest"
  },
  
  // Path mappings (match tsconfig.json paths)
  moduleNameMapper: {
    "^@e2b/(.*)$": "<rootDir>/e2b/src/$1",
    "^@e2b/e2b-service$": "<rootDir>/e2b/src/e2b-service"
  },
  
  // Handle ESM modules in node_modules
  transformIgnorePatterns: [
    "/node_modules/(?!(@inngest|@dmitryrechkin|zod|axios)/)"
  ],
  
  // Timeout configuration (30 seconds)
  testTimeout: 30000,
  
  // Reporter configuration
  reporters: ["default"],
  verbose: true,
  
  // Force exit after tests complete
  forceExit: true
};

console.log('##### CONFIG LOADED #####');
module.exports = config;