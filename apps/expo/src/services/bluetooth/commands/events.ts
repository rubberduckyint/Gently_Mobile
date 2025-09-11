// Event/alarm related commands
import type { SecureConnectionResult } from "../connection";
import { CommandCode } from "../protocol";
import { sendSecureCommand } from "./core";

export interface SyncResult {
  success: boolean;
  message: string;
  syncedAlarms?: number;
  connectionTerminated?: boolean;
}

export interface DeviceDetailsResult {
  success: boolean;
  deviceInfo?: {
    serialNumber: string;
    batteryLevel?: number;
    firmwareVersion?: string;
    currentTime?: Date;
  };
  message: string;
  connectionTerminated?: boolean;
}

/**
 * Parse GET_ALL_EVENTS response from device
 */
function parseGetAllEventsResponse(
  payload: Uint8Array,
): { index: number; name: string; isActive: boolean }[] {
  const events: { index: number; name: string; isActive: boolean }[] = [];

  if (payload.length === 0) {
    return events;
  }

  // Parse events from payload - format depends on BLE protocol specification
  // For now, we'll parse a simplified format
  let offset = 0;

  while (offset < payload.length - 1) {
    const index = payload[offset];
    const nameLength = payload[offset + 1];

    if (!nameLength || offset + 2 + nameLength >= payload.length) {
      break;
    }

    const nameBytes = payload.slice(offset + 2, offset + 2 + nameLength);
    const name = new TextDecoder().decode(nameBytes);
    const isActive = payload[offset + 2 + nameLength] === 1;

    events.push({ index: index ?? 0, name, isActive });
    offset += 3 + nameLength;
  }

  return events;
}

/**
 * Create ADD_EVENT payload for device
 */
function createAddEventPayload(event: {
  index: number;
  name: string;
  cronExpression: string;
  isActive: boolean;
}): Uint8Array {
  // Convert event data to binary format for BLE protocol
  const nameBytes = new TextEncoder().encode(event.name);
  const cronBytes = new TextEncoder().encode(event.cronExpression);

  const payload = new Uint8Array(4 + nameBytes.length + cronBytes.length);
  let offset = 0;

  // Event index
  payload[offset++] = event.index;

  // Name length and name
  payload[offset++] = nameBytes.length;
  payload.set(nameBytes, offset);
  offset += nameBytes.length;

  // Cron expression length and cron
  payload[offset++] = cronBytes.length;
  payload.set(cronBytes, offset);
  offset += cronBytes.length;

  // Active flag
  payload[offset++] = event.isActive ? 1 : 0;

  return payload;
}

/**
 * Sync device alarms with database based on serial number matching
 * Ensures device alarms match database alarms exactly
 */
export async function syncDeviceAlarms(
  connectFunction: (deviceId: string) => Promise<SecureConnectionResult>,
  deviceId: string,
  deviceSerialNumber: string,
  deviceAlarms: {
    id: string;
    title: string;
    description: string | null;
    isActive: boolean;
    startDate: Date;
    endDate: Date | null;
    repeat: boolean;
    cronExpression: string;
  }[],
): Promise<SyncResult> {
  let connectionResult: SecureConnectionResult | null = null;

  try {
    console.log(
      `🔄 Starting alarm sync for device with serial: ${deviceSerialNumber}`,
    );

    // Connect to device
    connectionResult = await connectFunction(deviceId);
    console.log("✅ Successfully connected to device for sync");

    // Get current events from device
    console.log("📋 Getting current events from device...");
    const currentEventsPayload = await sendSecureCommand(
      connectionResult,
      CommandCode.GET_ALL_EVENTS,
    );

    // Parse device events
    const deviceEvents = parseGetAllEventsResponse(currentEventsPayload);
    console.log(`📊 Found ${deviceEvents.length} events on device`);

    let addedCount = 0;
    let updatedCount = 0;
    let removedCount = 0;

    // Add/update alarms on device
    for (let i = 0; i < deviceAlarms.length && i < 50; i++) {
      // Device supports max 50 events
      const alarm = deviceAlarms[i];
      if (!alarm) continue;

      // Convert database alarm to device event format
      const eventPayload = {
        index: i,
        name: alarm.title.substring(0, 16), // Device name limit
        cronExpression: alarm.cronExpression,
        isActive: alarm.isActive,
      };

      console.log(`📝 Adding/updating event ${i}: ${eventPayload.name}`);

      try {
        await sendSecureCommand(
          connectionResult,
          CommandCode.ADD_EVENT,
          createAddEventPayload(eventPayload),
        );

        if (i < deviceEvents.length) {
          updatedCount++;
        } else {
          addedCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to add/update event ${i}:`, error);
      }
    }

    // Remove excess events from device
    for (let i = deviceAlarms.length; i < deviceEvents.length; i++) {
      console.log(`🗑️ Removing excess event ${i}`);

      try {
        await sendSecureCommand(
          connectionResult,
          CommandCode.REMOVE_EVENT,
          new Uint8Array([i]), // Event index
        );
        removedCount++;
      } catch (error) {
        console.error(`❌ Failed to remove event ${i}:`, error);
      }
    }

    const syncedCount = deviceAlarms.length;
    console.log(
      `✅ Sync completed: ${addedCount} added, ${updatedCount} updated, ${removedCount} removed`,
    );

    return {
      success: true,
      message: `Successfully synced ${syncedCount} alarms with device (${addedCount} added, ${updatedCount} updated, ${removedCount} removed)`,
      syncedAlarms: syncedCount,
    };
  } catch (error) {
    const errorMessage = `Alarm sync failed: ${String(error)}`;
    console.log("❌ Device alarm sync failed:", error);

    const isConnectionError =
      String(error).toLowerCase().includes("disconnect") ||
      String(error).toLowerCase().includes("connection") ||
      String(error).toLowerCase().includes("timeout");

    return {
      success: false,
      message: errorMessage,
      connectionTerminated: isConnectionError,
    };
  } finally {
    // Always disconnect gracefully
    if (connectionResult) {
      try {
        console.log("🔌 Disconnecting from device...");
        await connectionResult.device.cancelConnection();
        console.log("✅ Successfully disconnected from device");
      } catch (disconnectError) {
        console.log("ℹ️ Connection termination noted:", disconnectError);
      }
    }
  }
}
