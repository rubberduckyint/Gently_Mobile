/**
 * Get Device Info Command
 * Gets hardware and firmware version information
 */

import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

export interface DeviceInfoResponse {
  hardwareVersion: number;
  firmwareVersionMajor: number;
  firmwareVersionMinor: number;
  firmwareBuildNumber: number;
}

/**
 * Get device information including hardware and firmware versions
 */
export async function getDeviceInfo(
  serialNumber: string,
): Promise<DeviceInfoResponse> {
  try {
    console.log("\n📋 Requesting device info...");

    const response = await executeBLECommand(
      {
        command: CommandCode.GET_DEVICE_INFO,
        apiVersion: 1,
      },
      serialNumber,
    );

    if (response.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${response.status}`);
    }

    if (response.payload.length < 5) {
      throw new Error("Invalid device info response: payload too short");
    }

    const payload = response.payload;

    let firmwareBuildNumber = payload[3] ?? 0;
    let reservedBytes = payload.slice(4);

    if (payload.length >= 7) {
      firmwareBuildNumber =
        (payload[3] ?? 0) |
        ((payload[4] ?? 0) << 8) |
        ((payload[5] ?? 0) << 16) |
        ((payload[6] ?? 0) << 24);
      reservedBytes = payload.slice(7);
    }

    const deviceInfo: DeviceInfoResponse = {
      hardwareVersion: payload[0] ?? 0,
      firmwareVersionMajor: payload[1] ?? 0,
      firmwareVersionMinor: payload[2] ?? 0,
      firmwareBuildNumber,
    };

    const payloadHex = Array.from(payload)
      .map((byte) => `0x${byte.toString(16).padStart(2, "0")}`)
      .join(" ");
    const reservedHex = Array.from(reservedBytes)
      .map((byte) => `0x${byte.toString(16).padStart(2, "0")}`)
      .join(" ");

    console.log("   • Hardware:", `v${deviceInfo.hardwareVersion}`);
    console.log(
      "   • Firmware:",
      `v${deviceInfo.firmwareVersionMajor}.${deviceInfo.firmwareVersionMinor} (build ${deviceInfo.firmwareBuildNumber})`,
    );
    if (reservedBytes.length > 0) {
      console.log("   • Reserved:", reservedHex || "0x00");
    }
    console.log("   • Raw Bytes:", payloadHex);

    return deviceInfo;
  } catch (error) {
    console.error("❌ Failed to get device info:", error);
    throw new Error(
      `Failed to get device info: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
