/**
 * Set Time Command
 *
 * Sets the device's current time.
 */

import type { ResponseStatus } from "../protocol-types";
import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

// Helper function to convert decimal to BCD
function toBCD(decimal: number): number {
  return ((Math.floor(decimal / 10) & 0x0f) << 4) | (decimal % 10 & 0x0f);
}

export interface SetTimeResponse {
  success: boolean;
  timeSet: Date;
  connectionUsed: boolean;
}

export class SetTimeCommand extends BLECommand<SetTimeResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "set-time",
    name: "Set Device Time",
    description: "Set the device's current time",
    category: "device-control",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 2000,
    tags: ["time", "clock", "sync", "control"],
    parameters: [
      {
        name: "time",
        type: "number",
        required: false,
        description: "Unix timestamp to set (default: current time)",
        validation: {
          min: 0,
        },
      },
    ],
  };

  /**
   * Create the request payload for set time command
   */
  static createRequest(timestamp?: number): Uint8Array {
    // Create time payload in BCD format as per protocol specification
    // 7 bytes: Year(BCD), Month(BCD), Date(BCD), WeekDay, Hour(BCD), Minute(BCD), Seconds(BCD)
    const payload = new Uint8Array(7);

    const now = timestamp ? new Date(timestamp * 1000) : new Date();

    // Protocol format:
    // Byte#0: Year (BCD, 0x00-0x99 for 2000-2099)
    // Byte#1: Month (BCD, 0x01-0x12)
    // Byte#2: Date (BCD, 0x01-0x31)
    // Byte#3: Week day (0-6, Sunday=0)
    // Byte#4: Hour (BCD, 0x00-0x23)
    // Byte#5: Minute (BCD, 0x00-0x59)
    // Byte#6: Seconds (BCD, 0x00-0x59)

    payload[0] = toBCD(now.getFullYear() - 2000); // Year relative to 2000
    payload[1] = toBCD(now.getMonth() + 1); // Month (1-12)
    payload[2] = toBCD(now.getDate()); // Date (1-31)
    payload[3] = now.getDay(); // Week day (0-6, Sunday=0)
    payload[4] = toBCD(now.getHours()); // Hour (0-23)
    payload[5] = toBCD(now.getMinutes()); // Minute (0-59)
    payload[6] = toBCD(now.getSeconds()); // Seconds (0-59)

    // Log what we're setting for debugging
    SetTimeCommand.logTimeBeingSet(now);

    return payload;
  }

  /**
   * Parse the response payload for set time command
   */
  static parseResponse(payload: Uint8Array, _status: ResponseStatus): boolean {
    if (payload.length < 1) {
      throw new Error("Invalid set time response");
    }
    const responseStatus = payload[0] ?? 0xff;
    return responseStatus === 0x00;
  }

  /**
   * Log human-readable details about the response payload
   */
  static logPayloadDetails(payload: Uint8Array): void {
    if (payload.length >= 1) {
      const status = payload[0];
      const success = status === 0x00;
      console.log(
        `🔓 PROTOCOL:     📝 Time set result: ${success ? "✅ SUCCESS" : `❌ FAILED (status: 0x${status?.toString(16).padStart(2, "0")})`}`,
      );
    }
  }

  /**
   * Log the time being set for debugging (simplified)
   */
  static logTimeBeingSet(_date: Date): void {
    // Time setting logged for debugging
  }

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<SetTimeResponse> {
    this.log("info", "Setting device time");

    // Use provided time or current system time
    const timeToSet = context.parameters?.time as number | undefined;
    const targetTime = timeToSet ? new Date(timeToSet * 1000) : new Date();

    this.log("info", `Setting device time to: ${targetTime.toISOString()}`);

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      this.log("info", "Establishing connection for time setting...");
      connection = await context.connect();
      shouldDisconnect = true;
    } else {
      this.log("info", "Using existing connection");
    }

    try {
      // Create time payload in BCD format as per protocol
      const payload = new Uint8Array(7);

      // Protocol format:
      // Byte#0: Year (BCD, 0x00-0x99 for 2000-2099)
      // Byte#1: Month (BCD, 0x01-0x12)
      // Byte#2: Date (BCD, 0x01-0x31)
      // Byte#3: Week day (0-6, Sunday=0)
      // Byte#4: Hour (BCD, 0x00-0x23)
      // Byte#5: Minute (BCD, 0x00-0x59)
      // Byte#6: Seconds (BCD, 0x00-0x59)

      payload[0] = toBCD(targetTime.getFullYear() - 2000); // Year relative to 2000
      payload[1] = toBCD(targetTime.getMonth() + 1); // Month (1-12)
      payload[2] = toBCD(targetTime.getDate()); // Date (1-31)
      payload[3] = targetTime.getDay(); // Week day (0-6, Sunday=0)
      payload[4] = toBCD(targetTime.getHours()); // Hour (0-23)
      payload[5] = toBCD(targetTime.getMinutes()); // Minute (0-59)
      payload[6] = toBCD(targetTime.getSeconds()); // Seconds (0-59)

      this.log("info", "Sending time to device...", {
        time: targetTime.toISOString(),
        payload: Array.from(payload)
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
      });

      const response = await sendSecureCommand(
        connection,
        CommandCode.SET_TIME,
        payload,
      );

      if (response.length < 1) {
        throw new Error("Invalid set time response");
      }

      const status = response[0] ?? 0xff;
      const success = status === 0x00;

      if (success) {
        this.log("info", "Device time set successfully");
      } else {
        this.log(
          "warn",
          `Set time failed with status: 0x${status.toString(16).padStart(2, "0")}`,
        );
      }

      return {
        success,
        timeSet: targetTime,
        connectionUsed: !shouldDisconnect,
      };
    } finally {
      if (shouldDisconnect) {
        await context.disconnect();
      }
    }
  }
}
