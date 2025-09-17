/**
 * Find Me Command
 *
 * Triggers the device's "Find Me" functionality, causing it to play
 * an audio pattern to help locate the device.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

export interface FindMeResponse {
  success: boolean;
  audioPattern: number;
  responseStatus: number;
  connectionUsed: boolean;
}

export class FindMeCommand extends BLECommand<FindMeResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "find-me",
    name: "Find Me",
    description: "Trigger 15-second audio pattern on device to help locate it",
    category: "device-control",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 3000, // 3 seconds (not including the 15s audio)
    tags: ["find", "audio", "locate", "control"],
    parameters: [
      {
        name: "audioPattern",
        type: "number",
        required: false,
        description: "Audio pattern ID (default: 1)",
        defaultValue: 1,
        validation: {
          min: 1,
          max: 255,
        },
      },
    ],
  };

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<FindMeResponse> {
    this.log("info", "Starting Find Me command");

    const audioPattern =
      (context.parameters?.audioPattern as number | undefined) ?? 1;
    this.log("info", `Using audio pattern: ${audioPattern}`);

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
      // Create Find Me command payload
      const payload = new Uint8Array(6);
      payload[0] = audioPattern; // Audio pattern byte
      // Remaining bytes (1-5) are reserved (0 padded)

      this.log("info", "Sending Find Me command to device...", {
        audioPattern,
        payload: Array.from(payload)
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
      });

      // Send the command and wait for response
      const response = await sendSecureCommand(
        connection,
        CommandCode.FIND_ME,
        payload,
      );

      this.log("info", "Find Me response received", {
        response: Array.from(response)
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
      });

      // Check response status (first byte in response payload)
      if (response.length >= 1) {
        const responseStatus = response[0] ?? 0xff;
        const success = responseStatus === 0x00;

        if (success) {
          this.log(
            "info",
            "Find Me command successful - device should play audio for 15 seconds",
          );
        } else {
          this.log(
            "warn",
            `Find Me command failed with status: 0x${responseStatus.toString(16).padStart(2, "0")}`,
          );
        }

        return {
          success,
          audioPattern,
          responseStatus,
          connectionUsed: !shouldDisconnect,
        };
      } else {
        throw new Error("Invalid response length for Find Me command");
      }
    } finally {
      if (shouldDisconnect) {
        this.log("info", "Disconnecting from device...");
        await context.disconnect();
      }
    }
  }
}
