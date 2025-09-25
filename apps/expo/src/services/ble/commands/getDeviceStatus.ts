/**
 * Get Device Status Command
 * Gets battery status, active events, and error information
 */

import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

export interface DeviceStatusResponse {
  batteryVoltage: number; // in mV
  batteryLevel: number; // 0-4 scale (CRITICAL, LOW, MEDIUM, GOOD, FULL)
  chargingStatus: boolean;
  activeEventsCount: number;
  errorCode: number;
  rawPayload: Uint8Array; // For debugging
}

/**
 * Get device status including battery, events, and error information
 */
export async function getDeviceStatus(
  serialNumber: string,
): Promise<DeviceStatusResponse> {
  try {
    console.log("\n📊 Requesting device status...");

    const response = await executeBLECommand(
      {
        command: CommandCode.GET_DEVICE_STATUS,
        apiVersion: 1,
      },
      serialNumber,
    );

    if (response.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${response.status}`);
    }

    if (response.payload.length < 5) {
      throw new Error("Invalid device status response: payload too short");
    }

    // Parse device status payload (supports legacy 5-byte and extended formats)
    const payload = response.payload;

    console.log("📦 Device status payload", {
      length: payload.length,
      bytes: Array.from(payload).map(
        (byte) => `0x${byte.toString(16).padStart(2, "0")}`,
      ),
    });

    // Battery voltage (2 bytes, little endian) in mV
    const batteryVoltage = (payload[0] ?? 0) | ((payload[1] ?? 0) << 8);

    // Battery level and charging status from status byte (bit0 charging, bits1-7 level)
    const statusByte = payload[2] ?? 0;
    const chargingStatus = (statusByte & 0x01) === 0x01;
    const batteryLevelRaw = (statusByte >> 1) & 0x7f;
    const batteryLevel = Math.min(batteryLevelRaw, 4);

    // Active events count (single byte as per protocol)
    const activeEventsCount = payload[3] ?? 0;

    // Reserved byte (currently unused but included for completeness)
    const reservedByte = payload[4] ?? 0;

    // Optional error code in extended payloads (fallback to 0 if absent)
    let errorCode = 0;
    if (payload.length >= 7) {
      errorCode = (payload[5] ?? 0) | ((payload[6] ?? 0) << 8);
    } else if (payload.length === 6) {
      errorCode = payload[5] ?? 0;
    }

    const status: DeviceStatusResponse = {
      batteryVoltage,
      batteryLevel,
      chargingStatus,
      activeEventsCount,
      errorCode,
      rawPayload: payload,
    };

    const batteryLevelNames = ["CRITICAL", "LOW", "MEDIUM", "GOOD", "FULL"];

    const payloadHex = Array.from(payload)
      .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
      .join(" ");

    console.log(`   • Voltage     : ${batteryVoltage} mV`);
    console.log(
      `   • Level       : ${batteryLevel}/4 (${batteryLevelNames[batteryLevel] ?? "UNKNOWN"}) [raw: ${batteryLevelRaw}]`,
    );
    console.log(`   • Charging    : ${chargingStatus ? "Yes" : "No"}`);
    console.log(`   • Active Events: ${activeEventsCount}`);
    console.log(`   • Error Code   : ${errorCode}`);
    console.log(
      `   • Reserved     : 0x${reservedByte.toString(16).padStart(2, "0")}`,
    );
    console.log(`   • Raw Bytes    : ${payloadHex}`);

    return status;
  } catch (error) {
    console.error("❌ Failed to get device status:", error);
    throw new Error(
      `Failed to get device status: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
