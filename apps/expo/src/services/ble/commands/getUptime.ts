/**
 * Get Device Uptime Command
 * Gets the device uptime in milliseconds since last boot/reset
 */

import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

export interface UptimeResponse {
  uptime: number; // milliseconds since boot
  uptimeBytes: Uint8Array; // 8-byte uptime value for key generation
}

/**
 * Get device uptime in milliseconds
 * Returns both the uptime value and the raw bytes needed for dynamic key generation
 */
export async function getUptime(serialNumber: string): Promise<UptimeResponse> {
  try {
    console.log("\n⏰ Requesting device uptime...");

    const response = await executeBLECommand(
      {
        command: CommandCode.GET_UPTIME,
        apiVersion: 1,
      },
      serialNumber,
    );

    if (response.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${response.status}`);
    }

    if (response.payload.length < 8) {
      throw new Error("Invalid uptime response: payload too short");
    }

    // Parse uptime from 8-byte payload (little endian)
    const uptimeBytes = response.payload.slice(0, 8);
    let uptime = 0;

    for (let i = 0; i < 8; i++) {
      uptime += (uptimeBytes[i] ?? 0) * Math.pow(256, i);
    }

    // Convert from device time units to milliseconds
    // According to protocol, uptime is in 1ms units
    const uptimeMs = uptime;

    const uptimeHex = Array.from(uptimeBytes)
      .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
      .join(" ");

    console.log(`   • Uptime (ms): ${uptimeMs}`);
    console.log(`   • Raw Bytes  : ${uptimeHex}`);

    return {
      uptime: uptimeMs,
      uptimeBytes: uptimeBytes,
    };
  } catch (error) {
    console.error("❌ Failed to get uptime:", error);
    throw new Error(
      `Failed to get device uptime: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
