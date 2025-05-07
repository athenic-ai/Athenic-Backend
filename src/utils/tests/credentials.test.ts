import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  encryptCredential,
  decryptCredential,
  encryptCredentialRecord,
  decryptCredentialRecord,
  isSensitiveCredential,
  encryptSensitiveCredentials
} from '../credentials.js';

// Mock environment variables
const originalEnv = process.env;

describe('Credentials Utility', () => {
  // Setup mock environment before each test
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-only';
  });

  // Restore original environment after each test
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('encryptCredential and decryptCredential', () => {
    it('should encrypt and decrypt credentials correctly', () => {
      // Arrange
      const plaintext = 'secret-api-key-12345';
      
      // Act
      const encrypted = encryptCredential(plaintext);
      const decrypted = decryptCredential(encrypted);
      
      // Assert
      expect(encrypted).not.toBe(plaintext); // Encrypted result should be different
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/); // Should be base64 encoded
      expect(decrypted).toBe(plaintext); // Decryption should restore original value
    });

    it('should handle empty strings', () => {
      // Arrange
      const plaintext = '';
      
      // Act
      const encrypted = encryptCredential(plaintext);
      const decrypted = decryptCredential(encrypted);
      
      // Assert
      expect(encrypted).toBe('');
      expect(decrypted).toBe('');
    });

    it('should throw an error when encryption key is not set', () => {
      // Arrange
      process.env.CREDENTIAL_ENCRYPTION_KEY = '';
      
      // Act & Assert
      expect(() => encryptCredential('test')).toThrow('Encryption key is not set');
      expect(() => decryptCredential('test')).toThrow('Encryption key is not set');
    });
  });

  describe('encryptCredentialRecord and decryptCredentialRecord', () => {
    it('should encrypt and decrypt all values in a record', () => {
      // Arrange
      const record: Record<string, string> = {
        api_key: 'secret-api-key',
        username: 'admin',
        password: 'password123'
      };
      
      // Act
      const encrypted = encryptCredentialRecord(record);
      const decrypted = decryptCredentialRecord(encrypted);
      
      // Assert
      Object.keys(record).forEach(key => {
        expect(encrypted[key]).not.toBe(record[key]); // Each value should be encrypted
        expect(decrypted[key]).toBe(record[key]); // Each value should decrypt correctly
      });
    });

    it('should handle empty values', () => {
      // Arrange
      const record: Record<string, string | undefined> = {
        api_key: 'secret-api-key',
        username: '',
        password: undefined
      };
      
      // Act
      const encrypted = encryptCredentialRecord(record as Record<string, string>);
      const decrypted = decryptCredentialRecord(encrypted);
      
      // Assert
      expect(encrypted.api_key).not.toBe(record.api_key);
      expect(encrypted.username).toBe('');
      expect(encrypted.password).toBe(undefined);
      expect(decrypted.api_key).toBe(record.api_key);
      expect(decrypted.username).toBe('');
      expect(decrypted.password).toBe(undefined);
    });
  });

  describe('isSensitiveCredential', () => {
    it('should identify sensitive credential keys', () => {
      // Arrange
      const sensitiveKeys = [
        'api_key', 
        'apiKey', 
        'accessToken', 
        'secret',
        'app_secret',
        'password',
        'token',
        'authToken',
        'privateKey',
        'credential'
      ];
      
      const nonSensitiveKeys = [
        'username',
        'email',
        'name',
        'description',
        'enabled',
        'url',
        'endpoint'
      ];
      
      // Act & Assert
      sensitiveKeys.forEach(key => {
        expect(isSensitiveCredential(key)).toBe(true);
      });
      
      nonSensitiveKeys.forEach(key => {
        expect(isSensitiveCredential(key)).toBe(false);
      });
    });
  });

  describe('encryptSensitiveCredentials', () => {
    it('should only encrypt sensitive fields', () => {
      // Arrange
      const record: Record<string, string> = {
        api_key: 'secret-api-key',
        token: 'secret-token',
        username: 'admin',
        url: 'https://example.com'
      };
      
      // Act
      const encrypted = encryptSensitiveCredentials(record);
      const decrypted = decryptCredentialRecord(encrypted);
      
      // Assert
      expect(encrypted.api_key).not.toBe(record.api_key); // Should be encrypted
      expect(encrypted.token).not.toBe(record.token); // Should be encrypted
      expect(encrypted.username).toBe(record.username); // Should not be encrypted
      expect(encrypted.url).toBe(record.url); // Should not be encrypted
      
      expect(decrypted.api_key).toBe(record.api_key);
      expect(decrypted.token).toBe(record.token);
      expect(decrypted.username).toBe(record.username);
      expect(decrypted.url).toBe(record.url);
    });

    it('should handle empty sensitive values', () => {
      // Arrange
      const record: Record<string, string | undefined> = {
        api_key: '',
        token: undefined,
        username: 'admin',
      };
      
      // Act
      const encrypted = encryptSensitiveCredentials(record as Record<string, string>);
      
      // Assert
      expect(encrypted.api_key).toBe(''); // Empty sensitive field should remain empty
      expect(encrypted.token).toBe(undefined); // Undefined sensitive field should remain undefined
      expect(encrypted.username).toBe('admin'); // Non-sensitive field should remain the same
    });
  });
}); 