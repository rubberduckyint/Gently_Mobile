/**
 * Reboot Device Command
 *
 * Triggers a device reboot. Note that this will disconnect the BLE connection.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

export interface RebootResponse {
  success: boolean;
  message: string;
}

export class RebootDeviceCommand extends BLECommand<RebootResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "reboot-device",
    name: "Reboot Device",
    description: "Trigger a device reboot (will disconnect BLE)",
    category: "device-control",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 3000,
    tags: ["reboot", "restart", "control", "system"],
  };

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<RebootResponse> {
    this.log("info", "Initiating device reboot");
    this.log("warn", "Device will reboot and BLE connection will be lost");

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      this.log("info", "Establishing connection for reboot command...");
      connection = await context.connect();
      shouldDisconnect = true;
    } else {
      this.log("info", "Using existing connection");
    }

    try {
      this.log("info", "Sending reboot command to device...");

      // Send reboot command - device may disconnect before responding
      const response = await sendSecureCommand(
        connection,
        CommandCode.REBOOT_BRACELET,
      );

      if (response.length >= 1) {
        const status = response[0] ?? 0xff;
        const success = status === 0x00;

        if (success) {
          this.log("info", "Reboot command acknowledged by device");
          return {
            success: true,
            message: "Device reboot initiated successfully",
          };
        } else {
          this.log(
            "warn",
            `Reboot command failed with status: 0x${status.toString(16).padStart(2, "0")}`,
          );
          return {
            success: false,
            message: `Reboot failed with status: 0x${status.toString(16).padStart(2, "0")}`,
          };
        }
      } else {
        throw new Error("Invalid reboot response");
      }
    } catch (error) {
      // Connection loss during reboot is expected
      if (
        error instanceof Error &&
        (error.message.includes("disconnect") ||
          error.message.includes("connection"))
      ) {
        this.log("info", "Connection lost during reboot - this is expected");
        return {
          success: true,
          message: "Device rebooted (connection lost as expected)",
        };
      }
      throw error;
    } finally {
      // Always try to disconnect gracefully, but don't throw if it fails
      if (shouldDisconnect) {
        try {
          await context.disconnect();
        } catch {
          // Ignore disconnect errors during reboot
          this.log(
            "info",
            "Disconnect failed - device likely already rebooted",
          );
        }
      }
    }
  }
}
