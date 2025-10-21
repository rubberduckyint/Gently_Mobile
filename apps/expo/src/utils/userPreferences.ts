/**
 * User Preferences Storage
 *
 * Utilities for storing user preferences like whether they've seen onboarding.
 * Uses Expo SecureStore for persistent storage.
 */

import * as SecureStore from "expo-secure-store";

const PREFS_KEY = "gently_user_preferences";

interface UserPreferences {
  hasSeenOnboarding?: boolean;
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
 * Mark onboarding as completed
 */
export async function markOnboardingComplete(): Promise<void> {
  await saveUserPreferences({ hasSeenOnboarding: true });
}

/**
 * Check if user has seen onboarding
 */
export async function hasSeenOnboarding(): Promise<boolean> {
  const prefs = await getUserPreferences();
  return prefs.hasSeenOnboarding ?? false;
}

/**
 * Reset onboarding status (useful for testing)
 */
export async function resetOnboarding(): Promise<void> {
  await saveUserPreferences({ hasSeenOnboarding: false });
}
