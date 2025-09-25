/**
 * Find Me Command
 * Triggers the "Find Me" function on the device (LED, vibration, etc.)
 */

import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

/**
 * Trigger "Find Me" function on device with a chosen audio pattern
 * This will make the device light up, vibrate, or otherwise indicate its location
 */
export async function findMe(serialNumber: string): Promise<void> {
  await findMeWithPattern(serialNumber, 0x02);
}

export async function findMeWithPattern(
  serialNumber: string,
  audioPattern: number,
): Promise<void> {
  try {
    if (
      !Number.isInteger(audioPattern) ||
      audioPattern < 0 ||
      audioPattern > 0xff
    ) {
      throw new Error("Audio pattern must be an integer between 0 and 255");
    }

    console.log(
      `\n📢 Triggering Find Me (pattern 0x${audioPattern
        .toString(16)
        .toUpperCase()
        .padStart(2, "0")})...`,
    );

    const payload = new Uint8Array([audioPattern]);

    const response = await executeBLECommand(
      {
        command: CommandCode.FIND_ME,
        apiVersion: 1,
        payload,
      },
      serialNumber,
    );

    if (response.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${response.status}`);
    }

    console.log("✅ Find Me triggered successfully");
    console.log(
      "💡 Device should now be indicating its location (LED/vibration)",
    );
  } catch (error) {
    console.error("❌ Failed to trigger Find Me:", error);
    throw new Error(
      `Failed to trigger Find Me: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
