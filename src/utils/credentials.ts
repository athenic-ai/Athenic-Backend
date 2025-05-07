/**
 * Credentials Utility
 * 
 * This utility provides functions to securely encrypt and decrypt credential data
 * for storage in the database, particularly for MCP server connections.
 */

import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get the encryption key from environment
const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.error('CREDENTIAL_ENCRYPTION_KEY environment variable is not set.');
  console.error('Sensitive credentials will not be encrypted properly!');
}

// Initialization Vector length for AES-256-CBC
const IV_LENGTH = 16;

/**
 * Encrypt sensitive data (like API keys or credentials)
 * 
 * @param data The plain text data to encrypt
 * @returns The encrypted data as a base64 string with IV prepended
 */
export function encryptCredential(data: string): string {
  try {
    if (!ENCRYPTION_KEY) {
      throw new Error('Encryption key is not set');
    }
    
    // If the data is empty, return empty string
    if (!data) {
      return '';
    }
    
    // Create a random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher using AES-256-CBC with the encryption key and IV
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    // Encrypt the data
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Prepend the IV to the encrypted data and return as base64
    // This allows us to use a different IV for each encryption
    return Buffer.concat([iv, Buffer.from(encrypted, 'base64')]).toString('base64');
  } catch (error: unknown) {
    console.error('Error encrypting credential:', error);
    throw new Error('Failed to encrypt credential data');
  }
}

/**
 * Decrypt previously encrypted data
 * 
 * @param encryptedData The encrypted data (with IV prepended) as a base64 string
 * @returns The decrypted plain text
 */
export function decryptCredential(encryptedData: string): string {
  try {
    if (!ENCRYPTION_KEY) {
      throw new Error('Encryption key is not set');
    }
    
    // If the encrypted data is empty, return empty string
    if (!encryptedData) {
      return '';
    }
    
    // Convert the encrypted data from base64 to buffer
    const encryptedBuffer = Buffer.from(encryptedData, 'base64');
    
    // Extract the IV from the beginning of the buffer
    const iv = encryptedBuffer.slice(0, IV_LENGTH);
    
    // Extract the actual encrypted data after the IV
    const encrypted = encryptedBuffer.slice(IV_LENGTH).toString('base64');
    
    // Create decipher using AES-256-CBC with the encryption key and extracted IV
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error: unknown) {
    console.error('Error decrypting credential:', error);
    throw new Error('Failed to decrypt credential data');
  }
}

/**
 * Encrypt a record of credentials (key-value pairs)
 * 
 * @param credentials Record containing credential key-value pairs
 * @returns Record with the same keys but encrypted values
 */
export function encryptCredentialRecord(credentials: Record<string, string>): Record<string, string> {
  const encryptedCredentials: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(credentials)) {
    // Only encrypt non-empty values
    if (value) {
      encryptedCredentials[key] = encryptCredential(value);
    } else {
      encryptedCredentials[key] = value;
    }
  }
  
  return encryptedCredentials;
}

/**
 * Decrypt a record of encrypted credentials (key-value pairs)
 * 
 * @param encryptedCredentials Record containing encrypted credential key-value pairs
 * @returns Record with the same keys but decrypted values
 */
export function decryptCredentialRecord(encryptedCredentials: Record<string, string>): Record<string, string> {
  const decryptedCredentials: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(encryptedCredentials)) {
    // Only decrypt non-empty values
    if (value) {
      decryptedCredentials[key] = decryptCredential(value);
    } else {
      decryptedCredentials[key] = value;
    }
  }
  
  return decryptedCredentials;
}

/**
 * Determine if a credential might need encryption
 * (useful for filtering which fields should be encrypted)
 * 
 * @param key The credential key name
 * @returns True if the credential likely needs encryption
 */
export function isSensitiveCredential(key: string): boolean {
  // Keys that likely contain sensitive data that should be encrypted
  const sensitiveKeyPatterns = [
    /api[_-]?key/i,    // api_key, apikey, api-key
    /access[_-]?token/i, // access_token, accesstoken
    /secret/i,         // secret, app_secret
    /password/i,       // password
    /token/i,          // token, refresh_token
    /auth/i,           // auth, oauth
    /key/i,            // key, private_key, public_key
    /credential/i      // credential
  ];
  
  return sensitiveKeyPatterns.some(pattern => pattern.test(key));
}

/**
 * Intelligently encrypt a credentials record by only encrypting sensitive fields
 * 
 * @param credentials Record of credential key-value pairs
 * @returns Record with sensitive values encrypted
 */
export function encryptSensitiveCredentials(credentials: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(credentials)) {
    if (value && isSensitiveCredential(key)) {
      result[key] = encryptCredential(value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
} 