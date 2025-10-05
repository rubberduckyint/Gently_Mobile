/**
 * Apple Sign In Client Secret Generator
 * 
 * Generates JWT tokens for Apple Sign In authentication with proper caching
 * and environment-based configuration for production use.
 * 
 * @example NextAuth usage:
 * ```typescript
 * import { generateAppleClientSecret } from './apple-client-secret';
 * 
 * AppleProvider({
 *   clientId: process.env.APPLE_CLIENT_ID!,
 *   clientSecret: generateAppleClientSecret()
 * })
 * ```
 * 
 * @example BetterAuth usage:
 * ```typescript
 * import { generateAppleClientSecret } from './apple-client-secret';
 * 
 * apple({
 *   clientId: process.env.APPLE_CLIENT_ID!,
 *   keyId: process.env.APPLE_KEY_ID!,
 *   teamId: process.env.APPLE_TEAM_ID!,
 *   privateKey: getApplePrivateKey(),
 *   redirectURI: process.env.APPLE_REDIRECT_URI!
 * })
 * ```
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';

/**
 * Required environment variables for Apple Sign In
 */
interface AppleConfig {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKey: string;
  privateKeyPath?: string;
}

/**
 * Cached token information
 */
interface CachedToken {
  token: string;
  expiresAt: number;
  issuedAt: number;
}

// In-memory cache for the generated token
let cachedToken: CachedToken | null = null;

/**
 * Reads and validates Apple configuration from environment variables
 * 
 * @throws {Error} If any required environment variable is missing
 * @returns {AppleConfig} Validated Apple configuration
 */
function getAppleConfig(): AppleConfig {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  const privateKeyPath = process.env.APPLE_PRIVATE_KEY_PATH;

  if (!teamId) {
    throw new Error('APPLE_TEAM_ID environment variable is required');
  }
  
  if (!keyId) {
    throw new Error('APPLE_KEY_ID environment variable is required');
  }
  
  if (!clientId) {
    throw new Error('APPLE_CLIENT_ID environment variable is required');
  }

  if (!privateKey && !privateKeyPath) {
    throw new Error('Either APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_PATH environment variable is required');
  }

  return {
    teamId,
    keyId,
    clientId,
    privateKey: privateKey || '',
    privateKeyPath
  };
}

/**
 * Retrieves the Apple private key from environment or file
 * 
 * Handles both direct environment variable and file path scenarios.
 * Properly processes escaped newlines in environment variables.
 * 
 * @throws {Error} If private key cannot be read or is invalid
 * @returns {string} The Apple private key in PEM format
 */
export function getApplePrivateKey(): string {
  const config = getAppleConfig();
  
  let privateKey = config.privateKey;
  
  // If no direct private key but path is provided, read from file
  if (!privateKey && config.privateKeyPath) {
    try {
      privateKey = fs.readFileSync(config.privateKeyPath, 'utf8');
    } catch (error) {
      throw new Error(
        `Failed to read Apple private key from ${config.privateKeyPath}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
  
  if (!privateKey) {
    throw new Error('Apple private key is empty or could not be loaded');
  }
  
  // Handle escaped newlines in environment variables
  // Replace literal "\n" strings with actual newlines
  privateKey = privateKey.replace(/\\n/g, '\n');
  
  // Validate that we have a proper PEM format
  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
    throw new Error('Apple private key does not appear to be in valid PEM format');
  }
  
  return privateKey;
}

/**
 * Checks if the current cached token is still valid and has more than 7 days remaining
 * 
 * @param {CachedToken | null} token - The cached token to validate
 * @returns {boolean} True if token is valid and has sufficient time remaining
 */
function isCachedTokenValid(token: CachedToken | null): boolean {
  if (!token) {
    return false;
  }
  
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysInSeconds = 7 * 24 * 60 * 60;
  
  // Token is valid if it hasn't expired and has more than 7 days remaining
  return token.expiresAt > now && (token.expiresAt - now) > sevenDaysInSeconds;
}

/**
 * Creates a new Apple client secret JWT
 * 
 * @returns {CachedToken} The newly generated token with metadata
 */
function createAppleClientSecret(): CachedToken {
  const config = getAppleConfig();
  const privateKey = getApplePrivateKey();
  
  const now = Math.floor(Date.now() / 1000);
  const expiration = now + (180 * 24 * 60 * 60); // 180 days from now
  
  const payload = {
    iss: config.teamId,
    sub: config.clientId,
    aud: 'https://appleid.apple.com',
    iat: now,
    exp: expiration
  };
  
  const header = {
    alg: 'ES256' as const,
    kid: config.keyId
  };
  
  try {
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      header
    });
    
    return {
      token,
      expiresAt: expiration,
      issuedAt: now
    };
  } catch (error) {
    throw new Error(
      `Failed to sign Apple client secret JWT: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Generates or retrieves a cached Apple client secret JWT
 * 
 * This function implements intelligent caching to avoid unnecessary token generation.
 * Tokens are cached until they have less than 7 days remaining before expiration.
 * 
 * @throws {Error} If required environment variables are missing or JWT signing fails
 * @returns {string} A valid Apple client secret JWT
 * 
 * @example
 * ```typescript
 * // Simple usage
 * const clientSecret = generateAppleClientSecret();
 * 
 * // Use with NextAuth
 * AppleProvider({
 *   clientId: process.env.APPLE_CLIENT_ID!,
 *   clientSecret: generateAppleClientSecret()
 * });
 * ```
 */
export function generateAppleClientSecret(): string {
  // Return cached token if it's still valid
  if (isCachedTokenValid(cachedToken)) {
    console.debug('Apple client secret: Using cached token');
    return cachedToken!.token;
  }
  
  console.debug('Apple client secret: Generating new token');
  
  // Generate new token and cache it
  cachedToken = createAppleClientSecret();
  
  return cachedToken.token;
}

/**
 * Clears the cached Apple client secret (useful for testing)
 * 
 * @internal
 */
export function clearAppleClientSecretCache(): void {
  cachedToken = null;
}

/**
 * Gets information about the current cached token (useful for debugging)
 * 
 * @returns {object | null} Token metadata or null if no token is cached
 * 
 * @example
 * ```typescript
 * const info = getAppleClientSecretInfo();
 * if (info) {
 *   console.log(`Token expires at: ${new Date(info.expiresAt * 1000)}`);
 *   console.log(`Days remaining: ${Math.floor((info.expiresAt - Date.now() / 1000) / (24 * 60 * 60))}`);
 * }
 * ```
 */
export function getAppleClientSecretInfo(): {
  expiresAt: number;
  issuedAt: number;
  daysRemaining: number;
} | null {
  if (!cachedToken) {
    return null;
  }
  
  const now = Math.floor(Date.now() / 1000);
  const daysRemaining = Math.floor((cachedToken.expiresAt - now) / (24 * 60 * 60));
  
  return {
    expiresAt: cachedToken.expiresAt,
    issuedAt: cachedToken.issuedAt,
    daysRemaining
  };
}

/* 
 * Test examples (run these in a Node.js environment with proper env vars):
 * 
 * // Basic usage test
 * try {
 *   const secret = generateAppleClientSecret();
 *   console.log('✅ Generated Apple client secret:', secret.substring(0, 50) + '...');
 * } catch (error) {
 *   console.error('❌ Failed to generate secret:', error.message);
 * }
 * 
 * // Caching test
 * const secret1 = generateAppleClientSecret();
 * const secret2 = generateAppleClientSecret(); // Should be same as secret1
 * console.log('Caching works:', secret1 === secret2);
 * 
 * // Token info test
 * const info = getAppleClientSecretInfo();
 * if (info) {
 *   console.log(`Token expires in ${info.daysRemaining} days`);
 * }
 * 
 * // Environment validation test
 * try {
 *   const privateKey = getApplePrivateKey();
 *   console.log('✅ Private key loaded successfully');
 * } catch (error) {
 *   console.error('❌ Private key error:', error.message);
 * }
 */
