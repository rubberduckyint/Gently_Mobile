/**
 * Analytics Service
 *
 * Centralized analytics tracking using Vexo Analytics.
 * Provides typed event tracking functions for monitoring app usage.
 *
 * Note: Vexo is initialized at module level in _layout.tsx
 */

import { customEvent, identifyDevice } from "vexo-analytics";

// ============================================================================
// User Identity
// ============================================================================

/**
 * Identify the current user for analytics tracking.
 * Call this after successful authentication.
 */
export async function identifyUser(userId: string): Promise<void> {
  try {
    await identifyDevice(userId);
    console.log(
      "📊 [Analytics] User identified:",
      userId.substring(0, 8) + "...",
    );
  } catch (error) {
    console.error("📊 [Analytics] Failed to identify user:", error);
  }
}

/**
 * Clear user identity (for logout).
 */
export async function clearUserIdentity(): Promise<void> {
  try {
    await identifyDevice(null);
    console.log("📊 [Analytics] User identity cleared");
  } catch (error) {
    console.error("📊 [Analytics] Failed to clear user identity:", error);
  }
}

// ============================================================================
// Authentication Events
// ============================================================================

export function trackLoginAttempt(method: "email" | "google" | "apple"): void {
  customEvent("auth_login_attempt", { method });
}

export function trackLoginSuccess(method: "email" | "google" | "apple"): void {
  customEvent("auth_login_success", { method });
}

export function trackLoginError(
  method: "email" | "google" | "apple",
  error: string,
): void {
  customEvent("auth_login_error", { method, error });
}

export function trackOtpSent(email: string): void {
  // Hash/truncate email for privacy
  const emailDomain = email.split("@")[1] ?? "unknown";
  customEvent("auth_otp_sent", { emailDomain });
}

export function trackOtpVerified(): void {
  customEvent("auth_otp_verified", {});
}

export function trackLogout(): void {
  customEvent("auth_logout", {});
}

// ============================================================================
// Device Management Events
// ============================================================================

export function trackDeviceScanStarted(): void {
  customEvent("device_scan_started", {});
}

export function trackDeviceScanCompleted(devicesFound: number): void {
  customEvent("device_scan_completed", { devicesFound });
}

export function trackDevicePairingStarted(serialNumber: string): void {
  // Truncate serial for privacy
  customEvent("device_pairing_started", {
    serialPrefix: serialNumber.substring(0, 4),
  });
}

export function trackDevicePairingSuccess(deviceName: string): void {
  customEvent("device_pairing_success", { deviceName });
}

export function trackDevicePairingError(error: string): void {
  customEvent("device_pairing_error", { error });
}

export function trackDeviceRenamed(deviceId: string): void {
  customEvent("device_renamed", { deviceId });
}

export function trackDeviceDeleted(): void {
  customEvent("device_deleted", {});
}

// ============================================================================
// BLE Connection Events
// ============================================================================

export function trackBleConnectionAttempt(deviceId: string): void {
  customEvent("ble_connection_attempt", { deviceId });
}

export function trackBleConnectionSuccess(deviceId: string): void {
  customEvent("ble_connection_success", { deviceId });
}

export function trackBleConnectionError(deviceId: string, error: string): void {
  customEvent("ble_connection_error", { deviceId, error });
}

export function trackBleDisconnection(deviceId: string, reason: string): void {
  customEvent("ble_disconnection", { deviceId, reason });
}

export function trackBleCommandSent(command: string, deviceId: string): void {
  customEvent("ble_command_sent", { command, deviceId });
}

export function trackBleCommandError(
  command: string,
  deviceId: string,
  error: string,
): void {
  customEvent("ble_command_error", { command, deviceId, error });
}

// ============================================================================
// Alarm Events
// ============================================================================

export function trackAlarmCreated(options: {
  hasRepeat: boolean;
  repeatType?: string;
  severityLevel: string;
  hasNotifications: boolean;
}): void {
  customEvent("alarm_created", options);
}

export function trackAlarmEdited(alarmId: string): void {
  customEvent("alarm_edited", { alarmId });
}

export function trackAlarmDeleted(alarmId: string): void {
  customEvent("alarm_deleted", { alarmId });
}

export function trackAlarmToggled(alarmId: string, isActive: boolean): void {
  customEvent("alarm_toggled", { alarmId, isActive });
}

export function trackAlarmSynced(alarmId: string): void {
  customEvent("alarm_synced_to_device", { alarmId });
}

export function trackAlarmSyncError(alarmId: string, error: string): void {
  customEvent("alarm_sync_error", { alarmId, error });
}

export function trackAlarmTriggered(alarmId: string): void {
  customEvent("alarm_triggered", { alarmId });
}

export function trackAlarmAcknowledged(alarmId: string): void {
  customEvent("alarm_acknowledged", { alarmId });
}

export function trackAlarmSnoozed(alarmId: string): void {
  customEvent("alarm_snoozed", { alarmId });
}

// ============================================================================
// Settings Events
// ============================================================================

export function trackSettingsUpdated(
  section: "profile" | "alarms" | "notifications",
): void {
  customEvent("settings_updated", { section });
}

export function trackNotificationPreferenceChanged(options: {
  pushEnabled: boolean;
  emailEnabled: boolean;
}): void {
  customEvent("notification_preference_changed", options);
}

export function trackAlarmPreferencesChanged(): void {
  customEvent("alarm_preferences_changed", {});
}

// ============================================================================
// Navigation & Engagement Events
// ============================================================================

export function trackScreenView(screenName: string): void {
  customEvent("screen_view", { screenName });
}

export function trackOnboardingCompleted(): void {
  customEvent("onboarding_completed", {});
}

export function trackOnboardingSkipped(): void {
  customEvent("onboarding_skipped", {});
}

export function trackHelpViewed(topic: string): void {
  customEvent("help_viewed", { topic });
}

// ============================================================================
// Error & Performance Events
// ============================================================================

export function trackError(
  category: string,
  error: string,
  context?: Record<string, unknown>,
): void {
  customEvent("app_error", { category, error, ...context });
}

export function trackApiError(endpoint: string, statusCode?: number): void {
  customEvent("api_error", { endpoint, statusCode });
}

// ============================================================================
// Feature Usage Events
// ============================================================================

export function trackBatteryStatusViewed(batteryLevel: number): void {
  customEvent("battery_status_viewed", { batteryLevel });
}

export function trackDeviceTimeSync(): void {
  customEvent("device_time_synced", {});
}

export function trackFeatureUsed(featureName: string): void {
  customEvent("feature_used", { featureName });
}
