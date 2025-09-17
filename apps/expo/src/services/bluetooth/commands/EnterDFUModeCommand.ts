/**
 * Enter DFU Mode Command
 *
 * Puts the device into Device Firmware Update (DFU) mode for firmware updates.
 * This will disconnect the BLE connection.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

export interface EnterDFUResponse {
  success: boolean;
  message: string;
}

export class EnterDFUModeCommand extends BLECommand<EnterDFUResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "enter-dfu-mode",
    name: "Enter DFU Mode",
    description: "Put device into firmware update mode (will disconnect BLE)",
    category: "device-control",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 3000,
    tags: ["dfu", "firmware", "update", "control"],
  };

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<EnterDFUResponse> {
    this.log("info", "Entering DFU mode");
    this.log(
      "warn",
      "Device will enter DFU mode and BLE connection will be lost",
    );

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      this.log("info", "Establishing connection for DFU command...");
      connection = await context.connect();
      shouldDisconnect = true;
    } else {
      this.log("info", "Using existing connection");
    }

    try {
      this.log("info", "Sending DFU mode command to device...");

      // Send DFU command - device may disconnect before responding
      const response = await sendSecureCommand(
        connection,
        CommandCode.ENTER_DFU_MODE,
      );

      if (response.length >= 1) {
        const status = response[0] ?? 0xff;
        const success = status === 0x00;

        if (success) {
          this.log("info", "DFU mode command acknowledged by device");
          return {
            success: true,
            message: "Device entered DFU mode successfully",
          };
        } else {
          this.log(
            "warn",
            `DFU mode command failed with status: 0x${status.toString(16).padStart(2, "0")}`,
          );
          return {
            success: false,
            message: `DFU mode failed with status: 0x${status.toString(16).padStart(2, "0")}`,
          };
        }
      } else {
        throw new Error("Invalid DFU mode response");
      }
    } catch (error) {
      // Connection loss during DFU entry is expected
      if (
        error instanceof Error &&
        (error.message.includes("disconnect") ||
          error.message.includes("connection"))
      ) {
        this.log("info", "Connection lost during DFU entry - this is expected");
        return {
          success: true,
          message: "Device entered DFU mode (connection lost as expected)",
        };
      }
      throw error;
    } finally {
      // Always try to disconnect gracefully, but don't throw if it fails
      if (shouldDisconnect) {
        try {
          await context.disconnect();
        } catch {
          // Ignore disconnect errors during DFU
          this.log("info", "Disconnect failed - device likely in DFU mode");
        }
      }
    }
  }
}
