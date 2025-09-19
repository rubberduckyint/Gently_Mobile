/**
 * Get Uptime Command
 *
 * Retrieves the device's uptime information showing how long
 * the device has been running since last reboot.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode, ResponseStatus } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

export interface UptimeResponse {
  uptimeMs: number;
  uptimeFormatted: string;
  connectionUsed: boolean;
}

export class GetUptimeCommand extends BLECommand<UptimeResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "get-uptime",
    name: "Get Device Uptime",
    description: "Retrieve device uptime since last reboot",
    category: "device-status",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 1500,
    tags: ["uptime", "status", "system"],
  };

  /**
   * Create the request payload for uptime command
   */
  static createRequest(): Uint8Array {
    // 6 bytes of padding as per protocol
    return new Uint8Array(6);
  }

  /**
   * Parse the response payload for uptime command
   */
  static parseResponse(
    payload: Uint8Array,
    status: ResponseStatus,
  ): { uptimeMs: bigint; uptimeSeconds: number; formattedUptime: string } {
    if (status !== ResponseStatus.OK) {
      throw new Error(`Uptime request failed with status: ${status}`);
    }

    if (payload.length < 8) {
      throw new Error(
        `Invalid uptime response: payload too short (${payload.length} bytes, expected at least 8)`,
      );
    }

    // Extract 8-byte uptime (little-endian Uint64)
    const uptimeMs = new DataView(
      payload.buffer,
      payload.byteOffset,
    ).getBigUint64(0, true);
    const uptimeSeconds = Number(uptimeMs / 1000n);

    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    const formattedUptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    return {
      uptimeMs,
      uptimeSeconds,
      formattedUptime,
    };
  }

  /**
   * Log human-readable details about the response payload
   */
  static logPayloadDetails(payload: Uint8Array): void {
    if (payload.length >= 8) {
      const _uptimeMs = new DataView(
        payload.buffer,
        payload.byteOffset,
      ).getBigUint64(0, true);
      // Uptime logging removed for conciseness
    }
  }

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<UptimeResponse> {
    this.log("info", "Getting device uptime");

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      connection = await context.connect();
      shouldDisconnect = true;
    }

    try {
      const response = await sendSecureCommand(
        connection,
        CommandCode.GET_UPTIME,
      );

      if (response.length < 4) {
        throw new Error("Invalid uptime response length");
      }

      // Parse uptime (4 bytes, little endian)
      const uptimeMs = new DataView(response.buffer).getUint32(0, true);
      const uptimeFormatted = this.formatUptime(uptimeMs);

      this.log("info", `Device uptime: ${uptimeFormatted} (${uptimeMs}ms)`);

      return {
        uptimeMs,
        uptimeFormatted,
        connectionUsed: !shouldDisconnect,
      };
    } finally {
      if (shouldDisconnect) {
        await context.disconnect();
      }
    }
  }

  private formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
