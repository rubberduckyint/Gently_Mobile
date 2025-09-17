/**
 * Battery Status Notification Command
 *
 * This is an async notification sent by the device to report battery status.
 * It does not require a request from the app - it's automatically sent by the device.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { BLECommand } from "./base";

export interface BatteryStatusData {
  voltage: number; // Battery voltage in mV
  level: number; // Battery level (0-7)
  charging: boolean; // Whether device is charging
  timestamp: Date; // When the notification was received
}

export class BatteryStatusNotifyCommand extends BLECommand<BatteryStatusData> {
  readonly metadata: BLECommandMetadata = {
    id: "battery-status-notify",
    name: "Battery Status Notification",
    description: "Async notification from device about battery status",
    category: "notification",
    version: "1.0.0",
    requiresConnection: false, // This is a notification, not a request
    estimatedDuration: 0,
    tags: ["battery", "notification", "async"],
  };

  /**
   * Parse the notification payload for battery status
   */
  static parseNotification(payload: Uint8Array): BatteryStatusData {
    if (payload.length < 4) {
      throw new Error(
        `Invalid battery status notification: payload too short (${payload.length} bytes, expected at least 4)`,
      );
    }

    // Extract battery data from payload
    const voltage = new DataView(payload.buffer, payload.byteOffset).getUint16(
      0,
      true,
    );
    const level = payload[2] ?? 0;
    const charging = (payload[3] ?? 0) !== 0;

    return {
      voltage,
      level,
      charging,
      timestamp: new Date(),
    };
  }

  /**
   * Log human-readable details about the battery status notification
   */
  static logNotificationDetails(data: BatteryStatusData): void {
    console.log("🔋 BATTERY STATUS NOTIFICATION:");
    console.log(`   • Voltage: ${data.voltage}mV`);
    console.log(
      `   • Level: ${data.level}/7 (${Math.round((data.level / 7) * 100)}%)`,
    );
    console.log(`   • Charging: ${data.charging ? "Yes" : "No"}`);
    console.log(`   • Received: ${data.timestamp.toISOString()}`);

    // Add warning for low battery
    if (data.level <= 1) {
      console.log("   ⚠️  LOW BATTERY WARNING!");
    }
  }

  protected executeImpl(
    _context: BLECommandExecutionContext,
  ): Promise<BatteryStatusData> {
    throw new Error(
      "BatteryStatusNotifyCommand cannot be executed - it's a notification handler only",
    );
  }
}
