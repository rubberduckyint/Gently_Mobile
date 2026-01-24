/**
 * Test Mode Utility
 *
 * Provides functionality for Apple App Review testing.
 * Allows a special test user to bypass OTP verification and
 * simulate device pairing without a physical Gently device.
 *
 * Test user email: extraspecialtestuser@gentlyus.com
 */

// Test user configuration
export const TEST_USER_EMAIL = "extraspecialtestuser@gentlyus.com";
export const TEST_USER_OTP = "123456"; // Fixed OTP for test user

// Simulated device configuration
export const SIMULATED_DEVICE = {
  serialNumber: "GENTLY-TEST-001",
  name: "Test Gently Device",
  batteryLevel: 85,
  firmwareVersion: "1.0.0",
};

/**
 * Check if the provided email is the special test user email.
 * Used for Apple App Review to bypass OTP verification.
 */
export function isTestUser(email: string): boolean {
  return email.toLowerCase().trim() === TEST_USER_EMAIL.toLowerCase();
}

/**
 * Check if the provided OTP is valid for the test user.
 * The test user uses a fixed OTP code for easy verification.
 */
export function isValidTestOtp(otp: string): boolean {
  return otp === TEST_USER_OTP;
}

/**
 * Check if the current session is a test user session.
 * Can be used to show simulated features throughout the app.
 */
export function isTestUserSession(userEmail: string | undefined): boolean {
  if (!userEmail) return false;
  return isTestUser(userEmail);
}

/**
 * Generate a simulated device for test users.
 * Returns mock device data that can be used for pairing simulation.
 */
export function getSimulatedDeviceData(): {
  serialNumber: string;
  name: string;
  batteryLevel: number;
  firmwareVersion: string;
} {
  return { ...SIMULATED_DEVICE };
}
