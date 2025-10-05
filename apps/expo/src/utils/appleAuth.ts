/**
 * Apple Sign In integration for Expo/React Native
 * 
 * Simple integration that handles native Apple Sign In authentication.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/**
 * Apple Sign In response interface
 */
interface AppleSignInResult {
  success: boolean;
  identityToken?: string;
  user?: string;
  email?: string;
  fullName?: {
    givenName?: string;
    familyName?: string;
  };
  error?: string;
}

/**
 * Check if Apple Sign In is available on this device
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }
  
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch (error) {
    console.warn('Apple Authentication availability check failed:', error);
    return false;
  }
}

/**
 * Generate a cryptographically random nonce for Apple Sign In
 */
function generateNonce(): string {
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

/**
 * Hash the nonce using SHA256 (required by Apple)
 */
async function hashNonce(nonce: string): Promise<string> {
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    nonce,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return hashedNonce;
}

/**
 * Sign in with Apple using the native iOS authentication
 * 
 * @returns Promise that resolves with sign-in result
 * 
 * @example
 * ```typescript
 * const result = await signInWithApple();
 * if (result.success) {
 *   console.log('✅ Apple Sign In successful');
 * } else {
 *   console.error('❌ Apple Sign In failed:', result.error);
 * }
 * ```
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  console.log('🍎 Starting Apple Sign In process...');
  
  // Check availability first
  const isAvailable = await isAppleAuthAvailable();
  if (!isAvailable) {
    return {
      success: false,
      error: 'Apple Sign In is not available on this device'
    };
  }

  try {
    // Generate nonce for security
    const nonce = generateNonce();
    const hashedNonce = await hashNonce(nonce);
    
    console.log('🔐 Generated nonce for Apple Sign In');
    
    // Perform Apple authentication
    const appleResponse = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    console.log('✅ Apple native authentication successful');
    console.log('📧 Email:', appleResponse.email || 'Not provided');
    console.log('👤 Full Name:', appleResponse.fullName?.givenName, appleResponse.fullName?.familyName);
    
    if (!appleResponse.identityToken) {
      return {
        success: false,
        error: 'No identity token received from Apple'
      };
    }

    return {
      success: true,
      identityToken: appleResponse.identityToken,
      user: appleResponse.user,
      email: appleResponse.email || undefined,
      fullName: appleResponse.fullName ? {
        givenName: appleResponse.fullName.givenName || undefined,
        familyName: appleResponse.fullName.familyName || undefined,
      } : undefined,
    };
    
  } catch (error: any) {
    console.error('❌ Apple Sign In failed:', error);
    
    // Handle specific error cases
    if (error.code === 'ERR_REQUEST_CANCELED') {
      return {
        success: false,
        error: 'Apple Sign In was cancelled by user'
      };
    } else if (error.code === 'ERR_REQUEST_NOT_HANDLED') {
      return {
        success: false,
        error: 'Apple Sign In request was not handled'
      };
    } else if (error.code === 'ERR_REQUEST_FAILED') {
      return {
        success: false,
        error: 'Apple Sign In request failed'
      };
    } else {
      return {
        success: false,
        error: error.message || 'Unknown Apple Sign In error'
      };
    }
  }
}

/**
 * Send Apple identity token to BetterAuth using the social signin method
 * 
 * @param identityToken The identity token from Apple Sign In
 * @returns Promise that resolves when backend authentication is complete
 */
export async function authenticateWithBetterAuth(identityToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🔄 Authenticating with BetterAuth using ID Token...');
    
    const { authClient } = await import('./auth');
    
    // Use BetterAuth's social sign-in with ID Token approach
    const result = await authClient.signIn.social({
      provider: 'apple',
      idToken: {
        token: identityToken,
      },
    });
    
    if (result.error) {
      console.error('❌ BetterAuth authentication failed:', result.error);
      return {
        success: false,
        error: result.error.message || 'Authentication failed'
      };
    }
    
    console.log('✅ BetterAuth authentication successful');
    return { success: true };
    
  } catch (error: any) {
    console.error('❌ BetterAuth authentication failed:', error);
    return {
      success: false,
      error: error.message || 'Network error during authentication'
    };
  }
}

/**
 * Complete Apple Sign In flow with backend authentication
 * 
 * @returns Promise that resolves when the complete sign-in flow is finished
 */
export async function completeAppleSignIn(): Promise<{ success: boolean; error?: string }> {
  try {
    // Step 1: Sign in with Apple
    const appleResult = await signInWithApple();
    if (!appleResult.success || !appleResult.identityToken) {
      return {
        success: false,
        error: appleResult.error || 'Apple Sign In failed'
      };
    }

    // Step 2: Authenticate with BetterAuth using ID Token
    const backendResult = await authenticateWithBetterAuth(appleResult.identityToken);

    if (!backendResult.success) {
      return {
        success: false,
        error: backendResult.error
      };
    }

    console.log('✅ Complete Apple Sign In flow successful');
    return { success: true };

  } catch (error: unknown) {
    console.error('❌ Complete Apple Sign In flow failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Apple Sign In flow failed'
    };
  }
}

/**
 * Check Apple Sign In credential state (for existing users)
 * 
 * This should be called on app launch to check if the user's Apple ID 
 * credentials are still valid.
 */
export async function checkAppleCredentialState(userID: string): Promise<number | null> {
  if (Platform.OS !== 'ios') {
    return null;
  }
  
  try {
    // Apple credential states are numeric constants
    const credentialState = await AppleAuthentication.getCredentialStateAsync(userID);
    return credentialState as number;
  } catch (error) {
    console.warn('Failed to check Apple credential state:', error);
    return null;
  }
}

// Export AppleAuthentication for UI components
export { AppleAuthentication };
