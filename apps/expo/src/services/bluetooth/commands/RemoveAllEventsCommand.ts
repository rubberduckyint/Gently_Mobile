/**
 * Remove All Events Command
 *
 * Removes all events/alarms from the device.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

export interface RemoveAllEventsResponse {
  success: boolean;
  message: string;
  connectionUsed: boolean;
}

export class RemoveAllEventsCommand extends BLECommand<RemoveAllEventsResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "remove-all-events",
    name: "Remove All Events",
    description: "Remove all events/alarms from the device",
    category: "events",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 3000,
    tags: ["events", "alarms", "remove", "clear"],
  };

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<RemoveAllEventsResponse> {
    this.log("info", "Removing all events from device");

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      this.log("info", "Establishing connection for remove all events...");
      connection = await context.connect();
      shouldDisconnect = true;
    } else {
      this.log("info", "Using existing connection");
    }

    try {
      const response = await sendSecureCommand(
        connection,
        CommandCode.REMOVE_ALL_EVENTS,
      );

      if (response.length < 1) {
        throw new Error("Invalid remove all events response");
      }

      const status = response[0] ?? 0xff;
      const success = status === 0x00;

      if (success) {
        this.log("info", "All events removed successfully");
        return {
          success: true,
          message: "All events removed successfully",
          connectionUsed: !shouldDisconnect,
        };
      } else {
        this.log(
          "warn",
          `Remove all events failed with status: 0x${status.toString(16).padStart(2, "0")}`,
        );
        return {
          success: false,
          message: `Remove all events failed with status: 0x${status.toString(16).padStart(2, "0")}`,
          connectionUsed: !shouldDisconnect,
        };
      }
    } finally {
      if (shouldDisconnect) {
        await context.disconnect();
      }
    }
  }
}
