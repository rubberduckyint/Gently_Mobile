/**
 * Remove All Events Command
 * Removes all stored events from the device
 */

import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

/**
 * Remove all events from device
 * Warning: This permanently deletes all stored events
 */
export async function removeAllEvents(serialNumber: string): Promise<void> {
  try {
    console.log("\n🗑️ Removing all events...");
    console.log("⚠️ This will permanently delete all stored events");

    const response = await executeBLECommand(
      {
        command: CommandCode.REMOVE_ALL_EVENTS,
        apiVersion: 1,
      },
      serialNumber,
    );

    if (response.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${response.status}`);
    }

    console.log("✅ All events removed successfully");
    console.log("🧹 Device event storage has been cleared");
  } catch (error) {
    console.error("❌ Failed to remove all events:", error);
    throw new Error(
      `Failed to remove all events: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
