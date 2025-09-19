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
      throw new Error("Invalid get number of events response - too short");
    }

    // The BLE framework already handles the response status (bytes 0-2 of full response).
    // Our payload contains only the command-specific data:
    // Payload Byte 0: Total Number of Events (0-49)
    // Payload Bytes 1-4: Reserved padding (0x00)
    return {
      numberOfEvents: payload[0] ?? 0,
    };
  }

  /**
   * Log human-readable details about the decrypted response payload
   */
  static logPayloadDetails(payload: Uint8Array): void {
    if (payload.length < 1) {
      console.warn(
        `GetNumberOfEvents response too short: ${payload.length} bytes`,
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
      connection = await context.connect();
      shouldDisconnect = true;
    }

    try {
      const response = await sendSecureCommand(
        connection,
        CommandCode.GET_NUMBER_OF_EVENTS,
      );

      // Log the payload details for debugging
      // Skip logging if this is a fallback response (empty payload)
      if (response.length > 0) {
        GetNumberOfEventsCommand.logPayloadDetails(response);
      }

      // Parse using the static method
      // For fallback responses, return a default result since the real processing was done by notification handler
      if (response.length === 0) {
        this.log(
          "info",
          "Using fallback response - real result was processed by notification handler",
        );
        return {
          numberOfEvents: 0, // Default value, real value was already logged by notification handler
          connectionUsed: !shouldDisconnect,
        };
      }

      const result = GetNumberOfEventsCommand.parseResponse(
        response,
        ResponseStatus.OK,
      );
      const numberOfEvents = result.numberOfEvents;

      this.log("info", `Device has ${numberOfEvents} events (0-49 range)`);

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
