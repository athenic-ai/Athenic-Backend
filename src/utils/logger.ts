import * as fs from 'fs';
import * as path from 'path';

/**
 * Log levels in order of increasing severity
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN', 
  ERROR = 'ERROR'
}

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /**
   * The name of the component/module doing the logging
   */
  component: string;
  
  /**
   * Log file path. If not specified, will use logs/[component]-YYYY-MM-DD.log
   */
  logFile?: string;
  
  /**
   * Minimum log level to output (e.g., if set to WARN, DEBUG and INFO logs won't be written)
   * Defaults to DEBUG (all logs will be shown)
   */
  minLevel?: LogLevel;
  
  /**
   * Whether to also log to console. Defaults to true.
   */
  console?: boolean;
}

/**
 * Represents a logger for a specific component with file and optional console output
 */
export class Logger {
  private component: string;
  private logFile: string;
  private minLevel: LogLevel;
  private console: boolean;
  private static loggers: Map<string, Logger> = new Map();
  
  /**
   * Get a logger instance for a specific component
   * @param options Logger configuration options
   * @returns Logger instance
   */
  public static getLogger(options: LoggerOptions): Logger {
    const { component } = options;
    
    if (this.loggers.has(component)) {
      return this.loggers.get(component)!;
    }
    
    const logger = new Logger(options);
    this.loggers.set(component, logger);
    return logger;
  }
  
  /**
   * Shutdown all loggers and close file streams
   */
  public static shutdownAll(): void {
    console.log('Shutting down all loggers...');
    this.loggers.forEach(logger => logger.shutdown());
    this.loggers.clear();
  }
  
  private constructor(options: LoggerOptions) {
    const { component, logFile, minLevel = LogLevel.DEBUG, console = true } = options;
    
    this.component = component;
    this.minLevel = minLevel;
    this.console = console;
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create or use specified log file
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.logFile = logFile || path.join(logsDir, `${component.toLowerCase()}-${today}.log`);
    
    // Make sure the file exists by writing an empty string if needed
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
    }
    
    // Setup process termination handlers
    process.on('exit', () => this.shutdown());
    process.on('SIGINT', () => {
      this.shutdown();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.shutdown();
      process.exit(0);
    });
    
    // Log startup message
    this.info(`Logger initialized for ${component} -> ${this.logFile}`);
  }
  
  /**
   * Log a message at DEBUG level
   * @param message Message to log
   * @param meta Additional data to log
   */
  public debug(message: string, meta?: any): void {
    this.log(LogLevel.DEBUG, message, meta);
  }
  
  /**
   * Log a message at INFO level
   * @param message Message to log
   * @param meta Additional data to log
   */
  public info(message: string, meta?: any): void {
    this.log(LogLevel.INFO, message, meta);
  }
  
  /**
   * Log a message at WARN level
   * @param message Message to log
   * @param meta Additional data to log
   */
  public warn(message: string, meta?: any): void {
    this.log(LogLevel.WARN, message, meta);
  }
  
  /**
   * Log a message at ERROR level
   * @param message Message to log 
   * @param meta Additional data (can be an Error object)
   */
  public error(message: string, meta?: any): void {
    this.log(LogLevel.ERROR, message, meta);
  }
  
  /**
   * Log an error with stack trace
   * @param err Error object
   * @param message Optional additional message
   */
  public logError(err: Error, message?: string): void {
    const errMsg = message ? `${message}: ${err.message}` : err.message;
    this.error(errMsg, { stack: err.stack });
  }
  
  /**
   * Close the log file stream
   */
  public shutdown(): void {
    this.info('Logger shutting down');
  }
  
  /**
   * Main logging function
   * @param level Log level
   * @param message Message to log
   * @param meta Additional data to log
   */
  private log(level: LogLevel, message: string, meta?: any): void {
    // Check if we should log this level
    if (!this.shouldLog(level)) {
      return;
    }
    
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] [${level}] [${this.component}] ${message}`;
    
    // Format any additional data
    let metaStr = '';
    if (meta) {
      if (meta instanceof Error) {
        metaStr = `\n${meta.stack || meta.toString()}`;
      } else if (typeof meta === 'object') {
        try {
          metaStr = `\n${JSON.stringify(meta, null, 2)}`;
        } catch (e) {
          metaStr = `\n[Object could not be stringified]`;
        }
      } else {
        metaStr = `\n${meta}`;
      }
    }
    
    logMessage += metaStr;
    
    // Write to file using synchronous operation to ensure it's written
    try {
      fs.appendFileSync(this.logFile, logMessage + '\n', 'utf8');
    } catch (err) {
      console.error(`Failed to write to log file ${this.logFile}:`, err);
    }
    
    // Also log to console if enabled
    if (this.console) {
      const consoleMethod = this.getConsoleMethod(level);
      consoleMethod(logMessage);
    }
  }
  
  /**
   * Determine if a log level should be logged based on minimum level setting
   * @param level Log level to check
   * @returns True if the level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minLevelIndex = levels.indexOf(this.minLevel);
    const logLevelIndex = levels.indexOf(level);
    
    return logLevelIndex >= minLevelIndex;
  }
  
  /**
   * Get the appropriate console method for the log level
   * @param level Log level
   * @returns Console method to use
   */
  private getConsoleMethod(level: LogLevel): (message: string) => void {
    switch (level) {
      case LogLevel.ERROR:
        return console.error;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.DEBUG:
      default:
        return console.log;
    }
  }
}

// Setup clean shutdown when process exits
process.on('exit', () => {
  Logger.shutdownAll();
});

// Handle CTRL+C
process.on('SIGINT', () => {
  Logger.shutdownAll();
  process.exit(0);
});

// Handle process kill
process.on('SIGTERM', () => {
  Logger.shutdownAll();
  process.exit(0);
});

// Example of creating a logger:
// const logger = Logger.getLogger({ component: 'API' });
// logger.info('Application started');
// logger.error('Something went wrong', { details: 'Error details' });

export default Logger; 