/**
 * Alarm Sync Utility
 * Handles automatic syncing of alarms to connected BLE devices
 */

import {
  createAddEventRequest,
  parseAddEventResponse,
} from "~/services/ble/commands/addEvent";
import { createRemoveAllEventsRequest } from "~/services/ble/commands/removeAllEvents";
import { createSetEventOnOffRequest } from "~/services/ble/commands/setEventOnOff";
import { sendCommand } from "~/services/ble/manager";
import { ResponseStatus } from "~/services/ble/types";
import { alarmDatabaseToBleParameters } from "~/utils/bleAlarmUtils";

// Define the alarm type based on what we need from the database
export interface AlarmForSync {
  id: string;
  title: string;
  peripheralId?: string | null;
  cronExpression: string;
  startDate: Date;
  repeat: boolean;
  isActive: boolean;
  severityLevel: "CRITICAL" | "WARNING" | "INFORMATIONAL";
  ledPattern: "OFF" | "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE";
  ledColor: "RED" | "GREEN" | "BLUE" | "YELLOW" | "MAGENTA" | "CYAN" | "WHITE";
  vibrationPattern: number;
  vibrationIntensity: "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
  snoozePeriod: number;
  snoozeTimeout: number;
  retriggerDelay: number;
  retriggerTimeout: number;
  syncStatus?: "NOT_SYNCED" | "SYNCING" | "SYNCED" | "ERROR";
}

export interface SyncProgress {
  step: string;
  message: string;
  progress: number; // 0-100
}

export type SyncProgressCallback = (progress: SyncProgress) => void;
export type SyncStatusCallback = (
  alarmId: string,
  status: "SYNCED" | "ERROR",
) => Promise<void>;

/**
 * Sync alarms to a connected BLE device
 * This function assumes the device is already connected and encryption key is available
 */
export async function syncAlarmsToDevice(
  peripheralId: string,
  encryptionKey: string,
  alarms: AlarmForSync[],
  onProgress?: SyncProgressCallback,
  onStatusUpdate?: SyncStatusCallback,
): Promise<{ success: boolean; error?: string }> {
  try {
    onProgress?.({
      step: "start",
      message: "Starting alarm sync...",
      progress: 0,
    });

    // Clear existing alarms on device
    onProgress?.({
      step: "clear",
      message: "Clearing existing alarms on device...",
      progress: 20,
    });

    const removeResponse = await sendCommand({
      peripheralId,
      command: createRemoveAllEventsRequest(),
      encryptionKey,
    });

    if (removeResponse.status !== ResponseStatus.OK) {
      console.warn("⚠️ Failed to clear existing alarms");
    }

    // Sync each alarm
    const totalAlarms = alarms.length;
    let actualDeviceIndex = 0; // Track the actual index on device (firmware bug workaround)

    for (let i = 0; i < totalAlarms; i++) {
      const alarm = alarms[i];
      if (!alarm) continue;

      const progressPercent = 20 + ((i + 1) / totalAlarms) * 70; // 20-90%

      onProgress?.({
        step: "sync_alarm",
        message: `Syncing alarm ${i + 1}/${totalAlarms}: ${alarm.title}`,
        progress: progressPercent,
      });

      // Convert alarm to BLE parameters
      // Note: Device firmware incorrectly returns index 0 for all ADD_EVENT responses
      // but actually stores at sequential indices. We use actualDeviceIndex to track this.
      const bleParameters = alarmDatabaseToBleParameters(
        alarm,
        actualDeviceIndex,
      );
      const addEventCommand = createAddEventRequest(bleParameters);

      // Add alarm to device
      const response = await sendCommand({
        peripheralId,
        command: addEventCommand,
        encryptionKey,
      });

      const result = parseAddEventResponse(
        response.payload,
        response.status,
        response.commandCode,
      );

      if (response.status !== ResponseStatus.OK || result.status === "ERROR") {
        console.warn(`⚠️ Failed to add alarm: ${alarm.title}`);
        // Update sync status to ERROR in database
        await onStatusUpdate?.(alarm.id, "ERROR");
        continue;
      }

      // Set the alarm on/off state based on isActive
      // Use actualDeviceIndex instead of result.eventIndex due to firmware bug
      const onOffResponse = await sendCommand({
        peripheralId,
        command: createSetEventOnOffRequest(actualDeviceIndex, alarm.isActive),
        encryptionKey,
      });

      if (onOffResponse.status !== ResponseStatus.OK) {
        console.warn(
          `⚠️ Failed to ${alarm.isActive ? "enable" : "disable"} alarm ${alarm.title}`,
        );
      }

      // Update sync status to SYNCED in database
      await onStatusUpdate?.(alarm.id, "SYNCED");

      // Increment actual device index for next alarm
      actualDeviceIndex++;
    }

    onProgress?.({
      step: "complete",
      message: "Sync completed successfully!",
      progress: 100,
    });

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Alarm sync failed:", errorMessage);

    // Update all alarms to ERROR status on sync failure
    for (const alarm of alarms) {
      await onStatusUpdate?.(alarm.id, "ERROR");
    }

    onProgress?.({
      step: "error",
      message: `Sync failed: ${errorMessage}`,
      progress: 0,
    });

    return { success: false, error: errorMessage };
  }
}
