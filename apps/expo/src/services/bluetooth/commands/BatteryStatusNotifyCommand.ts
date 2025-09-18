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
  level: number; // Battery level (0-4): 0=CRITICAL, 1=LOW, 2=MEDIUM, 3=GOOD, 4=FULL
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
    if (payload.length < 3) {
      throw new Error(
        `Invalid battery status notification: payload too short (${payload.length} bytes, expected at least 3)`,
      );
    }

    // The payload is extracted after API|Command|Reserved, so:
    // Full packet: API(01) | Command(80) | Reserved(00) | Voltage(fb0f) | Charging+Level(04) | Reserved(0000)
    // Payload:                                           ↑ starts here: fb0f040000
    // Payload byte 0-1: Battery Voltage in mV (Uint16, little endian)
    // Payload byte 2: Bit 0 = Charging (1/0), Bits 1-7 = Battery Level (0x00-0x04)
    // Payload byte 3-4: Reserved (0 padded)

    const voltage = new DataView(payload.buffer, payload.byteOffset).getUint16(
      0, // Voltage starts at byte 0 in payload
      true, // little endian
    );
    
    const chargingAndLevelByte = payload[2] ?? 0;
    const charging = (chargingAndLevelByte & 0x01) !== 0; // Bit 0
    const level = (chargingAndLevelByte >> 1) & 0x7F; // Bits 1-7

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
    // Battery level names according to protocol
    const levelNames = ["CRITICAL", "LOW", "MEDIUM", "GOOD", "FULL"];
    const levelName = levelNames[data.level] ?? `UNKNOWN(${data.level})`;
    
    console.log("🔋 BATTERY STATUS NOTIFICATION:");
    console.log(`   • Voltage: ${data.voltage}mV`);
    console.log(
      `   • Level: ${data.level}/4 (${levelName}) - ${Math.round((data.level / 4) * 100)}%`,
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
