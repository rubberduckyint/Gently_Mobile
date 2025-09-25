/**
 * Reboot Device Command
 * Reboots the bracelet device
 */

import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

/**
 * Reboot the device
 * Warning: This will disconnect the device and it will need to be reconnected
 */
export async function rebootDevice(serialNumber: string): Promise<void> {
  try {
    console.log("\n🔄 Rebooting device...");
    console.log("⚠️ Device will disconnect after reboot");

    const response = await executeBLECommand(
      {
        command: CommandCode.REBOOT_BRACELET,
        apiVersion: 1,
      },
      serialNumber,
    );

    if (response.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${response.status}`);
    }

    console.log("✅ Device reboot command sent successfully");
    console.log("🔌 Device will now disconnect and reboot");
    console.log("⏱️ Wait a few seconds before attempting to reconnect");
  } catch (error) {
    console.error("❌ Failed to reboot device:", error);
    throw new Error(
      `Failed to reboot device: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
