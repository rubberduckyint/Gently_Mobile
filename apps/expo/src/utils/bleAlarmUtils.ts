/**
 * Utilities for converting alarm form data to BLE command parameters
 * and syncing alarms between the database and physical device.
 */

import type { AlarmFormData } from "~/components/alarms";
import type { AddEventParams } from "~/services/ble/commands/addEvent";

/**
 * Map alarm form severityLevel to BLE severity level number
 */
export function mapSeverityLevelToNumber(
  severityLevel: AlarmFormData["severityLevel"],
): number {
  switch (severityLevel) {
    case "CRITICAL":
      return 1; // Critical
    case "WARNING":
      return 2; // Warning
    case "INFORMATIONAL":
      return 3; // Informational
    default:
      return 2; // Default to Warning
  }
}

/**
 * Map alarm form vibrationIntensity to BLE vibration intensity number
 */
export function mapVibrationIntensityToNumber(
  intensity: AlarmFormData["vibrationIntensity"],
): number {
  switch (intensity) {
    case "LOW":
      return 0; // LOW
    case "MEDIUM":
      return 1; // MEDIUM
    case "HIGH":
      return 2; // HIGH
    default:
      return 1; // Default to MEDIUM
  }
}

/**
 * Map alarm form vibrationPattern to BLE vibration pattern number
 */
export function mapVibrationPatternToNumber(
  pattern: AlarmFormData["vibrationPattern"],
): number {
  // vibrationPattern is already a number 1-63, just validate range
  return Math.max(1, Math.min(63, pattern));
}

/**
 * Map alarm form LED pattern to BLE LED pattern number
 */
export function mapLedPatternToNumber(
  ledPattern: AlarmFormData["ledPattern"],
): number {
  switch (ledPattern) {
    case "SOLID":
      return 3; // Solid
    case "BLINK_SLOW":
      return 1; // Blink slow
    case "BLINK_FAST":
      return 2; // Blink fast
    case "PULSE":
      return 2; // Map to blink fast (closest equivalent)
    case "STROBE":
      return 2; // Map to blink fast (closest equivalent)
    default:
      return 2; // Default to blink fast
  }
}

/**
 * Map alarm form LED color to BLE LED color number
 */
export function mapLedColorToNumber(
  ledColor: AlarmFormData["ledColor"],
): number {
  // Convert LED color enum to BLE LED color number
  switch (ledColor) {
    case "RED":
      return 1; // Red
    case "GREEN":
      return 2; // Green
    case "BLUE":
      return 3; // Blue
    case "YELLOW":
      return 4; // Yellow
    case "MAGENTA":
      return 5; // Magenta
    case "CYAN":
      return 6; // Cyan
    case "WHITE":
      return 7; // White
    default:
      return 3; // Default to Blue
  }
}

/**
 * Calculate snooze settings based on severity level
 */
export function calculateSnoozeSettings(
  severityLevel: AlarmFormData["severityLevel"],
): {
  snoozePeriod: number;
  snoozeTimeout: number;
} {
  switch (severityLevel) {
    case "CRITICAL":
      return {
        snoozePeriod: 2, // 2 minutes for critical alarms
        snoozeTimeout: 10, // Stop allowing snooze after 10 minutes
      };
    case "WARNING":
      return {
        snoozePeriod: 5, // 5 minutes for warning alarms
        snoozeTimeout: 30, // Stop allowing snooze after 30 minutes
      };
    case "INFORMATIONAL":
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
  const severityLevel = mapSeverityLevelToNumber(formData.severityLevel);
  const vibrationIntensity = mapVibrationIntensityToNumber(
    formData.vibrationIntensity,
  );
  const vibrationPattern = mapVibrationPatternToNumber(
    formData.vibrationPattern,
  );
  const ledColor = mapLedColorToNumber(formData.ledColor);
  const ledPattern = mapLedPatternToNumber(formData.ledPattern);

  return {
    eventIndex,
    eventName: formData.title.substring(0, 10), // Truncate to BLE limit
    cronExpression,
    severityLevel,
    vibrationIntensity,
    vibrationPattern,
    ledColor,
    ledPattern,
    snoozePeriod: formData.snoozePeriod,
    snoozeTimeout: formData.snoozeTimeout,
    retriggerDelay: formData.retriggerDelay,
    retriggerTimeout: formData.retriggerTimeout,
  };
}

/**
 * Convert database alarm object to BLE CreateEventCommand parameters
 */
export function alarmDatabaseToBleParameters(
  alarm: {
    title: string;
    cronExpression: string;
    severityLevel: "CRITICAL" | "WARNING" | "INFORMATIONAL";
    ledPattern: "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE";
    ledColor:
      | "RED"
      | "GREEN"
      | "BLUE"
      | "YELLOW"
      | "MAGENTA"
      | "CYAN"
      | "WHITE";
    vibrationPattern: number;
    vibrationIntensity: "LOW" | "MEDIUM" | "HIGH";
    snoozePeriod: number;
    snoozeTimeout: number;
    retriggerDelay: number;
    retriggerTimeout: number;
  },
  eventIndex = 0,
): AddEventParams {
  const severityLevel = mapSeverityLevelToNumber(alarm.severityLevel);
  const vibrationIntensity = mapVibrationIntensityToNumber(
    alarm.vibrationIntensity,
  );
  const vibrationPattern = mapVibrationPatternToNumber(alarm.vibrationPattern);
  const ledColor = mapLedColorToNumber(alarm.ledColor);
  const ledPattern = mapLedPatternToNumber(alarm.ledPattern);

  return {
    eventIndex,
    eventName: alarm.title.substring(0, 10), // Truncate to BLE limit
    cronExpression: alarm.cronExpression || "0 9 * * *", // Default if missing
    severityLevel,
    vibrationIntensity,
    vibrationPattern,
    ledColor,
    ledPattern,
    snoozePeriod: alarm.snoozePeriod,
    snoozeTimeout: alarm.snoozeTimeout,
    retriggerDelay: alarm.retriggerDelay,
    retriggerTimeout: alarm.retriggerTimeout,
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
