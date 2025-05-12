/**
 * Simple logger utility for Athenic backend
 */

// Basic log levels
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
};

// Default log level from environment or INFO
const DEFAULT_LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();

// Determine if we should log based on log level
function shouldLog(level) {
  const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };
  
  return levels[level] <= levels[DEFAULT_LOG_LEVEL];
}

// Prefixes log messages with timestamp and level
function formatLogMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

/**
 * Logger object with methods for different log levels
 */
const logger = {
  error(...args) {
    if (shouldLog(LOG_LEVELS.ERROR)) {
      console.error(formatLogMessage(LOG_LEVELS.ERROR, args.join(' ')));
    }
  },
  
  warn(...args) {
    if (shouldLog(LOG_LEVELS.WARN)) {
      console.warn(formatLogMessage(LOG_LEVELS.WARN, args.join(' ')));
    }
  },
  
  info(...args) {
    if (shouldLog(LOG_LEVELS.INFO)) {
      console.info(formatLogMessage(LOG_LEVELS.INFO, args.join(' ')));
    }
  },
  
  debug(...args) {
    if (shouldLog(LOG_LEVELS.DEBUG)) {
      console.debug(formatLogMessage(LOG_LEVELS.DEBUG, args.join(' ')));
    }
  },
  
  // Log a request with useful info
  request(req, extra = {}) {
    if (shouldLog(LOG_LEVELS.INFO)) {
      const message = `${req.method} ${req.originalUrl || req.url} from ${req.ip}`;
      this.info(message, extra);
    }
  },
  
  // Log a response with status code and timing info
  response(req, res, startTime) {
    if (shouldLog(LOG_LEVELS.INFO)) {
      const duration = Date.now() - startTime;
      const message = `${req.method} ${req.originalUrl || req.url} responded ${res.statusCode} in ${duration}ms`;
      this.info(message);
    }
  }
};

// Convert to ES modules export
export { logger, LOG_LEVELS }; 