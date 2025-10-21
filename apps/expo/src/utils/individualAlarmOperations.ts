/**
 * Individual Alarm Operations
 *
 * Provides functions to add, modify, or delete individual alarms on a connected device
 * using their deviceIndex. These operations assume the device is already connected
 * and synchronized.
 *
 * NOTE: These functions are currently not used in the app. The current sync strategy
 * performs a full sync (clear all + re-add) whenever alarms change. However, these
 * functions are preserved for potential future optimization where we could implement
 * incremental updates (e.g., only add/update/delete the specific alarm that changed
 * instead of syncing all alarms). This would be more efficient but requires tracking
 * which alarms changed.
 *
 * @see useAlarmSync for the current full sync implementation
 */ import type { AddEventParams } from "~/services/ble/commands/addEvent";
import {
  createAddEventRequest,
  parseAddEventResponse,
} from "~/services/ble/commands/addEvent";
import {
  createRemoveEventRequest,
  parseRemoveEventResponse,
} from "~/services/ble/commands/removeEvent";
import {
  createSetEventOnOffRequest,
  parseSetEventOnOffResponse,
} from "~/services/ble/commands/setEventOnOff";
import { sendCommand } from "~/services/ble/manager";
import { ResponseStatus } from "~/services/ble/types";

/**
 * Add a single alarm to the device at a specific deviceIndex
 *
 * @param peripheralId - BLE peripheral ID of the connected device
 * @param encryptionKey - Encryption key for secure communication (hex string)
 * @param deviceIndex - The slot number (0-49) where the alarm should be added
 * @param bleParameters - Alarm parameters in BLE format
 * @returns Promise<{ success: boolean; deviceIndex: number; error?: string }>
 */
export async function addSingleAlarm(
  peripheralId: string,
  encryptionKey: string,
  deviceIndex: number,
  bleParameters: AddEventParams,
): Promise<{ success: boolean; deviceIndex: number; error?: string }> {
  try {
    console.log(`➕ Adding single alarm at deviceIndex ${deviceIndex}`);

    // Create and send the add event command
    const addEventCommand = createAddEventRequest(bleParameters);
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

    if (response.status === ResponseStatus.OK && result.status !== "ERROR") {
      console.log(`✅ Successfully added alarm at deviceIndex ${deviceIndex}`);
      return { success: true, deviceIndex };
    } else {
      console.error(`❌ Failed to add alarm at deviceIndex ${deviceIndex}`);
      return {
        success: false,
        deviceIndex,
        error: "Device returned error status",
      };
    }
  } catch (error) {
    console.error(
      `❌ Error adding alarm at deviceIndex ${deviceIndex}:`,
      error,
    );
    return {
      success: false,
      deviceIndex,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Modify a single alarm on the device by updating its ON/OFF state
 *
 * @param peripheralId - BLE peripheral ID of the connected device
 * @param encryptionKey - Encryption key for secure communication (hex string)
 * @param deviceIndex - The slot number (0-49) of the alarm to modify
 * @param isActive - Whether the alarm should be ON (true) or OFF (false)
 * @returns Promise<{ success: boolean; deviceIndex: number; error?: string }>
 */
export async function modifySingleAlarm(
  peripheralId: string,
  encryptionKey: string,
  deviceIndex: number,
  isActive: boolean,
): Promise<{ success: boolean; deviceIndex: number; error?: string }> {
  try {
    console.log(
      `✏️ Modifying alarm at deviceIndex ${deviceIndex} to ${isActive ? "ON" : "OFF"}`,
    );

    // Create and send the set event ON/OFF command
    const setEventCommand = createSetEventOnOffRequest(deviceIndex, isActive);
    const response = await sendCommand({
      peripheralId,
      command: setEventCommand,
      encryptionKey,
    });

    // Parse response (for validation/logging, though we primarily check response.status)
    parseSetEventOnOffResponse(response.payload, response.status);

    if (response.status === ResponseStatus.OK) {
      console.log(
        `✅ Successfully modified alarm at deviceIndex ${deviceIndex}`,
      );
      return { success: true, deviceIndex };
    } else {
      console.error(`❌ Failed to modify alarm at deviceIndex ${deviceIndex}`);
      return {
        success: false,
        deviceIndex,
        error: "Device returned error status",
      };
    }
  } catch (error) {
    console.error(
      `❌ Error modifying alarm at deviceIndex ${deviceIndex}:`,
      error,
    );
    return {
      success: false,
      deviceIndex,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Delete a single alarm from the device using its deviceIndex
 *
 * @param peripheralId - BLE peripheral ID of the connected device
 * @param encryptionKey - Encryption key for secure communication (hex string)
 * @param deviceIndex - The slot number (0-49) of the alarm to delete
 * @returns Promise<{ success: boolean; deviceIndex: number; error?: string }>
 */
export async function deleteSingleAlarm(
  peripheralId: string,
  encryptionKey: string,
  deviceIndex: number,
): Promise<{ success: boolean; deviceIndex: number; error?: string }> {
  try {
    console.log(`🗑️ Deleting alarm at deviceIndex ${deviceIndex}`);

    // Create and send the remove event command
    const removeEventCommand = createRemoveEventRequest(deviceIndex);
    const response = await sendCommand({
      peripheralId,
      command: removeEventCommand,
      encryptionKey,
    });

    const result = parseRemoveEventResponse(
      response.payload,
      response.status,
      response.commandCode,
    );

    if (response.status === ResponseStatus.OK && result.status === "SUCCESS") {
      console.log(
        `✅ Successfully deleted alarm at deviceIndex ${deviceIndex}`,
      );
      return { success: true, deviceIndex };
    } else {
      console.error(`❌ Failed to delete alarm at deviceIndex ${deviceIndex}`);
      return {
        success: false,
        deviceIndex,
        error: "Device returned error status",
      };
    }
  } catch (error) {
    console.error(
      `❌ Error deleting alarm at deviceIndex ${deviceIndex}:`,
      error,
    );
    return {
      success: false,
      deviceIndex,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update an existing alarm's parameters by overwriting it with AddEvent
 * The AddEvent command will overwrite the alarm at the specified deviceIndex
 * This is useful when you need to change alarm properties beyond just ON/OFF state
 *
 * @param peripheralId - BLE peripheral ID of the connected device
 * @param encryptionKey - Encryption key for secure communication (hex string)
 * @param deviceIndex - The slot number (0-49) of the alarm to update
 * @param newBleParameters - New alarm parameters in BLE format
 * @returns Promise<{ success: boolean; deviceIndex: number; error?: string }>
 */
export async function updateSingleAlarm(
  peripheralId: string,
  encryptionKey: string,
  deviceIndex: number,
  newBleParameters: AddEventParams,
): Promise<{ success: boolean; deviceIndex: number; error?: string }> {
  try {
    console.log(`🔄 Updating alarm at deviceIndex ${deviceIndex}`);

    // AddEvent will overwrite the existing alarm at this index
    const result = await addSingleAlarm(
      peripheralId,
      encryptionKey,
      deviceIndex,
      newBleParameters,
    );

    if (result.success) {
      console.log(
        `✅ Successfully updated alarm at deviceIndex ${deviceIndex}`,
      );
    }

    return result;
  } catch (error) {
    console.error(
      `❌ Error updating alarm at deviceIndex ${deviceIndex}:`,
      error,
    );
    return {
      success: false,
      deviceIndex,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
