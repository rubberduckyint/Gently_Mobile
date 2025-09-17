/**
 * Get Number of Events Command
 *
 * Retrieves the total number of events/alarms stored on the device.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode, ResponseStatus } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

export interface GetNumberOfEventsResponse {
  numberOfEvents: number;
  connectionUsed: boolean;
}

export class GetNumberOfEventsCommand extends BLECommand<GetNumberOfEventsResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "get-number-of-events",
    name: "Get Number of Events",
    description: "Get the total number of events/alarms on the device",
    category: "events",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 1500,
    tags: ["events", "alarms", "count"],
  };

  /**
   * Create the request payload for get number of events command
   */
  static createRequest(): Uint8Array {
    // 6 bytes of padding as per protocol
    return new Uint8Array(6);
  }

  /**
   * Parse the response payload for get number of events command
   */
  static parseResponse(
    payload: Uint8Array,
    status: ResponseStatus,
  ): { numberOfEvents: number } {
    if (status !== ResponseStatus.OK) {
      throw new Error(
        `Get number of events request failed with status: ${status}`,
      );
    }

    if (payload.length < 1) {
      throw new Error("Invalid get number of events response");
    }

    return {
      numberOfEvents: payload[0] ?? 0,
    };
  }

  /**
   * Log human-readable details about the response payload
   */
  static logPayloadDetails(payload: Uint8Array): void {
    if (payload.length >= 4) {
      const apiVersion = payload[0];
      const commandCode = payload[1];
      const responseStatus = payload[2];
      const eventCount = payload[3];
      const success = responseStatus === 0x00;

      console.log(
        `🔓 PROTOCOL:     📋 GET_NUMBER_OF_EVENTS result: ${success ? "✅ SUCCESS" : `❌ FAILED (status: 0x${responseStatus?.toString(16).padStart(2, "0")})`}`,
      );
      console.log(
        `🔓 PROTOCOL:     📋 Event Count: ${eventCount}, API: 0x${apiVersion?.toString(16).padStart(2, "0")}, Cmd: 0x${commandCode?.toString(16).padStart(2, "0")}`,
      );
    } else {
      console.log(
        `🔓 PROTOCOL:     ⚠️  GET_NUMBER_OF_EVENTS response too short: ${payload.length} bytes (expected at least 4)`,
      );
    }
  }

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<GetNumberOfEventsResponse> {
    this.log("info", "Getting number of events");

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      this.log("info", "Establishing connection for event count request...");
      connection = await context.connect();
      shouldDisconnect = true;
    } else {
      this.log("info", "Using existing connection");
    }

    try {
      const response = await sendSecureCommand(
        connection,
        CommandCode.GET_NUMBER_OF_EVENTS,
      );

      if (response.length < 2) {
        throw new Error("Invalid get number of events response");
      }

      const status = response[0] ?? 0xff;
      if (status !== 0x00) {
        throw new Error(
          `Get number of events failed with status: 0x${status.toString(16).padStart(2, "0")}`,
        );
      }

      const numberOfEvents = response[1] ?? 0;
      this.log("info", `Device has ${numberOfEvents} events`);

      return {
        numberOfEvents,
        connectionUsed: !shouldDisconnect,
      };
    } finally {
      if (shouldDisconnect) {
        await context.disconnect();
      }
    }
  }
}
