import Logger, { LogLevel } from '../utils/logger';
import ensureLogDirectories from '../utils/ensure-log-dirs';

async function testLogs() {
  // Ensure log directories exist
  ensureLogDirectories();
  
  // Create a test logger
  const logger = Logger.getLogger({
    component: 'LogTest',
    minLevel: LogLevel.DEBUG
  });
  
  logger.info('===== STARTING LOG TEST =====');
  
  // Log messages at different levels
  logger.debug('This is a DEBUG message');
  logger.info('This is an INFO message');
  logger.warn('This is a WARN message');
  logger.error('This is an ERROR message');
  
  // Log with metadata
  logger.info('Message with metadata', { 
    userId: '12345',
    action: 'test',
    timestamp: new Date().toISOString()
  });
  
  // Log errors with stack trace
  try {
    throw new Error('Test error');
  } catch (err) {
    if (err instanceof Error) {
      logger.logError(err, 'Caught an error during testing');
    }
  }
  
  // Test filtering by changing min level
  const restrictedLogger = Logger.getLogger({
    component: 'RestrictedLogger',
    minLevel: LogLevel.WARN
  });
  
  // These should not appear in the log file
  restrictedLogger.debug('This DEBUG message should be filtered out');
  restrictedLogger.info('This INFO message should be filtered out');
  
  // These should appear
  restrictedLogger.warn('This WARN message should be shown');
  restrictedLogger.error('This ERROR message should be shown');
  
  logger.info('===== LOG TEST COMPLETE =====');
  
  // Test cleanup
  Logger.shutdownAll();
}

// Run the test if this file is executed directly
if (require.main === module) {
  testLogs()
    .then(() => {
      console.log('Log test completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Log test failed:', err);
      process.exit(1);
    });
} 