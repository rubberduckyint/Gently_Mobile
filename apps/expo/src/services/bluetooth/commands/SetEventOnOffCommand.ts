/**
 * Set Event ON/OFF Command
 *
 * Sets an existing event to ON or OFF state.
 * Used to enable or disable events without modifying their properties.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode, ResponseStatus } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

export interface SetEventOnOffResponse {
  success: boolean;
  eventIndex: number;
  eventState: boolean; // true = ON, false = OFF
  responseStatus: number;
  connectionUsed: boolean;
}

export interface SetEventOnOffRequest {
  eventIndex: number; // 0-49
  state: boolean; // true = ON (0x01), false = OFF (0x00)
}

export class SetEventOnOffCommand extends BLECommand<SetEventOnOffResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "set-event-on-off",
    name: "Set Event ON/OFF",
    description: "Enable or disable an existing event",
    category: "event-management",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 2000, // 2 seconds
    tags: ["event", "enable", "disable", "state"],
    parameters: [
      {
        name: "eventIndex",
        type: "number",
        required: true,
        description: "Event slot index (0-49)",
        defaultValue: 0,
        validation: {
          min: 0,
          max: 49,
        },
      },
      {
        name: "state",
        type: "boolean",
        required: true,
        description: "Event state: true = ON, false = OFF",
        defaultValue: true,
      },
    ],
  };

  /**
   * Create the request payload for set event on/off command
   * According to protocol:
   * Byte#0: API Version
   * Byte#1: Command: 0x05 (Set Event)
   * Byte#2: Event Index Uint8 (0-49)
   * Byte#3: State OFF (0x00) ON (0x01)
   * Byte#4-7: RESERVED (0 Padded)
   */
  static createRequest(request: SetEventOnOffRequest): Uint8Array {
    const { eventIndex, state } = request;

    // Validate parameters
    if (eventIndex < 0 || eventIndex > 49) {
      throw new Error(`Invalid event index: ${eventIndex}. Must be 0-49.`);
    }

    // Create 8-byte aligned payload (6 bytes payload + 2 bytes for API version and command)
    const payload = new Uint8Array(6);

    payload[0] = eventIndex; // Event Index (0-49)
    payload[1] = state ? 0x01 : 0x00; // State: ON (0x01) or OFF (0x00)
    // Bytes 2-5: RESERVED (already 0x00 from new Uint8Array)

    return payload;
  }

  /**
   * Parse the response payload for set event on/off command
   * According to protocol:
   * Byte#0: API Version
   * Byte#1: Command: 0x05 (Set Event)
   * Byte#2: Response Status OK (0x00) ERROR (0x01)
   * Byte#3: Event Index (0-49)
   * Byte#4-7: RESERVED (0 Padded)
   */
  static parseResponse(
    payload: Uint8Array,
    status: ResponseStatus,
    originalRequest: SetEventOnOffRequest,
  ): SetEventOnOffResponse {
    if (payload.length < 2) {
      throw new Error(
        `Invalid set event on/off response - expected at least 2 bytes, got ${payload.length}`,
      );
    }

    // Extract response status and event index from payload
    const responseStatus = payload[0] ?? 0xff;
    const eventIndex = payload[1] ?? 0xff;

    const success = responseStatus === 0x00;

    if (!success) {
      throw new Error(
        `Set event on/off failed with status: 0x${responseStatus.toString(16).padStart(2, "0")}`,
      );
    }

    // Verify the event index matches what we requested
    if (eventIndex !== originalRequest.eventIndex) {
      throw new Error(
        `Event index mismatch: requested ${originalRequest.eventIndex}, received ${eventIndex}`,
      );
    }

    return {
      success,
      eventIndex,
      eventState: originalRequest.state,
      responseStatus,
      connectionUsed: false, // Will be updated by executeImpl
    };
  }

  /**
   * Log human-readable details about the response payload
   */
  static logPayloadDetails(payload: Uint8Array): void {
    if (payload.length >= 2) {
      const responseStatus = payload[0] ?? 0xff;
      const success = responseStatus === 0x00;

      if (!success) {
        console.warn(
          `SetEventOnOff failed with status: 0x${responseStatus.toString(16).padStart(2, "0")}`,
        );
      }
    } else {
      console.warn(`SetEventOnOff response too short: ${payload.length} bytes`);
    }
  }

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<SetEventOnOffResponse> {
    // Extract parameters from context
    const eventIndex =
      (context.parameters?.eventIndex as number | undefined) ?? 0;
    const state = (context.parameters?.state as boolean | undefined) ?? true;

    this.log("info", `Setting event ${eventIndex} to ${state ? "ON" : "OFF"}`);

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      connection = await context.connect();
      shouldDisconnect = true;
    }

    try {
      const request: SetEventOnOffRequest = { eventIndex, state };
      const payload = SetEventOnOffCommand.createRequest(request);

      const response = await sendSecureCommand(
        connection,
        CommandCode.SET_EVENT_ON_OFF,
        payload,
      );

      // Log the payload details for debugging
      // Skip logging if this is a fallback response (empty payload)
      if (response.length > 0) {
        SetEventOnOffCommand.logPayloadDetails(response);
      } else {
        this.log(
          "debug",
          "Skipping payload logging for fallback response (already processed by notification handler)",
        );
      }

      // For fallback responses, return a default result since the real processing was done by notification handler
      if (response.length === 0) {
        this.log(
          "info",
          "Using fallback response - real result was processed by notification handler",
        );
        return {
          success: true, // Assume success, real result was already logged by notification handler
          eventIndex,
          eventState: state,
          responseStatus: ResponseStatus.OK,
          connectionUsed: !shouldDisconnect,
        };
      }

      const result = SetEventOnOffCommand.parseResponse(
        response,
        ResponseStatus.OK,
        request,
      );

      this.log(
        "info",
        `Event ${eventIndex} successfully set to ${state ? "ON" : "OFF"}`,
      );

      return {
        ...result,
        connectionUsed: !shouldDisconnect,
      };
    } finally {
      if (shouldDisconnect) {
        await context.disconnect();
      }
    }
  }
}
