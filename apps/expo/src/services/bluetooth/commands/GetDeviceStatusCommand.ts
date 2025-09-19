/**
 * Get Device Status Command
 *
 * Retrieves device status information including battery level
 * and other status indicators.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode, ResponseStatus } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

export interface DeviceStatusResponse {
  batteryLevel: number; // 0-100 percentage
  connectionUsed: boolean;
}

export interface DeviceStatus {
  batteryVoltage: number;
  charging: boolean;
  batteryLevel: number;
}

export class GetDeviceStatusCommand extends BLECommand<DeviceStatusResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "get-device-status",
    name: "Get Device Status",
    description: "Retrieve device status including battery level",
    category: "device-status",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 1500,
    tags: ["status", "battery", "health"],
  };

  /**
   * Create the request payload for device status command
   */
  static createRequest(): Uint8Array {
    // 6 bytes of padding as per protocol
    return new Uint8Array(6);
  }

  /**
   * Parse the response payload for device status command
   */
  static parseResponse(
    payload: Uint8Array,
    status: ResponseStatus,
  ): DeviceStatus {
    if (status !== ResponseStatus.OK) {
      throw new Error(`Device status request failed with status: ${status}`);
    }

    if (payload.length < 3) {
      throw new Error("Invalid device status response");
    }

    const batteryVoltage = new DataView(
      payload.buffer,
      payload.byteOffset,
    ).getUint16(0, true);
    const flags = payload[2] ?? 0;
    const charging = !!(flags & 0x04);
    const batteryLevel = (flags >> 3) & 0x07;

    return {
      batteryVoltage,
      charging,
      batteryLevel,
    };
  }

  /**
   * Log human-readable details about the response payload
   */
  static logPayloadDetails(payload: Uint8Array): void {
    if (payload.length >= 3) {
      const batteryVoltage = new DataView(
        payload.buffer,
        payload.byteOffset,
      ).getUint16(0, true);
      const flags = payload[2] ?? 0;
      const _charging = !!(flags & 0x04);
      const batteryLevel = (flags >> 3) & 0x07;

      // Add battery level warnings for critical issues only
      if (batteryLevel <= 1) {
        console.warn("LOW BATTERY WARNING!");
      } else if (batteryVoltage < 3000) {
        console.warn("Critical voltage - device may shut down soon");
      }
    } else {
      console.log(
        "🔓 PROTOCOL:     ❌ Invalid device status response - payload too short",
      );
    }
  }

  /**
   * Log detailed human-readable device status information
   */
  static logDeviceStatusDetails(status: DeviceStatus): void {
    console.log("📊 DEVICE STATUS DETAILS:");
    console.log(`   🔋 Battery Voltage: ${status.batteryVoltage}mV`);
    console.log(
      `   📊 Battery Level: ${status.batteryLevel}/7 (${Math.round((status.batteryLevel / 7) * 100)}%)`,
    );
    console.log(`   ⚡ Charging: ${status.charging ? "Yes" : "No"}`);

    // Battery health assessment
    const batteryPercentage = Math.round((status.batteryLevel / 7) * 100);
    let healthStatus = "";
    if (batteryPercentage >= 85) {
      healthStatus = "Excellent 🟢";
    } else if (batteryPercentage >= 60) {
      healthStatus = "Good 🟡";
    } else if (batteryPercentage >= 30) {
      healthStatus = "Fair 🟠";
    } else {
      healthStatus = "Poor 🔴";
    }
    console.log(`   💚 Battery Health: ${healthStatus}`);

    // Voltage analysis
    if (status.batteryVoltage >= 4000) {
      console.log(
        `   🔋 Voltage Status: High - ${status.charging ? "Charging" : "Recently charged"}`,
      );
    } else if (status.batteryVoltage >= 3600) {
      console.log(`   🔋 Voltage Status: Normal operating range`);
    } else if (status.batteryVoltage >= 3200) {
      console.log(`   🔋 Voltage Status: Low - consider charging soon`);
    } else {
      console.log(`   🔋 Voltage Status: Critical - charge immediately`);
    }

    // Charging recommendations
    if (!status.charging && status.batteryLevel <= 2) {
      console.log(`   💡 Recommendation: Charge device soon`);
    } else if (status.charging && status.batteryLevel >= 6) {
      console.log(`   💡 Recommendation: Device is well charged`);
    }
  }

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<DeviceStatusResponse> {
    this.log("info", "Getting device status");

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      this.log("info", "Establishing connection for status request...");
      connection = await context.connect();
      shouldDisconnect = true;
    } else {
      this.log("info", "Using existing connection");
    }

    try {
      const statusPayload = await sendSecureCommand(
        connection,
        CommandCode.GET_DEVICE_STATUS,
      );

      // Parse the status response using the static method
      const deviceStatus = GetDeviceStatusCommand.parseResponse(
        statusPayload,
        ResponseStatus.OK,
      );

      // Log detailed human-readable information
      this.log("info", "Device status retrieved successfully");
      GetDeviceStatusCommand.logDeviceStatusDetails(deviceStatus);

      // Convert to percentage for the response
      const batteryPercentage = Math.round(
        (deviceStatus.batteryLevel / 7) * 100,
      );

      return {
        batteryLevel: batteryPercentage,
        connectionUsed: !shouldDisconnect,
      };
    } catch (error) {
      this.log(
        "error",
        `Failed to get device status: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    } finally {
      if (shouldDisconnect) {
        await context.disconnect();
      }
    }
  }
}
