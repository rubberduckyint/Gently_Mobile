/**
 * Reboot Device Command
 * Reboots the bracelet device
 */

import type { BLECommandRequest } from "~/services/ble/types";
import { sendCommand } from "~/services/ble/manager";
import { CommandCode, ResponseStatus } from "~/services/ble/types";

/**
 * Create a reboot device command request
 * @returns BLE command request for rebooting the device
 */
export function createRebootDeviceRequest(): BLECommandRequest {
  return {
    command: CommandCode.REBOOT_BRACELET,
    apiVersion: 2,
    payload: new Uint8Array(0), // No payload needed for reboot
  };
}

/**
 * Reboot the device
 * @param peripheralId - The peripheral ID of the connected device
 * @param encryptionKey - The encryption key for the device
 * @returns Promise that resolves when the command is sent successfully
 */
export async function rebootDevice(
  peripheralId: string,
  encryptionKey: string,
): Promise<void> {
  try {
    console.log(`🔄 Rebooting device ${peripheralId}...`);

    const command = createRebootDeviceRequest();
    const response = await sendCommand({
      peripheralId,
      command,
      encryptionKey,
    });

    if (response.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${response.status}`);
    }

    console.log(`✅ Device ${peripheralId} reboot command sent successfully`);
  } catch (error) {
    console.error(`❌ Failed to reboot device ${peripheralId}:`, error);
    throw error;
  }
}

export default {
  createRebootDeviceRequest,
  rebootDevice,
};
