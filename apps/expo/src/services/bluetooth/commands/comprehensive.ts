// Comprehensive device details command
import type { SecureConnectionResult } from "../connection";
import type { DeviceInfo } from "../types";
import { readSecureDeviceInfo } from "./deviceInfo";
import { readSecureBatteryLevel, readSecureDeviceTime } from "./deviceStatus";

/**
 * Get comprehensive device details (info + time + battery)
 */
export async function readComprehensiveDeviceDetails(
  connectionResult: SecureConnectionResult,
): Promise<{
  deviceInfo: DeviceInfo;
  deviceTime: Date;
  batteryLevel: number;
  timestamp: Date;
}> {
  console.log("📋 Reading comprehensive device details...");

  try {
    // Get all device details in parallel for better performance
    const [deviceInfo, deviceTime, batteryLevel] = await Promise.all([
      readSecureDeviceInfo(connectionResult),
      readSecureDeviceTime(connectionResult),
      readSecureBatteryLevel(connectionResult),
    ]);

    const result = {
      deviceInfo,
      deviceTime,
      batteryLevel,
      timestamp: new Date(), // Current system time for reference
    };

    console.log("✅ Successfully read comprehensive device details:", result);
    return result;
  } catch (error) {
    console.error("❌ Error reading comprehensive device details:", error);
    throw error;
  }
}
