/**
 * useAlarmSync Hook
 * Manages automatic syncing of alarms to connected BLE devices
 * Uses incremental sync to only update changed alarms
 */

import { useRef, useState } from "react";

import type { AlarmWithIndex } from "~/utils/alarmManager";
import type { AlarmForSync } from "~/utils/alarmSync";
import { useBLE } from "~/contexts/BLEContext";
import { syncAlarmsToDevice } from "~/utils/alarmSync";
import { trpc } from "~/utils/api";
import { incrementalSyncAlarms } from "~/utils/incrementalAlarmSync";

interface UseAlarmSyncOptions {
  deviceSerialNumber?: string;
  enabled?: boolean;
  onSyncComplete?: () => void;
}

export function useAlarmSync({
  deviceSerialNumber,
  enabled = true,
  onSyncComplete,
}: UseAlarmSyncOptions) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncInProgressRef = useRef(false);

  const { connectionState, connectedDevice, encryptionKey } = useBLE();

  /**
   * Perform the actual sync operation
   */
  const performSync = async (
    alarms: AlarmForSync[],
    silent = false,
  ): Promise<boolean> => {
    if (!deviceSerialNumber || syncInProgressRef.current) {
      console.log(
        `⏸️ Sync skipped - deviceSerialNumber: ${!!deviceSerialNumber}, syncInProgress: ${syncInProgressRef.current}`,
      );
      return false;
    }

    // Check prerequisites before setting sync flag
    if (!connectedDevice) {
      console.log("📱 No connected device - sync aborted");
      return false;
    }

    if (!encryptionKey) {
      console.log("📱 No encryption key - sync aborted");
      return false;
    }

    try {
      syncInProgressRef.current = true;
      if (!silent) {
        setIsSyncing(true);
        setSyncProgress("Starting sync...");
      }

      console.log(
        `🔄 Starting ${silent ? "silent" : "visible"} sync of ${alarms.length} alarms to peripheral...`,
      );

      const peripheralId = connectedDevice.id;

      // Perform the sync
      const result = await syncAlarmsToDevice(
        peripheralId,
        encryptionKey,
        alarms,
        (progress) => {
          if (!silent) {
            setSyncProgress(progress.message);
          }
        },
        // Update database sync status after each alarm syncs
        async (alarmId, status) => {
          try {
            // Note: updateSyncStatus types may not be fully regenerated yet in the TypeScript server
            // but the mutation exists in the API router and will work at runtime
            const alarmRouter = trpc.alarm as unknown as Record<
              string,
              {
                mutate: (args: {
                  alarmIds: string[];
                  syncStatus: string;
                }) => Promise<unknown>;
              }
            >;
            if (alarmRouter.updateSyncStatus) {
              await alarmRouter.updateSyncStatus.mutate({
                alarmIds: [alarmId],
                syncStatus: status,
              });
            }
          } catch (error) {
            console.error(
              `❌ Failed to update sync status for alarm ${alarmId}:`,
              error,
            );
          }
        },
      );

      if (result.success) {
        setLastSyncTime(new Date());
        console.log("✅ Alarm sync completed successfully");

        // Notify completion
        onSyncComplete?.();

        return true;
      } else {
        console.error("❌ Alarm sync failed:", result.error);
        return false;
      }
    } catch (error) {
      console.error("❌ Alarm sync error:", error);
      return false;
    } finally {
      syncInProgressRef.current = false;
      if (!silent) {
        setIsSyncing(false);
        setSyncProgress("");
      }
    }
  };

  /**
   * Perform incremental sync (only sync changed alarms)
   * This is the recommended sync method for devices with 50-alarm limit
   */
  const performIncrementalSync = async (
    alarms: AlarmWithIndex[],
    silent = false,
  ): Promise<boolean> => {
    if (!deviceSerialNumber || syncInProgressRef.current) {
      console.log(
        `⏸️ Incremental sync skipped - deviceSerialNumber: ${!!deviceSerialNumber}, syncInProgress: ${syncInProgressRef.current}`,
      );
      return false;
    }

    // Check prerequisites before setting sync flag
    if (!connectedDevice) {
      console.log("📱 No connected device - incremental sync aborted");
      return false;
    }

    if (!encryptionKey) {
      console.log("📱 No encryption key - incremental sync aborted");
      return false;
    }

    try {
      syncInProgressRef.current = true;
      if (!silent) {
        setIsSyncing(true);
        setSyncProgress("Starting incremental sync...");
      }

      console.log(
        `🔄 Starting ${silent ? "silent" : "visible"} incremental sync of ${alarms.length} alarms...`,
      );

      const peripheralId = connectedDevice.id;

      // Perform the incremental sync
      const result = await incrementalSyncAlarms(
        peripheralId,
        encryptionKey,
        alarms,
        (progress) => {
          if (!silent) {
            setSyncProgress(progress.message);
          }
          console.log(`📊 ${progress.step}: ${progress.message}`);
        },
      );

      if (result.success) {
        setLastSyncTime(new Date());
        console.log(
          `✅ Incremental sync completed - Added: ${result.addedCount}, Updated: ${result.updatedCount}, Deleted: ${result.deletedCount}, Expired: ${result.expiredCleanedCount}`,
        );

        // Update device indices in the database
        const updates = Array.from(result.finalDeviceIndexMap.entries()).map(
          ([alarmId, deviceIndex]) => ({
            alarmId,
            deviceIndex,
          }),
        );

        if (updates.length > 0) {
          try {
            await trpc.alarm.batchUpdateDeviceIndices.mutate({ updates });
            console.log(
              `✅ Updated ${updates.length} device indices in database`,
            );
          } catch (error) {
            console.error("❌ Failed to update device indices:", error);
          }
        }

        // Notify completion
        onSyncComplete?.();

        return true;
      } else {
        console.error("❌ Incremental sync failed:", result.error);
        return false;
      }
    } catch (error) {
      console.error("❌ Incremental sync error:", error);
      return false;
    } finally {
      syncInProgressRef.current = false;
      if (!silent) {
        setIsSyncing(false);
        setSyncProgress("");
      }
    }
  };

  /**
   * Manually trigger a sync
   */
  const triggerSync = async (alarms: AlarmForSync[]): Promise<boolean> => {
    return await performSync(alarms, false);
  };

  /**
   * Manually trigger an incremental sync
   */
  const triggerIncrementalSync = async (
    alarms: AlarmWithIndex[],
  ): Promise<boolean> => {
    return await performIncrementalSync(alarms, false);
  };

  /**
   * Automatically sync unsynced alarms when connected
   */
  const autoSyncUnsyncedAlarms = async (
    alarms: AlarmForSync[],
  ): Promise<void> => {
    if (!enabled || connectionState !== "connected") {
      console.log(
        `⏸️ Auto-sync skipped - enabled: ${enabled}, connectionState: ${connectionState}`,
      );
      return;
    }

    // Check if there are any unsynced alarms
    const unsyncedAlarms = alarms.filter(
      (alarm) =>
        alarm.syncStatus === "NOT_SYNCED" || alarm.syncStatus === "ERROR",
    );

    console.log(
      `🔍 Auto-sync check - ${unsyncedAlarms.length} unsynced out of ${alarms.length} total alarms`,
    );

    if (unsyncedAlarms.length > 0 || alarms.length === 0) {
      console.log("🚀 Triggering auto-sync to peripheral...");
      // Sync ALL alarms (not just unsynced ones) to ensure deleted alarms are removed from device
      await performSync(alarms, true); // Silent sync
    }
  };

  return {
    isSyncing,
    syncProgress,
    lastSyncTime,
    triggerSync,
    triggerIncrementalSync,
    autoSyncUnsyncedAlarms,
    performSync,
    performIncrementalSync,
  };
}
