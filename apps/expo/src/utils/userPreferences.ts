/**
 * User Preferences Storage
 *
 * Utilities for storing client-side user preferences via Expo SecureStore.
 */

import * as SecureStore from "expo-secure-store";

const PREFS_KEY = "gently_user_preferences";

interface UserPreferences {
  hasProvidedYearOfBirth?: boolean;
}

/**
 * Get user preferences from storage
 */
export async function getUserPreferences(): Promise<UserPreferences> {
  try {
    const data = await SecureStore.getItemAsync(PREFS_KEY);
    if (!data) {
      return {};
    }
    return JSON.parse(data) as UserPreferences;
  } catch (error) {
    console.error("Error getting user preferences:", error);
    return {};
  }
}

/**
 * Save user preferences to storage
 */
export async function saveUserPreferences(
  prefs: UserPreferences,
): Promise<void> {
  try {
    const currentPrefs = await getUserPreferences();
    const updatedPrefs = { ...currentPrefs, ...prefs };
    await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(updatedPrefs));
  } catch (error) {
    console.error("Error saving user preferences:", error);
  }
}

/**
 * Mark year of birth as provided
 */
export async function markYearOfBirthProvided(): Promise<void> {
  await saveUserPreferences({ hasProvidedYearOfBirth: true });
}

/**
 * Check if user has provided year of birth
 */
export async function hasProvidedYearOfBirth(): Promise<boolean> {
  const prefs = await getUserPreferences();
  return prefs.hasProvidedYearOfBirth ?? false;
}
