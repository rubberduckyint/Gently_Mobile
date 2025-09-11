// Device details and time retrieval command
import type { SecureConnectionResult } from "../connection";
import type { DeviceDetailsResult } from "./events";
import { readComprehensiveDeviceDetails } from "./comprehensive";

/**
 * Get device details and time in a single request
 * Matches device by serial ID and handles connection termination gracefully
 */
export async function getDeviceDetailsAndTime(
  connectFunction: (deviceId: string) => Promise<SecureConnectionResult>,
  deviceId: string,
): Promise<DeviceDetailsResult> {
  let connectionResult: SecureConnectionResult | null = null;

  try {
    console.log(`📱 Getting device details for device: ${deviceId}`);

    // Connect to device
    connectionResult = await connectFunction(deviceId);
    console.log("✅ Successfully connected to device");

    // Read comprehensive device details
    const details = await readComprehensiveDeviceDetails(connectionResult);

    console.log("📋 Device details retrieved:", details);

    return {
      success: true,
      deviceInfo: {
        serialNumber: details.deviceInfo.serialNumber,
        batteryLevel: details.deviceInfo.batteryLevel,
        firmwareVersion: details.deviceInfo.firmwareVersion,
        currentTime: details.deviceTime,
      },
      message: `Device details retrieved successfully. Serial: ${details.deviceInfo.serialNumber}`,
    };
  } catch (error) {
    const errorMessage = `Failed to get device details: ${String(error)}`;
    console.log("⚠️ Device details request failed:", error);

    const isConnectionError =
      String(error).toLowerCase().includes("disconnect") ||
      String(error).toLowerCase().includes("connection") ||
      String(error).toLowerCase().includes("timeout");

    return {
      success: false,
      message: errorMessage,
      connectionTerminated: isConnectionError,
    };
  } finally {
    // Always disconnect gracefully
    if (connectionResult) {
      try {
        console.log("🔌 Disconnecting from device...");
        await connectionResult.device.cancelConnection();
        console.log("✅ Successfully disconnected from device");
      } catch (disconnectError) {
        console.log("ℹ️ Connection termination noted:", disconnectError);
      }
    }
  }
}
