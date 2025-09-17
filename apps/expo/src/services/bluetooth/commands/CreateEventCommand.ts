/**
 * Create Event Command
 *
 * Creates a test event 5 minutes in the future on the device.
 * Useful for testing event creation and device alarm functionality.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

export interface CreateEventResponse {
  success: boolean;
  eventIndex: number;
  eventName: string;
  scheduledTime: Date;
  cronExpression: string;
  responseStatus: number;
  connectionUsed: boolean;
}

export interface EventConfig {
  index: number;
  name: string;
  cronExpression: string;
  vibrationPattern: number; // 0-63
  vibrationIntensity: number; // 0=LOW, 1=MEDIUM, 2=HIGH, 3=MAXIMUM
  ledPattern: number; // 0=OFF, 1=blink slow, 2=blink fast, 3=solid
  ledColor: number; // 0=OFF, 1=Blue, 2=Green, 3=Cyan, 4=Red, 5=Yellow, 6=Magenta, 7=White
  severityLevel: number; // 1=Critical, 2=Important, 3=Informational
  snoozePeriod: number; // minutes (0 if not snoozable)
  snoozeTimeout: number; // minutes (0 if not snoozable)
  retriggerDelay: number; // minutes
  retriggerTimeout: number; // minutes
}

export class CreateEventCommand extends BLECommand<CreateEventResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "create-event",
    name: "Create Test Event",
    description:
      "Create a test event 5 minutes in the future to test alarm functionality",
    category: "event-management",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 5000, // 5 seconds
    tags: ["event", "alarm", "test", "create"],
    parameters: [
      {
        name: "eventIndex",
        type: "number",
        required: false,
        description: "Event slot index (0-49, default: 0)",
        defaultValue: 0,
        validation: {
          min: 0,
          max: 49,
        },
      },
      {
        name: "eventName",
        type: "string",
        required: false,
        description: "Name for the test event (max 10 characters)",
        defaultValue: "Test Event",
      },
      {
        name: "minutesInFuture",
        type: "number",
        required: false,
        description: "Minutes in the future to schedule event (default: 5)",
        defaultValue: 5,
        validation: {
          min: 1,
          max: 60,
        },
      },
      {
        name: "severityLevel",
        type: "number",
        required: false,
        description:
          "Severity: 1=Critical, 2=Important, 3=Informational (default: 2)",
        defaultValue: 2,
        validation: {
          min: 1,
          max: 3,
        },
      },
      {
        name: "vibrationIntensity",
        type: "number",
        required: false,
        description:
          "Vibration: 0=LOW, 1=MEDIUM, 2=HIGH, 3=MAXIMUM (default: 1)",
        defaultValue: 1,
        validation: {
          min: 0,
          max: 3,
        },
      },
      {
        name: "ledColor",
        type: "number",
        required: false,
        description:
          "LED color: 0=OFF, 1=Blue, 2=Green, 3=Cyan, 4=Red, 5=Yellow, 6=Magenta, 7=White (default: 4=Red)",
        defaultValue: 4,
        validation: {
          min: 0,
          max: 7,
        },
      },
    ],
  };

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<CreateEventResponse> {
    console.log("🚨🚨🚨 CREATE EVENT COMMAND STARTING 🚨🚨🚨");
    this.log("info", "Starting Create Event command");

    // Log received parameters for debugging
    this.log("debug", "Received parameters", context.parameters);

    // HARDCODED VALUES FOR TESTING - ensuring valid data
    const eventIndex = 0;
    const eventName = "Test"; // Shorter name to reduce payload size
    const minutesInFuture = 2; // 2 minutes in future for quick testing
    const severityLevel = 2; // Important
    const vibrationIntensity = 2; // High
    const ledColor = 4; // Red

    this.log("info", "🚨 USING HARDCODED VALUES FOR TESTING", {
      eventIndex,
      eventName,
      minutesInFuture,
      severityLevel,
      vibrationIntensity,
      ledColor,
    });

    // Truncate event name to max 10 characters as per protocol
    const truncatedName = eventName.substring(0, 10);

    this.log("info", "Final parameters", {
      eventIndex,
      eventName: truncatedName,
      minutesInFuture,
      severityLevel,
      vibrationIntensity,
      ledColor,
    });

    this.log(
      "info",
      `Creating event: ${truncatedName} at index ${eventIndex}, ${minutesInFuture} minutes in future`,
    );

    // Calculate the target time (current time + specified minutes)
    const now = new Date();
    const scheduledTime = new Date(now.getTime() + minutesInFuture * 60 * 1000);

    // Create cron expression for the exact minute
    // Format: minute hour day month weekday
    // Use shorter format: "M H * * *" instead of full date
    const cronExpression = `${scheduledTime.getMinutes()} ${scheduledTime.getHours()} * * *`;

    this.log("info", `Scheduled time: ${scheduledTime.toLocaleString()}`);
    this.log("info", `Cron expression: ${cronExpression}`);

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      this.log("info", "Establishing connection for event creation...");
      connection = await context.connect();
      shouldDisconnect = true;
    } else {
      this.log("info", "Using existing connection");
    }

    try {
      // Create ADD_EVENT command payload according to protocol
      const eventConfig: EventConfig = {
        index: eventIndex,
        name: truncatedName,
        cronExpression,
        vibrationPattern: 1, // Default pattern
        vibrationIntensity,
        ledPattern: 2, // Blink fast for visibility
        ledColor,
        severityLevel,
        snoozePeriod: 5, // 5 min snooze for Important level
        snoozeTimeout: 30, // 30 min snooze timeout
        retriggerDelay: 0, // No retrigger delay
        retriggerTimeout: 0, // No retrigger timeout
      };

      const payload = this.createAddEventPayload(eventConfig);

      this.log("info", "Sending CREATE EVENT command to device...", {
        eventIndex,
        eventName: truncatedName,
        cronExpression,
        scheduledTime: scheduledTime.toISOString(),
        severityLevel,
        vibrationIntensity,
        ledColor,
        payloadSize: payload.length,
      });

      console.log("🚨🚨🚨 ABOUT TO SEND CREATE EVENT COMMAND 🚨🚨🚨");
      console.log(
        "📤 Payload bytes:",
        Array.from(payload)
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
      );

      // Send the command and wait for response
      let response: Uint8Array;
      try {
        response = await sendSecureCommand(
          connection,
          CommandCode.ADD_EVENT,
          payload,
        );

        console.log("🚨🚨🚨 CREATE EVENT RESPONSE RECEIVED 🚨🚨🚨");
        console.log(
          "📥 Response bytes:",
          Array.from(response)
            .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
            .join(" "),
        );
      } catch (error) {
        console.log("🚨🚨🚨 CREATE EVENT COMMAND ERROR 🚨🚨🚨");
        console.log("❌ Error:", error);
        throw error;
      }

      this.log("info", "Create Event response received", {
        response: Array.from(response)
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
      });

      // Check response status (first byte in response payload after API version and command)
      if (response.length >= 3) {
        const responseStatus = response[2] ?? 0xff;
        const success = responseStatus === 0x00;

        if (success) {
          this.log(
            "info",
            `Create Event command successful - event "${truncatedName}" scheduled for ${scheduledTime.toLocaleString()}`,
          );
        } else {
          this.log(
            "warn",
            `Create Event command failed with status: 0x${responseStatus.toString(16).padStart(2, "0")}`,
          );
        }

        return {
          success,
          eventIndex,
          eventName: truncatedName,
          scheduledTime,
          cronExpression,
          responseStatus,
          connectionUsed: !shouldDisconnect,
        };
      } else {
        throw new Error("Invalid response length for Create Event command");
      }
    } finally {
      if (shouldDisconnect) {
        await context.disconnect();
      }
    }
  }

  /**
   * Create ADD_EVENT payload according to BLE protocol specification
   * MINIMAL VERSION - for testing MTU limitations
   */
  private createAddEventPayload(event: EventConfig): Uint8Array {
    // MINIMAL PAYLOAD FOR TESTING - only essential bytes, no strings
    // Just the first 8 bytes to test if MTU is the issue

    const payload = new Uint8Array(8); // Minimum 8 bytes for TEA encryption
    let offset = 0;

    // Byte 0: Event Index
    payload[offset++] = event.index;

    // Byte 1: Vibration Pattern (bits 0-5) + Vibration Intensity (bits 6-7)
    const vibrationByte =
      (event.vibrationPattern & 0x3f) |
      ((event.vibrationIntensity & 0x03) << 6);
    payload[offset++] = vibrationByte;

    // Byte 2: LED Pattern (bits 0-4) + LED Color (bits 5-7)
    const ledByte = (event.ledPattern & 0x1f) | ((event.ledColor & 0x07) << 5);
    payload[offset++] = ledByte;

    // Byte 3: Severity Level
    payload[offset++] = event.severityLevel;

    // Byte 4: Snooze Period (minutes)
    payload[offset++] = event.snoozePeriod;

    // Byte 5: Snooze Timeout (minutes)
    payload[offset++] = event.snoozeTimeout;

    // Byte 6: Retrigger Delay (minutes)
    payload[offset++] = event.retriggerDelay;

    // Byte 7: Retrigger Timeout (minutes)
    payload[offset++] = event.retriggerTimeout;

    // NO EVENT NAME OR CRON EXPRESSION FOR MINIMAL TEST
    // This should result in just 8 bytes payload + 8 bytes header = 16 bytes total

    console.log("🔧 MINIMAL PAYLOAD CREATED FOR MTU TESTING");
    console.log("📦 Payload size:", payload.length, "bytes");
    console.log(
      "📦 Total request size:",
      payload.length + 8,
      "bytes (payload + header)",
    );

    this.log("debug", "MINIMAL ADD_EVENT payload created", {
      eventIndex: event.index,
      vibrationPattern: event.vibrationPattern,
      vibrationIntensity: event.vibrationIntensity,
      ledPattern: event.ledPattern,
      ledColor: event.ledColor,
      severityLevel: event.severityLevel,
      payloadSize: payload.length,
      vibrationByte: `0x${vibrationByte.toString(16).padStart(2, "0")}`,
      ledByte: `0x${ledByte.toString(16).padStart(2, "0")}`,
      payload: Array.from(payload)
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(" "),
    });

    return payload;
  }

  /**
   * Parse the response payload for add event command
   */
  static parseResponse(payload: Uint8Array): {
    success: boolean;
    eventIndex: number;
  } {
    if (payload.length < 4) {
      throw new Error("Invalid add event response - too short");
    }

    // Response format: API Version | Command Code | Response Status | Event Index | Reserved
    const responseStatus = payload[2] ?? 0xff;
    const eventIndex = payload[3] ?? 0;
    const success = responseStatus === 0x00;

    return { success, eventIndex };
  }

  /**
   * Log human-readable details about the response payload
   */
  static logPayloadDetails(payload: Uint8Array): void {
    if (payload.length >= 4) {
      const apiVersion = payload[0];
      const commandCode = payload[1];
      const responseStatus = payload[2];
      const eventIndex = payload[3];
      const success = responseStatus === 0x00;

      console.log(
        `🔓 PROTOCOL:     📝 ADD_EVENT result: ${success ? "✅ SUCCESS" : `❌ FAILED (status: 0x${responseStatus?.toString(16).padStart(2, "0")})`}`,
      );
      console.log(
        `🔓 PROTOCOL:     📝 Event Index: ${eventIndex}, API: 0x${apiVersion?.toString(16).padStart(2, "0")}, Cmd: 0x${commandCode?.toString(16).padStart(2, "0")}`,
      );
    } else {
      console.log(
        `🔓 PROTOCOL:     ⚠️  ADD_EVENT response too short: ${payload.length} bytes (expected at least 4)`,
      );
    }
  }
}
