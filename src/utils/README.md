# Athenic Logging System

This directory contains utilities for the Athenic backend, including a comprehensive logging system that provides structured, level-based logging with both console and file output.

## Logging System

### Features

- **Unified Logger Interface**: A central logging interface for all application components
- **Log Levels**: Support for DEBUG, INFO, WARN, and ERROR log levels
- **File Rotation**: Logs are automatically rotated daily
- **Structured Metadata**: Support for including structured objects/metadata with log entries
- **Error Handling**: Special support for logging errors with stack traces
- **Component Separation**: Each component gets its own log file
- **Graceful Shutdown**: Ensures logs are properly written before application exit

## Usage

### Basic Usage

```typescript
import Logger from '../utils/logger';

// Create a logger for your component
const logger = Logger.getLogger({
  component: 'MyComponent'
});

// Log at different levels
logger.debug('Detailed debugging information');
logger.info('Standard operational messages');
logger.warn('Warning conditions');
logger.error('Error conditions');

// Include metadata
logger.info('User authenticated', { 
  userId: '12345', 
  roles: ['admin', 'user'] 
});

// Log errors with stack traces
try {
  // Something that might throw
} catch (err) {
  if (err instanceof Error) {
    logger.logError(err, 'Operation failed');
  }
}
```

### Configuration Options

When creating a logger, you can specify various options:

```typescript
const logger = Logger.getLogger({
  // Required: Name of your component
  component: 'MyComponent',
  
  // Optional: Minimum log level (defaults to DEBUG)
  minLevel: LogLevel.INFO,
  
  // Optional: Whether to also log to console (defaults to true)
  console: true,
  
  // Optional: Custom log file path (defaults to logs/[component]-YYYY-MM-DD.log)
  logFile: 'path/to/custom.log'
});
```

## Viewing Logs

### Command-line Script

We provide a convenient script for viewing and filtering logs:

```bash
# View logs
./src/scripts/view-logs.sh

# Follow logs (like tail -f)
./src/scripts/view-logs.sh -f

# Filter logs by pattern
./src/scripts/view-logs.sh -g ERROR

# View logs for a specific component
./src/scripts/view-logs.sh -l inngest

# Combine options
./src/scripts/view-logs.sh -f -g "auth" -l api
```

### NPM Scripts

Several npm scripts are available for viewing logs:

```bash
# View logs
npm run logs

# Follow logs
npm run logs:follow

# View only ERROR logs
npm run logs:errors

# Follow Inngest component logs
npm run logs:inngest

# Follow API component logs
npm run logs:api
```

## Implementation Files

- **logger.ts**: Main Logger class implementation
- **ensure-log-dirs.ts**: Utility to ensure log directories exist
- **view-logs.sh**: Bash script for viewing and filtering logs

## Testing the Logger

You can run a quick test of the logging system:

```bash
npm run test:logs
```

This will generate sample logs at all levels and verify that the log files are created correctly.

## Best Practices

1. **Create one logger per component**: Each major component should have its own logger
2. **Use appropriate log levels**: 
   - DEBUG for detailed troubleshooting
   - INFO for general operational messages
   - WARN for warning conditions that don't stop operation
   - ERROR for error conditions that may require attention
3. **Include context in log messages**: Log messages should be self-contained with enough context
4. **Use structured metadata**: For machine-readable data, use the metadata parameter
5. **Don't log sensitive information**: Avoid logging passwords, tokens, or PII
6. **Be consistent with log messages**: Consider standardizing message formats for similar events 