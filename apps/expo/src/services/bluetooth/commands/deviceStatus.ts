// Device status related commands (battery, time, etc.)
import type { SecureConnectionResult } from "../connection";
import { CommandCode } from "../protocol";
import { sendSecureCommand } from "./core";

/**
 * Parse battery level from device status response
 */
function parseBatteryFromStatus(statusPayload: Uint8Array): number {
  // Status response format depends on the BLE protocol specification
  // For now, assume battery is in the first byte as percentage
  if (statusPayload.length === 0) {
    return 0;
  }

  // Extract battery percentage from status payload
  const batteryLevel = statusPayload[0] ?? 0;
  return Math.min(100, Math.max(0, batteryLevel));
}

/**
 * Parse time from device time response
 */
function parseTimeResponse(timePayload: Uint8Array): Date {
  // Time response format (based on protocol):
  // [year_low][year_high][month][day][hour][minute][second]

  if (timePayload.length < 7) {
    throw new Error("Invalid time response format");
  }

  const year = (timePayload[0] ?? 0) | ((timePayload[1] ?? 0) << 8);
  const month = (timePayload[2] ?? 1) - 1; // JavaScript months are 0-based
  const day = timePayload[3] ?? 1;
  const hour = timePayload[4] ?? 0;
  const minute = timePayload[5] ?? 0;
  const second = timePayload[6] ?? 0;

  return new Date(year, month, day, hour, minute, second);
}

/**
 * Get battery level using secure protocol
 */
export async function readSecureBatteryLevel(
  connectionResult: SecureConnectionResult,
): Promise<number> {
  try {
    const statusPayload = await sendSecureCommand(
      connectionResult,
      CommandCode.GET_DEVICE_STATUS,
    );

    // Parse battery level from status response
    return parseBatteryFromStatus(statusPayload);
  } catch (error) {
    console.error("❌ Error reading secure battery level:", error);
    return 0; // Default battery level
  }
}

/**
 * Get device time using secure protocol
 */
export async function readSecureDeviceTime(
  connectionResult: SecureConnectionResult,
): Promise<Date> {
  try {
    console.log("🕐 Reading secure device time...");

    const timePayload = await sendSecureCommand(
      connectionResult,
      CommandCode.GET_TIME,
    );

    // Parse time from response
    const deviceTime = parseTimeResponse(timePayload);

    console.log("✅ Successfully read device time:", deviceTime);
    return deviceTime;
  } catch (error) {
    console.error("❌ Error reading secure device time:", error);
    // Return current system time as fallback
    return new Date();
  }
}
