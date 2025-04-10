# Athenic Backend Tests

This directory contains tests for the Athenic Backend. The tests are organized into unit tests and integration tests.

## Setup

### Prerequisites

- Node.js v18 or higher
- npm

### Installation

To install the dependencies for running tests:

```bash
# Use nvm to ensure the correct Node.js version
nvm use 18

# Install dependencies
npm install
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests with watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

The tests are organized into the following directory structure:

```
tests/
  ├── mocks/                 # Shared test mocks
  ├── unit/                  # Unit tests for individual components
  │   ├── configs/           # Tests for configuration functions
  │   ├── services/          # Tests for services
  │   │   ├── nlp/           # Tests for NLP services
  │   │   └── storage/       # Tests for storage services
  │   └── jobs/              # Tests for job-related functionality
  └── integration/           # Integration tests
      └── jobs/              # End-to-end job execution tests
```

## Mocks

The following mocks are provided for testing:

- `supabaseMock.ts`: A mock implementation of the Supabase client

## Unit Tests

### Config Tests

Tests for utility functions in the `configs` module, including:

- `stringify`: For handling circular references in objects
- `getOrganisationObjectTypes`: For retrieving object types from storage
- `getObjectMetadataTypes`: For retrieving metadata types
- `createObjectTypeDescriptions`: For creating object type descriptions

### Service Tests

#### Storage Service Tests

Tests for the `StorageService` class, which handles interactions with the Supabase database:

- `getRow`: For retrieving single rows from the database
- `getRows`: For retrieving multiple rows with filters
- `updateRow`: For updating rows in the database

#### NLP Service Tests

Tests for the `NlpService` class, which handles interactions with AI services:

- `initialiseClientCore`: For initializing the OpenRouter client
- `initialiseClientOpenAi`: For initializing the OpenAI client
- `setMemberVariables`: For setting member variables
- `execute`: For executing NLP functions

### Job Tests

Tests for the `ExecuteJobs` class, which handles executing jobs:

- `start`: For starting job execution
- Error handling

## Integration Tests

### Job Execution Tests

End-to-end tests for job execution flow:

- Successful job execution
- Handling failures in job execution

## Adding New Tests

When adding new tests, follow these guidelines:

1. Place unit tests in the appropriate subdirectory under `tests/unit/`
2. Place integration tests in `tests/integration/`
3. Create mocks for external dependencies
4. Use descriptive test names that explain what is being tested

## Best Practices

- Mock external dependencies
- Test one thing at a time
- Use descriptive test names
- Arrange, Act, Assert pattern
- Clean up after tests
- Avoid test interdependence 