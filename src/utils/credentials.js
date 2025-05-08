const crypto = require('crypto');
const { logger } = require('./logger');

/**
 * Encrypts sensitive credential fields to store them in the database
 */
function encryptSensitiveFields(data) {
  if (!data) return {};
  
  const result = {};
  const encryptionKey = process.env.ENCRYPT_SALT || 'athenic-salt';
  
  // Patterns for identifying sensitive fields
  const sensitivePatterns = [
    /api[_-]?key/i,
    /token/i,
    /secret/i,
    /password/i,
    /credential/i,
    /auth/i
  ];
  
  for (const [key, value] of Object.entries(data)) {
    // Only encrypt non-empty sensitive values
    if (value && sensitivePatterns.some(pattern => pattern.test(key))) {
      try {
        // Use AES-256-CBC for stronger encryption
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(
          'aes-256-cbc', 
          crypto.createHash('sha256').update(encryptionKey).digest().slice(0, 32),
          iv
        );
        
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Store IV with the encrypted value (IV needs to be known for decryption)
        result[key] = `${iv.toString('hex')}:${encrypted}`;
      } catch (error) {
        logger.error(`Error encrypting field ${key}:`, error);
        // Fall back to storing as-is if encryption fails
        result[key] = value;
      }
    } else {
      // Store non-sensitive values as-is
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Decrypts sensitive credential fields for use in runtime
 */
function decryptSensitiveFields(data) {
  if (!data) return {};
  
  const result = {};
  const encryptionKey = process.env.ENCRYPT_SALT || 'athenic-salt';
  
  // Patterns for identifying sensitive fields
  const sensitivePatterns = [
    /api[_-]?key/i,
    /token/i,
    /secret/i,
    /password/i,
    /credential/i,
    /auth/i
  ];
  
  for (const [key, value] of Object.entries(data)) {
    // Only decrypt non-empty sensitive values that appear to be encrypted
    if (value && sensitivePatterns.some(pattern => pattern.test(key)) && value.includes(':')) {
      try {
        const [ivHex, encryptedHex] = value.split(':');
        
        // Only attempt decryption if the value follows the expected format
        if (ivHex && encryptedHex) {
          const iv = Buffer.from(ivHex, 'hex');
          const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            crypto.createHash('sha256').update(encryptionKey).digest().slice(0, 32),
            iv
          );
          
          let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          
          result[key] = decrypted;
        } else {
          // If not in the expected format, return as-is
          result[key] = value;
        }
      } catch (error) {
        logger.error(`Error decrypting field ${key}:`, error);
        // Return encrypted value if decryption fails
        result[key] = value;
      }
    } else {
      // Non-sensitive or not appearing to be encrypted
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Simplified encryption for Edge Functions where Node.js crypto may not be available
 */
function encryptForEdgeFunction(text, secret) {
  if (!text) return '';
  
  // This is a simple XOR-based encryption, not as secure as AES
  // but works for edge functions where we don't have full Node.js crypto
  let result = '';
  for (let i = 0; i < text.length; i++) {
    // XOR each character with a character from the secret
    const secretChar = secret.charCodeAt(i % secret.length);
    const textChar = text.charCodeAt(i);
    const encryptedChar = textChar ^ secretChar;
    result += String.fromCharCode(encryptedChar);
  }
  
  return Buffer.from(result).toString('base64');
}

/**
 * Simplified decryption for Edge Functions where Node.js crypto may not be available
 */
function decryptForEdgeFunction(encryptedText, secret) {
  if (!encryptedText) return '';
  
  try {
    // Decode base64
    const decoded = Buffer.from(encryptedText, 'base64').toString();
    
    // Decrypt with the same XOR operation (it's symmetric)
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      const secretChar = secret.charCodeAt(i % secret.length);
      const encryptedChar = decoded.charCodeAt(i);
      const decryptedChar = encryptedChar ^ secretChar;
      result += String.fromCharCode(decryptedChar);
    }
    
    return result;
  } catch (error) {
    logger.error('Error decrypting:', error);
    return '';
  }
}

module.exports = {
  encryptSensitiveFields,
  decryptSensitiveFields,
  encryptForEdgeFunction,
  decryptForEdgeFunction
}; 