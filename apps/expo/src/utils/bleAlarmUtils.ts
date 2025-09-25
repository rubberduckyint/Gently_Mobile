/**
 * Utilities for converting alarm form data to BLE command parameters
 * and syncing alarms between the database and physical device.
 */

import type { AlarmFormData } from "~/app/devices/[deviceId]/alarms/add";

/**
 * Map alarm form priority to BLE severity level
 */
export function mapPriorityToSeverityLevel(
  priority: AlarmFormData["priority"],
): number {
  switch (priority) {
    case "HIGH":
      return 1; // Critical
    case "MEDIUM":
      return 2; // Important
    case "LOW":
      return 3; // Informational
    default:
      return 2; // Default to Important
  }
}

/**
 * Map alarm form haptic choice to BLE vibration intensity
 */
export function mapHapticToVibrationIntensity(
  haptic: AlarmFormData["hapticChoice"],
): number {
  switch (haptic) {
    case "SOFT":
      return 0; // LOW
    case "STANDARD":
      return 1; // MEDIUM
    case "STRONG":
    case "DOUBLE":
      return 2; // HIGH
    case "PULSE":
    case "WAVE":
      return 3; // MAXIMUM
    default:
      return 1; // Default to MEDIUM
  }
}

/**
 * Map alarm form haptic choice to BLE vibration pattern
 */
export function mapHapticToVibrationPattern(
  haptic: AlarmFormData["hapticChoice"],
): number {
  switch (haptic) {
    case "STANDARD":
      return 1; // Standard pattern
    case "DOUBLE":
      return 2; // Double pulse pattern
    case "PULSE":
      return 3; // Pulse pattern
    case "WAVE":
      return 4; // Wave pattern
    case "STRONG":
    case "SOFT":
    default:
      return 1; // Default pattern
  }
}

/**
 * Map alarm form color to BLE LED color
 */
export function mapColorToLedColor(color: string): number {
  // Convert hex color to closest BLE LED color
  switch (color.toLowerCase()) {
    case "#0000ff":
    case "#007aff": // iOS blue
      return 1; // Blue
    case "#00ff00":
    case "#34c759": // iOS green
      return 2; // Green
    case "#00ffff":
      return 3; // Cyan
    case "#ff0000":
    case "#ff3b30": // iOS red
      return 4; // Red
    case "#ffff00":
    case "#ffcc02": // iOS yellow
      return 5; // Yellow
    case "#ff00ff":
    case "#af52de": // iOS purple
      return 6; // Magenta
    case "#ffffff":
      return 7; // White
    default:
      return 4; // Default to Red for visibility
  }
}

/**
 * Calculate snooze settings based on priority
 */
export function calculateSnoozeSettings(priority: AlarmFormData["priority"]): {
  snoozePeriod: number;
  snoozeTimeout: number;
} {
  switch (priority) {
    case "HIGH":
      return {
        snoozePeriod: 2, // 2 minutes for critical alarms
        snoozeTimeout: 10, // Stop allowing snooze after 10 minutes
      };
    case "MEDIUM":
      return {
        snoozePeriod: 5, // 5 minutes for important alarms
        snoozeTimeout: 30, // Stop allowing snooze after 30 minutes
      };
    case "LOW":
      return {
        snoozePeriod: 10, // 10 minutes for informational alarms
        snoozeTimeout: 60, // Stop allowing snooze after 1 hour
      };
    default:
      return {
        snoozePeriod: 5,
        snoozeTimeout: 30,
      };
  }
}

/**
 * Convert alarm form data to CreateEventCommand parameters
 */
export function alarmFormDataToBleParameters(
  formData: AlarmFormData,
  cronExpression: string,
  eventIndex = 0,
): Record<string, unknown> {
  const severityLevel = mapPriorityToSeverityLevel(formData.priority);
  const vibrationIntensity = mapHapticToVibrationIntensity(
    formData.hapticChoice,
  );
  const vibrationPattern = mapHapticToVibrationPattern(formData.hapticChoice);
  const ledColor = mapColorToLedColor(formData.color);
  const { snoozePeriod, snoozeTimeout } = calculateSnoozeSettings(
    formData.priority,
  );

  return {
    eventIndex,
    eventName: formData.title.substring(0, 10), // Truncate to BLE limit
    cronExpression,
    severityLevel,
    vibrationIntensity,
    vibrationPattern,
    ledColor,
    ledPattern: 2, // Blink fast for visibility
    snoozePeriod,
    snoozeTimeout,
  };
}

/**
 * Calculate minutes in future for one-time alarms
 */
export function calculateMinutesInFuture(startDate: Date): number {
  const now = new Date();
  const diffMs = startDate.getTime() - now.getTime();
  const diffMinutes = Math.max(1, Math.ceil(diffMs / (1000 * 60))); // At least 1 minute
  return Math.min(60, diffMinutes); // Cap at 60 minutes for BLE validation
}
