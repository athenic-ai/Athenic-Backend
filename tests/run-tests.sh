#!/bin/bash

# Function to display help
show_help() {
  echo "Usage: ./run-tests.sh [options]"
  echo ""
  echo "Options:"
  echo "  -a, --all            Run all tests"
  echo "  -u, --unit           Run all unit tests"
  echo "  -i, --integration    Run all integration tests"
  echo "  -c, --component NAME Run tests for a specific component"
  echo "                       (e.g., storage, nlp, config, jobs)"
  echo "  -w, --watch          Run tests in watch mode"
  echo "  --coverage           Generate test coverage report"
  echo "  -h, --help           Show this help"
  echo ""
  echo "Examples:"
  echo "  ./run-tests.sh -a                # Run all tests"
  echo "  ./run-tests.sh -u                # Run all unit tests"
  echo "  ./run-tests.sh -c storage        # Run storage tests"
  echo "  ./run-tests.sh -c jobs -w        # Run jobs tests in watch mode"
  echo "  ./run-tests.sh -i --coverage     # Run integration tests with coverage"
}

# Default values
RUN_ALL=false
RUN_UNIT=false
RUN_INTEGRATION=false
COMPONENT=""
WATCH_MODE=false
COVERAGE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -a|--all)
      RUN_ALL=true
      shift
      ;;
    -u|--unit)
      RUN_UNIT=true
      shift
      ;;
    -i|--integration)
      RUN_INTEGRATION=true
      shift
      ;;
    -c|--component)
      COMPONENT="$2"
      shift 2
      ;;
    -w|--watch)
      WATCH_MODE=true
      shift
      ;;
    --coverage)
      COVERAGE=true
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

# Use the correct Node.js version
if command -v nvm &> /dev/null; then
  echo "Using Node.js 18..."
  nvm use 18 || { echo "Failed to switch to Node.js 18. Please install it with 'nvm install 18'."; exit 1; }
fi

# Build test command
TEST_CMD="npm test"

if [ "$WATCH_MODE" = true ]; then
  TEST_CMD="npm run test:watch"
fi

if [ "$COVERAGE" = true ]; then
  TEST_CMD="npm run test:coverage"
fi

# Add test pattern based on options
if [ "$RUN_ALL" = true ]; then
  echo "Running all tests..."
  eval "$TEST_CMD"
elif [ "$RUN_UNIT" = true ]; then
  echo "Running all unit tests..."
  eval "$TEST_CMD -- \"unit/\""
elif [ "$RUN_INTEGRATION" = true ]; then
  echo "Running all integration tests..."
  eval "$TEST_CMD -- \"integration/\""
elif [ -n "$COMPONENT" ]; then
  echo "Running tests for component: $COMPONENT"
  # Handle special cases
  case "$COMPONENT" in
    storage)
      eval "$TEST_CMD -- \"services/storage\""
      ;;
    nlp)
      eval "$TEST_CMD -- \"services/nlp\""
      ;;
    config|configs)
      eval "$TEST_CMD -- \"configs\""
      ;;
    job|jobs)
      eval "$TEST_CMD -- \"jobs\""
      ;;
    *)
      eval "$TEST_CMD -- \"$COMPONENT\""
      ;;
  esac
else
  # If no specific option, run all tests
  echo "No specific test option provided. Running all tests..."
  eval "$TEST_CMD"
fi 