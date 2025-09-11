// Device info related commands
import type { Device } from "react-native-ble-plx";

import type { SecureConnectionResult } from "../connection";
import type { DeviceInfo } from "../types";
import { CommandCode } from "../protocol";
import { sendSecureCommand } from "./core";

/**
 * Parse device info response from secure protocol
 */
function parseDeviceInfoResponse(payload: Uint8Array): DeviceInfo {
  // Device info response format (based on protocol):
  // [status][serial_number_length][serial_number...][firmware_version_length][firmware_version...]

  if (payload.length < 2) {
    throw new Error("Invalid device info response");
  }

  const status = payload[0];
  if (status !== 0x00) {
    throw new Error(
      `Device info request failed with status: 0x${status?.toString(16).padStart(2, "0")}`,
    );
  }

  let offset = 1;

  // Parse serial number
  const serialLength = payload[offset++];
  if (!serialLength || offset + serialLength > payload.length) {
    throw new Error("Invalid serial number in device info response");
  }

  const serialBytes = payload.slice(offset, offset + serialLength);
  const serialNumber = new TextDecoder().decode(serialBytes);
  offset += serialLength;

  // Parse firmware version if available
  let firmwareVersion = "Unknown";
  if (offset < payload.length) {
    const firmwareLength = payload[offset++];
    if (firmwareLength && offset + firmwareLength <= payload.length) {
      const firmwareBytes = payload.slice(offset, offset + firmwareLength);
      firmwareVersion = new TextDecoder().decode(firmwareBytes);
    }
  }

  return {
    serialNumber,
    firmwareVersion,
    batteryLevel: 0, // Will be read separately
  };
}

/**
 * Read device info using secure protocol (recommended method)
 */
export async function readSecureDeviceInfo(
  connectionResult: SecureConnectionResult,
): Promise<DeviceInfo> {
  try {
    console.log("📋 Reading secure device info...");

    // Get device info using secure protocol
    const infoPayload = await sendSecureCommand(
      connectionResult,
      CommandCode.GET_DEVICE_INFO,
    );

    // Parse device info from response
    const deviceInfo = parseDeviceInfoResponse(infoPayload);

    console.log("✅ Successfully read device info:", deviceInfo);
    return deviceInfo;
  } catch (error) {
    console.error("❌ Error reading secure device info:", error);

    // Fallback to legacy method if secure fails
    console.log("🔄 Falling back to legacy device info reading...");
    return readDeviceInfo(connectionResult.device);
  }
}

/**
 * Legacy device info reading for backward compatibility
 */
export function readDeviceInfo(device: Device): DeviceInfo {
  try {
    console.log("📋 Reading device info for:", device.name ?? device.id);
    console.log("⚠️ Using legacy device info reading");

    // Legacy approach - read basic device properties
    const deviceInfo: DeviceInfo = {
      serialNumber: device.id,
      firmwareVersion: "Unknown",
      batteryLevel: 0, // Will be read separately
    };

    console.log("✅ Legacy device info read:", deviceInfo);
    return deviceInfo;
  } catch (error) {
    console.error("❌ Error reading legacy device info:", error);
    throw new Error(`Failed to read device info: ${String(error)}`);
  }
}
