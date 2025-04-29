import * as fs from 'fs';
import * as path from 'path';
import Logger from './logger';

/**
 * Ensures that necessary log directories exist in the project
 */
export const ensureLogDirectories = (): void => {
  const logger = Logger.getLogger({ component: 'LogSetup' });
  
  try {
    // Main logs directory
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      logger.info(`Creating main logs directory: ${logsDir}`);
      fs.mkdirSync(logsDir, { recursive: true });
    } else {
      logger.debug(`Logs directory already exists: ${logsDir}`);
    }
    
    // Ensure the logs directory is writable
    try {
      const testFile = path.join(logsDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      logger.debug('Logs directory is writable');
    } catch (err) {
      logger.error('Logs directory is not writable!', err);
      throw new Error('Logs directory is not writable. Check permissions.');
    }
    
    logger.info('Log directories setup complete');
  } catch (err) {
    logger.error('Failed to set up log directories', err);
    throw err;
  }
};

export default ensureLogDirectories; 