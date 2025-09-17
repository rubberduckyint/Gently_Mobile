/**
 * Get Time Command
 *
 * Retrieves the current time from the device.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode, ResponseStatus } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

// Helper function to convert BCD to decimal
function fromBCD(bcd: number): number {
  return ((bcd >> 4) & 0x0f) * 10 + (bcd & 0x0f);
}

// Helper function to convert decimal to BCD
function toBCD(decimal: number): number {
  return ((Math.floor(decimal / 10) & 0x0f) << 4) | (decimal % 10 & 0x0f);
}

export interface GetTimeResponse {
  deviceTime: Date;
  systemTime: Date;
  timeDifference: number; // milliseconds
  connectionUsed: boolean;
}

export interface DeviceTime {
  hour: number;
  minute: number;
  seconds: number;
  year: number;
  month: number;
  date: number;
  weekDay: number;
}

export class GetTimeCommand extends BLECommand<GetTimeResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "get-time",
    name: "Get Device Time",
    description: "Retrieve current time from the device",
    category: "device-status",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 1500,
    tags: ["time", "clock", "sync"],
  };

  /**
   * Create the request payload for get time command
   */
  static createRequest(): Uint8Array {
    // 6 bytes of padding as per protocol
    return new Uint8Array(6);
  }

  /**
   * Parse the response payload for get time command
   */
  static parseResponse(
    payload: Uint8Array,
    status: ResponseStatus,
  ): DeviceTime {
    if (status !== ResponseStatus.OK) {
      throw new Error(`Get time request failed with status: ${status}`);
    }

    if (payload.length < 7) {
      throw new Error(
        "Invalid get time response - expected at least 7 bytes for BCD format",
      );
    }

    // Parse according to protocol specification:
    // Byte#0: Year (BCD, 0x00-0x99 for 2000-2099)
    // Byte#1: Month (BCD, 0x01-0x12)
    // Byte#2: Date (BCD, 0x01-0x31)
    // Byte#3: Week day (0-6, Sunday=0)
    // Byte#4: Hour (BCD, 0x00-0x23)
    // Byte#5: Minute (BCD, 0x00-0x59)
    // Byte#6: Seconds (BCD, 0x00-0x59)

    return {
      year: fromBCD(payload[0] ?? 0) + 2000,
      month: fromBCD(payload[1] ?? 0),
      date: fromBCD(payload[2] ?? 0),
      weekDay: payload[3] ?? 0,
      hour: fromBCD(payload[4] ?? 0),
      minute: fromBCD(payload[5] ?? 0),
      seconds: fromBCD(payload[6] ?? 0),
    };
  }

  /**
   * Log human-readable details about the response payload
   */
  static logPayloadDetails(payload: Uint8Array): void {
    if (payload.length >= 7) {
      // Parse according to BCD protocol specification
      const year = fromBCD(payload[0] ?? 0) + 2000;
      const month = fromBCD(payload[1] ?? 0);
      const date = fromBCD(payload[2] ?? 0);
      const weekDay = payload[3] ?? 0;
      const hour = fromBCD(payload[4] ?? 0);
      const minute = fromBCD(payload[5] ?? 0);
      const seconds = fromBCD(payload[6] ?? 0);

      const weekDayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const weekDayName = weekDayNames[weekDay] ?? `Unknown(${weekDay})`;

      console.log(
        `🔓 PROTOCOL:     🕐 Time: ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
      );
      console.log(
        `🔓 PROTOCOL:     📅 Date: ${year}-${month.toString().padStart(2, "0")}-${date.toString().padStart(2, "0")} (${weekDayName})`,
      );
      console.log(
        `🔓 PROTOCOL:     � BCD Format: Year=${payload[0]?.toString(16).padStart(2, "0")}, Month=${payload[1]?.toString(16).padStart(2, "0")}, Date=${payload[2]?.toString(16).padStart(2, "0")}, Hour=${payload[4]?.toString(16).padStart(2, "0")}, Min=${payload[5]?.toString(16).padStart(2, "0")}, Sec=${payload[6]?.toString(16).padStart(2, "0")}`,
      );
    } else {
      console.log(
        `🔓 PROTOCOL:     ⚠️  Get time payload too short: ${payload.length} bytes (expected 7 bytes for BCD format)`,
      );
    }
  }

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<GetTimeResponse> {
    this.log("info", "Getting device time");

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      this.log("info", "Establishing connection for time request...");
      connection = await context.connect();
      shouldDisconnect = true;
    } else {
      this.log("info", "Using existing connection");
    }

    try {
      const systemTime = new Date();
      const timePayload = await sendSecureCommand(
        connection,
        CommandCode.GET_TIME,
      );
      const deviceTime = this.parseTimeResponse(timePayload);
      const timeDifference = deviceTime.getTime() - systemTime.getTime();

      this.log("info", `Device time: ${deviceTime.toISOString()}`);
      this.log("info", `System time: ${systemTime.toISOString()}`);
      this.log("info", `Time difference: ${timeDifference}ms`);

      return {
        deviceTime,
        systemTime,
        timeDifference,
        connectionUsed: !shouldDisconnect,
      };
    } finally {
      if (shouldDisconnect) {
        await context.disconnect();
      }
    }
  }

  /**
   * Parse time from device time response
   */
  private parseTimeResponse(timePayload: Uint8Array): Date {
    if (timePayload.length < 8) {
      this.log(
        "warn",
        `Time response too short: ${timePayload.length} bytes, expected at least 8 bytes (1 status + 7 BCD time)`,
      );
      return new Date();
    }

    const status = timePayload[0];
    if (status !== 0x00) {
      this.log(
        "warn",
        `Time request failed with status: 0x${status?.toString(16).padStart(2, "0")}`,
      );
      return new Date();
    }

    // Parse time format starting from byte 1
    // Based on actual device behavior, values appear to be decimal rather than true BCD
    // Byte#1: Year (decimal, 0-99 for 2000-2099)
    // Byte#2: Month (decimal, 1-12)
    // Byte#3: Date (decimal, 1-31)
    // Byte#4: Week day (0-6, Sunday=0)
    // Byte#5: Hour (decimal, 0-23)
    // Byte#6: Minute (decimal, 0-59)
    // Byte#7: Seconds (decimal, 0-59)

    const year = (timePayload[1] ?? 0) + 2000;
    const month = timePayload[2] ?? 0;
    const date = timePayload[3] ?? 0;
    // Skip weekday (timePayload[4])
    const hour = timePayload[5] ?? 0;
    const minute = timePayload[6] ?? 0;
    const seconds = timePayload[7] ?? 0; // Create JavaScript Date object (month is 0-indexed in JS)
    const deviceTime = new Date(year, month - 1, date, hour, minute, seconds);

    this.log("debug", "Parsed time", {
      raw: Array.from(timePayload.slice(1, 8))
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(" "),
      decimal: Array.from(timePayload.slice(1, 8)).join(" "),
      parsed: `${year}-${month.toString().padStart(2, "0")}-${date.toString().padStart(2, "0")} ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
      jsDate: deviceTime.toISOString(),
    });

    return deviceTime;
  }
}
