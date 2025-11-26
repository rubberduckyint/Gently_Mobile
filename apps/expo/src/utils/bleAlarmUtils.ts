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
    case "MAXIMUM":
      return 3; // MAXIMUM
    default:
      return 1; // Default to MEDIUM
  }
}

/**
 * Convert legacy numeric vibration pattern (1-63) to new enum format
 */
export function mapLegacyVibrationPatternToEnum(
  numericPattern: number,
): AlarmFormData["vibrationPattern"] {
  // Map the old 1-63 range to the 4 new patterns
  // This is a best-effort conversion for backwards compatibility
  if (numericPattern <= 16) return "QUICK";
  if (numericPattern <= 32) return "HEARTBEAT";
  if (numericPattern <= 48) return "RAPID";
  return "SYMPHONY";
}

/**
 * Convert new enum vibration pattern to legacy numeric format for database storage
 */
export function mapVibrationPatternToLegacyNumber(
  pattern: AlarmFormData["vibrationPattern"],
): number {
  switch (pattern) {
    case "QUICK":
      return 1; // Use 1 as the representative number for QUICK
    case "HEARTBEAT":
      return 25; // Use 25 as the representative number for HEARTBEAT
    case "RAPID":
      return 40; // Use 40 as the representative number for RAPID
    case "SYMPHONY":
      return 60; // Use 60 as the representative number for SYMPHONY
    default:
      return 1; // Default to 1 (QUICK)
  }
}

/**
 * Map alarm form vibrationPattern to BLE vibration pattern number
 */
export function mapVibrationPatternToNumber(
  pattern: AlarmFormData["vibrationPattern"],
): number {
  switch (pattern) {
    case "QUICK":
      return 0; // Quick pattern
    case "HEARTBEAT":
      return 1; // Heartbeat pattern
    case "RAPID":
      return 2; // Rapid pattern
    case "SYMPHONY":
      return 3; // Symphony pattern
    default:
      return 0; // Default to Quick
  }
}

/**
 * Map alarm form LED pattern to BLE LED pattern number
 * Per BLE Protocol: 0=OFF, 1=Blink Slow, 2=Blink Fast, 3=Solid
 */
export function mapLedPatternToNumber(
  ledPattern: AlarmFormData["ledPattern"] | "OFF",
): number {
  switch (ledPattern) {
    case "OFF":
      return 0; // OFF
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
      return 1; // Default to blink slow (more visible than OFF)
  }
}

/**
 * Map alarm form LED color to BLE LED color number
 * Per BLE Protocol: 0=OFF, 1=Blue, 2=Green, 3=Cyan, 4=Red, 5=Yellow, 6=Magenta, 7=White
 */
export function mapLedColorToNumber(
  ledColor: AlarmFormData["ledColor"],
): number {
  // Convert LED color enum to BLE LED color number
  switch (ledColor) {
    case "BLUE":
      return 1; // Blue
    case "GREEN":
      return 2; // Green
    case "CYAN":
      return 3; // Cyan
    case "RED":
      return 4; // Red
    case "YELLOW":
      return 5; // Yellow
    case "MAGENTA":
      return 6; // Magenta
    case "WHITE":
      return 7; // White
    default:
      return 1; // Default to Blue
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
 * Generate a cron expression from startDate in local time
 * For non-repeating alarms, uses specific day-of-week since the BLE device
 * firmware interprets * as "every day" and ignores day-of-month
 * For repeating alarms, uses the stored cronExpression
 */
function generateLocalTimeCronExpression(
  startDate: Date,
  repeat: boolean,
  storedCronExpression: string,
): string {
  // For repeating alarms, use the stored cron expression as-is
  // (it was created on the client with local time)
  if (repeat) {
    return storedCronExpression;
  }

  // For non-repeating alarms, regenerate from startDate using local time
  const minute = startDate.getMinutes();
  const hour = startDate.getHours();
  const day = startDate.getDate();
  const month = startDate.getMonth() + 1;
  // Get day of week (0=Sunday, 1=Monday, etc.)
  const dayOfWeek = startDate.getDay();

  // Use specific day-of-week instead of * because the BLE device firmware
  // interprets * as "every day" and may ignore the day-of-month field
  return `${minute} ${hour} ${day} ${month} ${dayOfWeek}`;
}

/**
 * Convert database alarm object to BLE CreateEventCommand parameters
 */
export function alarmDatabaseToBleParameters(
  alarm: {
    title: string;
    peripheralId?: string | null;
    cronExpression: string;
    startDate: Date;
    repeat: boolean;
    severityLevel: "CRITICAL" | "WARNING" | "INFORMATIONAL";
    ledPattern: "OFF" | "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE";
    ledColor:
      | "RED"
      | "GREEN"
      | "BLUE"
      | "YELLOW"
      | "MAGENTA"
      | "CYAN"
      | "WHITE";
    vibrationPattern: number;
    vibrationIntensity: "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
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
  const vibrationPatternEnum = mapLegacyVibrationPatternToEnum(
    alarm.vibrationPattern,
  );
  const vibrationPattern = mapVibrationPatternToNumber(vibrationPatternEnum);
  const ledColor = mapLedColorToNumber(alarm.ledColor);
  const ledPattern = mapLedPatternToNumber(alarm.ledPattern);

  // Generate cron expression in local time for BLE device
  const localCronExpression = generateLocalTimeCronExpression(
    alarm.startDate,
    alarm.repeat,
    alarm.cronExpression,
  );

  return {
    eventIndex,
    // Use peripheralId as event name for verification, fallback to title if not available
    eventName: alarm.peripheralId ?? alarm.title.substring(0, 10),
    cronExpression: localCronExpression,
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
