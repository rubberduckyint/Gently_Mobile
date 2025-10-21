/**
 * Alarm Manager
 * 
 * Handles intelligent alarm management for BLE devices with these capabilities:
 * - Max 50 alarms per device enforcement
 * - Incremental sync (only sync changes, not full re-sync)
 * - Device index slot management
 * - Automatic expired alarm cleanup
 * - Future trigger validation
 */

import { calculateNextAlarmOccurrence } from "./alarmUtils";

export const MAX_ALARMS_PER_DEVICE = 50;

export interface AlarmWithIndex {
  id: string;
  deviceIndex: number | null;
  isActive: boolean;
  startDate: Date;
  endDate: Date | null;
  repeat: boolean;
  cronExpression: string;
  syncStatus: "NOT_SYNCED" | "SYNCING" | "SYNCED" | "ERROR";
  // BLE Parameters
  title: string;
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
  vibrationIntensity: "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
  snoozePeriod: number;
  snoozeTimeout: number;
  retriggerDelay: number;
  retriggerTimeout: number;
}

/**
 * Find the next available device index slot
 * Returns -1 if no slots available (device is full)
 */
export function findNextAvailableIndex(
  existingAlarms: AlarmWithIndex[],
): number {
  // Get all used indices
  const usedIndices = new Set(
    existingAlarms
      .map((a) => a.deviceIndex)
      .filter((idx): idx is number => idx !== null),
  );

  // Find first available index from 0-49
  for (let i = 0; i < MAX_ALARMS_PER_DEVICE; i++) {
    if (!usedIndices.has(i)) {
      return i;
    }
  }

  return -1; // No available slots
}

/**
 * Check if device has available slots for new alarms
 */
export function getAvailableSlotCount(
  existingAlarms: AlarmWithIndex[],
): number {
  const usedSlots = existingAlarms.filter((a) => a.deviceIndex !== null).length;
  return MAX_ALARMS_PER_DEVICE - usedSlots;
}

/**
 * Check if an alarm has expired (will never trigger again)
 */
export function isAlarmExpired(alarm: {
  isActive: boolean;
  startDate: Date;
  endDate: Date | null;
  repeat: boolean;
  cronExpression: string;
}): boolean {
  if (!alarm.isActive) {
    return false; // Inactive alarms aren't considered expired
  }

  const scheduleInfo = calculateNextAlarmOccurrence(alarm);
  
  // If there's no next occurrence, the alarm is expired
  return scheduleInfo.nextOccurrence === null;
}

/**
 * Find all expired alarms that should be cleaned up
 */
export function findExpiredAlarms(
  alarms: AlarmWithIndex[],
): AlarmWithIndex[] {
  return alarms.filter((alarm) => {
    try {
      return isAlarmExpired(alarm);
    } catch (error) {
      console.warn(`Error checking if alarm ${alarm.id} is expired:`, error);
      return false;
    }
  });
}

/**
 * Validate that a new/updated alarm will trigger in the future
 */
export function validateAlarmWillTrigger(alarm: {
  isActive: boolean;
  startDate: Date;
  endDate: Date | null;
  repeat: boolean;
  cronExpression: string;
}): { valid: boolean; error?: string } {
  if (!alarm.isActive) {
    return { valid: true }; // Inactive alarms don't need to trigger
  }

  try {
    const scheduleInfo = calculateNextAlarmOccurrence(alarm);
    
    if (scheduleInfo.nextOccurrence === null) {
      return {
        valid: false,
        error: "This alarm will never trigger. Please check the start date, end date, and schedule settings.",
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid alarm schedule: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Categorize alarms by their sync operation needed
 */
export interface AlarmSyncPlan {
  toAdd: AlarmWithIndex[]; // New alarms that need to be added to device
  toUpdate: AlarmWithIndex[]; // Existing alarms that need to be updated on device
  toDelete: number[]; // Device indices that need to be removed
  unchanged: AlarmWithIndex[]; // Alarms that don't need syncing
}

/**
 * Create a sync plan by comparing current database state with last synced state
 */
export function createSyncPlan(
  alarms: AlarmWithIndex[],
): AlarmSyncPlan {
  const toAdd: AlarmWithIndex[] = [];
  const toUpdate: AlarmWithIndex[] = [];
  const unchanged: AlarmWithIndex[] = [];

  for (const alarm of alarms) {
    if (alarm.syncStatus === "NOT_SYNCED" && alarm.deviceIndex === null) {
      // New alarm that hasn't been synced yet
      toAdd.push(alarm);
    } else if (
      alarm.syncStatus === "NOT_SYNCED" &&
      alarm.deviceIndex !== null
    ) {
      // Existing alarm that was modified and needs update
      toUpdate.push(alarm);
    } else if (alarm.syncStatus === "SYNCED") {
      // Alarm is up to date
      unchanged.push(alarm);
    } else if (alarm.syncStatus === "ERROR") {
      // Previously failed, try to update
      if (alarm.deviceIndex !== null) {
        toUpdate.push(alarm);
      } else {
        toAdd.push(alarm);
      }
    }
  }

  // We can't easily detect deletions without tracking deleted alarms
  // This will be handled by the database keeping track of deleted alarms
  const toDelete: number[] = [];

  return {
    toAdd,
    toUpdate,
    toDelete,
    unchanged,
  };
}

/**
 * Assign device indices to new alarms
 */
export function assignDeviceIndices(
  newAlarms: AlarmWithIndex[],
  existingAlarms: AlarmWithIndex[],
): Map<string, number> {
  const assignments = new Map<string, number>();
  const allAlarms = [...existingAlarms];

  for (const alarm of newAlarms) {
    const nextIndex = findNextAvailableIndex(allAlarms);
    
    if (nextIndex === -1) {
      console.error(
        `Cannot assign index to alarm ${alarm.id}: device is full`,
      );
      continue;
    }

    assignments.set(alarm.id, nextIndex);
    
    // Add to temporary tracking to reserve this index
    allAlarms.push({ ...alarm, deviceIndex: nextIndex });
  }

  return assignments;
}
