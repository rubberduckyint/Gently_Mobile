/**
 * Device Information Command
 *
 * Retrieves comprehensive device information including hardware version,
 * firmware version, and other device-specific details.
 */

import type { DeviceInformation } from "../protocol-types";
import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode, ResponseStatus } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

export interface DeviceInfoResponse extends DeviceInformation {
  connectionUsed: boolean; // Whether an existing connection was used
}

export class DeviceInfoCommand extends BLECommand<DeviceInfoResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "device-info",
    name: "Get Device Information",
    description: "Retrieve device hardware and firmware information",
    category: "device-info",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 2000, // 2 seconds
    tags: ["device", "info", "hardware", "firmware"],
  };

  /**
   * Create the request payload for device info command
   */
  static createRequest(): Uint8Array {
    // 6 bytes of padding as per protocol
    return new Uint8Array(6);
  }

  /**
   * Parse the response payload for device info command
   */
  static parseResponse(
    payload: Uint8Array,
    status: ResponseStatus,
  ): DeviceInformation {
    if (status !== ResponseStatus.OK) {
      throw new Error(`Device info request failed with status: ${status}`);
    }

    if (payload.length < 4) {
      throw new Error("Invalid device info response");
    }

    return {
      hardwareVersion: payload[0] ?? 0,
      firmwareVersionMajor: payload[1] ?? 0,
      firmwareVersionMinor: payload[2] ?? 0,
      firmwareBuildNumber: payload[3] ?? 0,
    };
  }

  /**
   * Log human-readable details about the response payload
   */
  static logPayloadDetails(payload: Uint8Array): void {
    if (payload.length >= 4) {
      const hwVersion = payload[0] ?? 0;
      const swVersionMajor = payload[1] ?? 0;
      const swVersionMinor = payload[2] ?? 0;
      const buildNumber = payload[3] ?? 0;
      console.log(`🔓 PROTOCOL:     💾 Hardware Version: ${hwVersion}`);
      console.log(
        `🔓 PROTOCOL:     🔢 Software Version: ${swVersionMajor}.${swVersionMinor}`,
      );
      console.log(`🔓 PROTOCOL:     🏗️  Build Number: ${buildNumber}`);
    } else {
      console.log(
        `🔓 PROTOCOL:     ⚠️  Device info payload too short: ${payload.length} bytes`,
      );
    }
  }

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<DeviceInfoResponse> {
    this.log("info", "Starting device information retrieval");

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      this.log(
        "info",
        "No existing connection, establishing new connection...",
      );
      connection = await context.connect();
      shouldDisconnect = true;
    } else {
      this.log("info", "Using existing connection");
    }

    try {
      // Get device info using secure protocol
      this.log("info", "Requesting device information via secure protocol...");
      const infoPayload = await sendSecureCommand(
        connection,
        CommandCode.GET_DEVICE_INFO,
      );

      // Parse device info from response
      const deviceInfo = this.parseDeviceInfoResponse(infoPayload);

      this.log("info", "Device information retrieved successfully", {
        hardwareVersion: deviceInfo.hardwareVersion,
        firmwareVersion: `${deviceInfo.firmwareVersionMajor}.${deviceInfo.firmwareVersionMinor}`,
        buildNumber: deviceInfo.firmwareBuildNumber,
      });

      return {
        ...deviceInfo,
        connectionUsed: !shouldDisconnect,
      };
    } finally {
      if (shouldDisconnect) {
        this.log("info", "Disconnecting from device...");
        await context.disconnect();
      }
    }
  }

  /**
   * Parse device info response from secure protocol
   */
  private parseDeviceInfoResponse(payload: Uint8Array): DeviceInformation {
    // Device info response format (based on protocol):
    // [status][hardware_version][firmware_major][firmware_minor][build_number]

    if (payload.length < 5) {
      throw new Error("Invalid device info response length");
    }

    const status = payload[0];
    if (status !== 0x00) {
      throw new Error(
        `Device info request failed with status: 0x${status?.toString(16).padStart(2, "0")}`,
      );
    }

    return {
      hardwareVersion: payload[1] ?? 0,
      firmwareVersionMajor: payload[2] ?? 0,
      firmwareVersionMinor: payload[3] ?? 0,
      firmwareBuildNumber: payload[4] ?? 0,
    };
  }
}
