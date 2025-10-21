/**
 * Incremental Alarm Sync
 * 
 * Syncs only changed alarms to the device instead of full re-sync.
 * Manages device index slots and enforces 50 alarm limit.
 */

import {
  createAddEventRequest,
  parseAddEventResponse,
} from "~/services/ble/commands/addEvent";
import { createRemoveEventRequest } from "../services/ble/commands/removeEvent";
import { parseRemoveEventResponse } from "../services/ble/commands/removeEvent";
import { createSetEventOnOffRequest } from "~/services/ble/commands/setEventOnOff";
import { sendCommand } from "~/services/ble/manager";
import { ResponseStatus } from "~/services/ble/types";
import { alarmDatabaseToBleParameters } from "~/utils/bleAlarmUtils";
import type { AlarmWithIndex } from "./alarmManager";
import {
  assignDeviceIndices,
  createSyncPlan,
  findExpiredAlarms,
  MAX_ALARMS_PER_DEVICE,
} from "./alarmManager";

export interface IncrementalSyncProgress {
  step: string;
  message: string;
  progress: number; // 0-100
  currentOperation?: {
    type: "add" | "update" | "delete";
    alarmTitle?: string;
    index?: number;
  };
}

export type IncrementalSyncProgressCallback = (
  progress: IncrementalSyncProgress,
) => void;

export interface IncrementalSyncResult {
  success: boolean;
  error?: string;
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
  expiredCleanedCount: number;
  finalDeviceIndexMap: Map<string, number>; // alarmId -> deviceIndex
}

/**
 * Sync only changed alarms to device (incremental sync)
 */
export async function incrementalSyncAlarms(
  peripheralId: string,
  encryptionKey: string,
  alarms: AlarmWithIndex[],
  onProgress?: IncrementalSyncProgressCallback,
  onIndexAssigned?: (alarmId: string, deviceIndex: number) => Promise<void>,
  onSyncStatusUpdate?: (
    alarmId: string,
    status: "SYNCED" | "ERROR",
  ) => Promise<void>,
  onExpiredAlarmFound?: (alarmId: string) => Promise<void>,
): Promise<IncrementalSyncResult> {
  console.log(
    `🔄 Starting incremental sync for ${alarms.length} alarms on device ${peripheralId}`,
  );

  const result: IncrementalSyncResult = {
    success: false,
    addedCount: 0,
    updatedCount: 0,
    deletedCount: 0,
    expiredCleanedCount: 0,
    finalDeviceIndexMap: new Map(),
  };

  try {
    // Step 1: Find and clean up expired alarms
    onProgress?.({
      step: "cleanup",
      message: "Checking for expired alarms...",
      progress: 5,
    });

    const expiredAlarms = findExpiredAlarms(alarms);
    console.log(`🗑️ Found ${expiredAlarms.length} expired alarms to clean up`);

    for (const expired of expiredAlarms) {
      if (expired.deviceIndex !== null) {
        // Delete from device
        const deleteResponse = await sendCommand({
          peripheralId,
          command: createRemoveEventRequest(expired.deviceIndex),
          encryptionKey,
        });

        const deleteResult = parseRemoveEventResponse(
          deleteResponse.payload,
          deleteResponse.status,
          deleteResponse.commandCode,
        );

        if (deleteResult.status === "SUCCESS") {
          console.log(
            `✅ Deleted expired alarm ${expired.id} from index ${expired.deviceIndex}`,
          );
          result.expiredCleanedCount++;
        }
      }

      // Notify to remove from database
      await onExpiredAlarmFound?.(expired.id);
    }

    // Filter out expired alarms
    const activeAlarms = alarms.filter(
      (a) => !expiredAlarms.find((e) => e.id === a.id),
    );

    // Step 2: Check device capacity
    const syncedAlarmsCount = activeAlarms.filter(
      (a) => a.deviceIndex !== null,
    ).length;

    if (syncedAlarmsCount > MAX_ALARMS_PER_DEVICE) {
      throw new Error(
        `Device has ${syncedAlarmsCount} alarms, exceeding the maximum of ${MAX_ALARMS_PER_DEVICE}`,
      );
    }

    // Step 3: Create sync plan
    onProgress?.({
      step: "planning",
      message: "Planning sync operations...",
      progress: 10,
    });

    const syncPlan = createSyncPlan(activeAlarms);
    console.log(
      `📋 Sync plan: ${syncPlan.toAdd.length} to add, ${syncPlan.toUpdate.length} to update, ${syncPlan.toDelete.length} to delete`,
    );

    // Check if we have capacity for new alarms
    if (syncPlan.toAdd.length + syncedAlarmsCount > MAX_ALARMS_PER_DEVICE) {
      throw new Error(
        `Cannot add ${syncPlan.toAdd.length} alarms. Device can only hold ${MAX_ALARMS_PER_DEVICE} alarms total.`,
      );
    }

    const totalOperations =
      syncPlan.toAdd.length +
      syncPlan.toUpdate.length +
      syncPlan.toDelete.length;

    if (totalOperations === 0) {
      console.log("✅ No changes to sync");
      onProgress?.({
        step: "complete",
        message: "All alarms are up to date",
        progress: 100,
      });
      
      // Build final index map from current state
      for (const alarm of activeAlarms) {
        if (alarm.deviceIndex !== null) {
          result.finalDeviceIndexMap.set(alarm.id, alarm.deviceIndex);
        }
      }
      
      result.success = true;
      return result;
    }

    let currentOperation = 0;

    // Step 4: Delete alarms
    for (const deviceIndex of syncPlan.toDelete) {
      currentOperation++;
      const progress = 10 + (currentOperation / totalOperations) * 80;

      onProgress?.({
        step: "delete",
        message: `Deleting alarm from slot ${deviceIndex}...`,
        progress,
        currentOperation: { type: "delete", index: deviceIndex },
      });

      const deleteResponse = await sendCommand({
        peripheralId,
        command: createRemoveEventRequest(deviceIndex),
        encryptionKey,
      });

      const deleteResult = parseRemoveEventResponse(
        deleteResponse.payload,
        deleteResponse.status,
        deleteResponse.commandCode,
      );

      if (deleteResult.status === "SUCCESS") {
        console.log(`✅ Deleted alarm from index ${deviceIndex}`);
        result.deletedCount++;
      } else {
        console.warn(`⚠️ Failed to delete alarm from index ${deviceIndex}`);
      }
    }

    // Step 5: Assign indices to new alarms
    const existingWithIndices = activeAlarms.filter(
      (a) => a.deviceIndex !== null,
    );
    const indexAssignments = assignDeviceIndices(
      syncPlan.toAdd,
      existingWithIndices,
    );

    // Step 6: Add new alarms
    for (const alarm of syncPlan.toAdd) {
      currentOperation++;
      const progress = 10 + (currentOperation / totalOperations) * 80;

      const deviceIndex = indexAssignments.get(alarm.id);
      if (deviceIndex === undefined) {
        console.error(`❌ No index assigned for alarm ${alarm.id}`);
        await onSyncStatusUpdate?.(alarm.id, "ERROR");
        continue;
      }

      onProgress?.({
        step: "add",
        message: `Adding alarm: ${alarm.title}`,
        progress,
        currentOperation: {
          type: "add",
          alarmTitle: alarm.title,
          index: deviceIndex,
        },
      });

      const bleParameters = alarmDatabaseToBleParameters(alarm, deviceIndex);
      const addEventCommand = createAddEventRequest(bleParameters);

      const addResponse = await sendCommand({
        peripheralId,
        command: addEventCommand,
        encryptionKey,
      });

      const addResult = parseAddEventResponse(
        addResponse.payload,
        addResponse.status,
        addResponse.commandCode,
      );

      if (addResponse.status !== ResponseStatus.OK || addResult.status === "ERROR") {
        console.warn(`⚠️ Failed to add alarm: ${alarm.title}`);
        await onSyncStatusUpdate?.(alarm.id, "ERROR");
        continue;
      }

      // Set alarm active/inactive state
      const onOffResponse = await sendCommand({
        peripheralId,
        command: createSetEventOnOffRequest(deviceIndex, alarm.isActive),
        encryptionKey,
      });

      if (onOffResponse.status === ResponseStatus.OK) {
        console.log(
          `✅ Added alarm ${alarm.title} at index ${deviceIndex} (${alarm.isActive ? "enabled" : "disabled"})`,
        );
        result.addedCount++;
        result.finalDeviceIndexMap.set(alarm.id, deviceIndex);

        // Notify about index assignment
        await onIndexAssigned?.(alarm.id, deviceIndex);
        await onSyncStatusUpdate?.(alarm.id, "SYNCED");
      } else {
        console.warn(`⚠️ Failed to set alarm state for ${alarm.title}`);
        await onSyncStatusUpdate?.(alarm.id, "ERROR");
      }
    }

    // Step 7: Update existing alarms
    for (const alarm of syncPlan.toUpdate) {
      currentOperation++;
      const progress = 10 + (currentOperation / totalOperations) * 80;

      if (alarm.deviceIndex === null) {
        console.error(`❌ Cannot update alarm ${alarm.id} - no device index`);
        await onSyncStatusUpdate?.(alarm.id, "ERROR");
        continue;
      }

      onProgress?.({
        step: "update",
        message: `Updating alarm: ${alarm.title}`,
        progress,
        currentOperation: {
          type: "update",
          alarmTitle: alarm.title,
          index: alarm.deviceIndex,
        },
      });

      // Update = Delete + Add at same index
      const deleteResponse = await sendCommand({
        peripheralId,
        command: createRemoveEventRequest(alarm.deviceIndex),
        encryptionKey,
      });

      if (deleteResponse.status !== ResponseStatus.OK) {
        console.warn(`⚠️ Failed to delete alarm for update: ${alarm.title}`);
        await onSyncStatusUpdate?.(alarm.id, "ERROR");
        continue;
      }

      const bleParameters = alarmDatabaseToBleParameters(
        alarm,
        alarm.deviceIndex,
      );
      const addEventCommand = createAddEventRequest(bleParameters);

      const addResponse = await sendCommand({
        peripheralId,
        command: addEventCommand,
        encryptionKey,
      });

      if (addResponse.status !== ResponseStatus.OK) {
        console.warn(`⚠️ Failed to re-add updated alarm: ${alarm.title}`);
        await onSyncStatusUpdate?.(alarm.id, "ERROR");
        continue;
      }

      // Set alarm active/inactive state
      const onOffResponse = await sendCommand({
        peripheralId,
        command: createSetEventOnOffRequest(
          alarm.deviceIndex,
          alarm.isActive,
        ),
        encryptionKey,
      });

      if (onOffResponse.status === ResponseStatus.OK) {
        console.log(
          `✅ Updated alarm ${alarm.title} at index ${alarm.deviceIndex}`,
        );
        result.updatedCount++;
        result.finalDeviceIndexMap.set(alarm.id, alarm.deviceIndex);
        await onSyncStatusUpdate?.(alarm.id, "SYNCED");
      } else {
        console.warn(`⚠️ Failed to set updated alarm state for ${alarm.title}`);
        await onSyncStatusUpdate?.(alarm.id, "ERROR");
      }
    }

    // Add unchanged alarms to final index map
    for (const alarm of syncPlan.unchanged) {
      if (alarm.deviceIndex !== null) {
        result.finalDeviceIndexMap.set(alarm.id, alarm.deviceIndex);
      }
    }

    onProgress?.({
      step: "complete",
      message: "Sync completed successfully!",
      progress: 100,
    });

    console.log(
      `🎉 Incremental sync complete: ${result.addedCount} added, ${result.updatedCount} updated, ${result.deletedCount} deleted, ${result.expiredCleanedCount} expired cleaned`,
    );

    result.success = true;
    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Incremental alarm sync failed:", errorMessage);

    onProgress?.({
      step: "error",
      message: `Sync failed: ${errorMessage}`,
      progress: 0,
    });

    result.error = errorMessage;
    return result;
  }
}
