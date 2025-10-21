/**
 * useAlarmSync Hook
 * Manages automatic syncing of alarms to connected BLE devices
 * Uses full sync approach: clears all device events and re-adds active alarms
 */

import { useRef, useState } from "react";

import type { AlarmForSync } from "~/utils/alarmSync";
import { useBLE } from "~/contexts/BLEContext";
import { syncAlarmsToDevice } from "~/utils/alarmSync";
import { trpc } from "~/utils/api";

interface UseAlarmSyncOptions {
  deviceSerialNumber?: string;
  enabled?: boolean;
  onSyncComplete?: () => void;
}

export function useAlarmSync({
  deviceSerialNumber,
  enabled: _enabled = true,
  onSyncComplete,
}: UseAlarmSyncOptions) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncInProgressRef = useRef(false);

  const { connectedDevice, encryptionKey } = useBLE();

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

  return {
    isSyncing,
    syncProgress,
    lastSyncTime,
    performSync,
  };
}
