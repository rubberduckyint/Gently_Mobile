/**
 * Shared Types for Expo App
 *
 * This module centralizes all type definitions used throughout the app.
 * Types are inferred from the tRPC API router to ensure consistency
 * between frontend and backend.
 */

import type { RouterOutputs } from "~/utils/api";

// Infer database types from the API router outputs
export type Device = RouterOutputs["device"]["getById"];
export type Alarm = NonNullable<Device>["alarms"][number];

// Re-export enum types from the schema
// These are the canonical source of truth for BLE protocol values
export type SeverityLevel = "INFORMATIONAL" | "WARNING" | "CRITICAL";
export type LedPattern =
  | "OFF"
  | "SOLID"
  | "BLINK_SLOW"
  | "BLINK_FAST"
  | "PULSE"
  | "STROBE";
export type LedColor =
  | "RED"
  | "GREEN"
  | "BLUE"
  | "YELLOW"
  | "MAGENTA"
  | "CYAN"
  | "WHITE";
export type VibrationIntensity = "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
export type VibrationPattern = "QUICK" | "HEARTBEAT" | "RAPID" | "SYMPHONY";
export type SyncStatus = "NOT_SYNCED" | "SYNCING" | "SYNCED" | "ERROR";

/**
 * Alarm form data used when creating or editing alarms.
 * This is the client-side representation that maps to the Alarm schema.
 */
export interface AlarmFormData {
  title: string;
  description: string;
  startDate: Date;
  repeat: boolean;
  repeatType: "minutes" | "hours" | "days" | "weeks";
  repeatEvery: number;
  daysOfWeek: string[];
  ends: "never" | "on" | "after";
  endsOnDate?: Date;
  endsAfter?: number;
  isActive?: boolean;
  // BLE Protocol fields
  severityLevel: SeverityLevel;
  ledPattern: LedPattern;
  ledColor: LedColor;
  vibrationPattern: VibrationPattern;
  vibrationIntensity: VibrationIntensity;
  snoozePeriod: number;
  snoozeTimeout: number;
  retriggerDelay: number;
  retriggerTimeout: number;
  // Notification settings
  pushNotification: boolean;
  emailNotification: boolean;
}

/**
 * User preferences for alarm defaults
 */
export interface UserPreferencesData {
  defaultSeverityLevel: SeverityLevel;
  defaultLedPattern: LedPattern;
  defaultLedColor: LedColor;
  defaultVibrationPattern: number;
  defaultVibrationIntensity: VibrationIntensity;
  defaultSnoozePeriod: number;
  defaultSnoozeTimeout: number;
  defaultRetriggerDelay: number;
  defaultRetriggerTimeout: number;
  defaultPushNotification: boolean;
  defaultEmailNotification: boolean;
}

/**
 * Schedule display information for alarms
 */
export interface ScheduleInfo {
  nextOccurrence: Date | null;
  isExpired: boolean;
  displayText: string;
  repeatInfo?: string;
}

/**
 * BLE device connection information
 */
export interface BLEDeviceInfo {
  id: string;
  name?: string;
  serialNumber?: string;
  rssi?: number;
}

/**
 * BLE connection states
 */
export type BLEConnectionState =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected"
  | "error";

/**
 * Active alarm notification from device
 */
export interface ActiveAlarmNotification {
  eventIndex: number;
  eventState: number;
  eventStateText: string;
  timestamp: Date;
  alarmTitle?: string;
}

/**
 * Type guards for runtime type checking
 */
export const isValidSeverityLevel = (value: string): value is SeverityLevel => {
  return ["INFORMATIONAL", "WARNING", "CRITICAL"].includes(value);
};

export const isValidLedPattern = (value: string): value is LedPattern => {
  return [
    "OFF",
    "SOLID",
    "BLINK_SLOW",
    "BLINK_FAST",
    "PULSE",
    "STROBE",
  ].includes(value);
};

export const isValidLedColor = (value: string): value is LedColor => {
  return [
    "RED",
    "GREEN",
    "BLUE",
    "YELLOW",
    "MAGENTA",
    "CYAN",
    "WHITE",
  ].includes(value);
};

export const isValidVibrationIntensity = (
  value: string,
): value is VibrationIntensity => {
  return ["LOW", "MEDIUM", "HIGH", "MAXIMUM"].includes(value);
};

export const isValidVibrationPattern = (
  value: string,
): value is VibrationPattern => {
  return ["QUICK", "HEARTBEAT", "RAPID", "SYMPHONY"].includes(value);
};
