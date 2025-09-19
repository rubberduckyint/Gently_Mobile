/**
 * Create Event Command
 *
 * Creates an event/alarm on the device with customizable settings including:
 * - Scheduling (either minutesInFuture or custom cron expression)
 * - Vibration patterns and intensity
 * - LED patterns and colors
 * - Severity levels affecting snooze behavior
 * - Snooze settings
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";
import { SetEventOnOffCommand } from "./SetEventOnOffCommand";

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
    name: "Create Event",
    description: "Create an event/alarm on the device with specified settings",
    category: "event-management",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 5000, // 5 seconds
    tags: ["event", "alarm", "create"],
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
      {
        name: "vibrationPattern",
        type: "number",
        required: false,
        description: "Vibration pattern (0-63, default: 1)",
        defaultValue: 1,
        validation: {
          min: 0,
          max: 63,
        },
      },
      {
        name: "ledPattern",
        type: "number",
        required: false,
        description:
          "LED pattern: 0=OFF, 1=blink slow, 2=blink fast, 3=solid (default: 2)",
        defaultValue: 2,
        validation: {
          min: 0,
          max: 3,
        },
      },
      {
        name: "snoozePeriod",
        type: "number",
        required: false,
        description:
          "Snooze period in minutes (0 if not snoozable, default: 5)",
        defaultValue: 5,
        validation: {
          min: 0,
          max: 255,
        },
      },
      {
        name: "snoozeTimeout",
        type: "number",
        required: false,
        description:
          "Snooze timeout in minutes (0 if not snoozable, default: 30)",
        defaultValue: 30,
        validation: {
          min: 0,
          max: 255,
        },
      },
      {
        name: "cronExpression",
        type: "string",
        required: false,
        description: "Custom cron expression (if not using minutesInFuture)",
        defaultValue: "",
      },
    ],
  };

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<CreateEventResponse> {
    this.log("info", "Creating event");

    // Extract parameters from context with defaults
    const params = context.parameters ?? {};
    const eventIndex =
      typeof params.eventIndex === "number" ? params.eventIndex : 0;
    const eventName =
      typeof params.eventName === "string" ? params.eventName : "Test Event";
    const minutesInFuture =
      typeof params.minutesInFuture === "number" ? params.minutesInFuture : 5;
    const severityLevel =
      typeof params.severityLevel === "number" ? params.severityLevel : 2;
    const vibrationIntensity =
      typeof params.vibrationIntensity === "number"
        ? params.vibrationIntensity
        : 1;
    const ledColor = typeof params.ledColor === "number" ? params.ledColor : 4;
    const vibrationPattern =
      typeof params.vibrationPattern === "number" ? params.vibrationPattern : 1;
    const ledPattern =
      typeof params.ledPattern === "number" ? params.ledPattern : 2;
    const snoozePeriod =
      typeof params.snoozePeriod === "number" ? params.snoozePeriod : 5;
    const snoozeTimeout =
      typeof params.snoozeTimeout === "number" ? params.snoozeTimeout : 30;
    const customCronExpression =
      typeof params.cronExpression === "string" ? params.cronExpression : "";

    // Validate parameters
    if (eventIndex < 0 || eventIndex > 49) {
      throw new Error(
        `Event index must be between 0 and 49, got: ${eventIndex}`,
      );
    }
    if (minutesInFuture < 1 || minutesInFuture > 60) {
      throw new Error(
        `Minutes in future must be between 1 and 60, got: ${minutesInFuture}`,
      );
    }
    if (severityLevel < 1 || severityLevel > 3) {
      throw new Error(
        `Severity level must be between 1 and 3, got: ${severityLevel}`,
      );
    }
    if (vibrationIntensity < 0 || vibrationIntensity > 3) {
      throw new Error(
        `Vibration intensity must be between 0 and 3, got: ${vibrationIntensity}`,
      );
    }
    if (ledColor < 0 || ledColor > 7) {
      throw new Error(`LED color must be between 0 and 7, got: ${ledColor}`);
    }
    if (vibrationPattern < 0 || vibrationPattern > 63) {
      throw new Error(
        `Vibration pattern must be between 0 and 63, got: ${vibrationPattern}`,
      );
    }
    if (ledPattern < 0 || ledPattern > 3) {
      throw new Error(
        `LED pattern must be between 0 and 3, got: ${ledPattern}`,
      );
    }
    if (customCronExpression && customCronExpression.length > 42) {
      throw new Error(
        `Cron expression too long: ${customCronExpression.length} chars (max 42)`,
      );
    }
    if (eventName.length > 10) {
      this.log(
        "warn",
        `Event name will be truncated from "${eventName}" to "${eventName.substring(0, 10)}"`,
      );
    }

    // Truncate event name to max 10 characters as per protocol
    const truncatedName = eventName.substring(0, 10);

    // Determine scheduling approach
    let scheduledTime: Date;
    let cronExpression: string;

    if (customCronExpression) {
      // Use provided cron expression
      cronExpression = customCronExpression;
      // For display purposes, estimate next execution time (simplified)
      scheduledTime = new Date(Date.now() + minutesInFuture * 60 * 1000);
    } else {
      // Calculate the target time (current time + specified minutes)
      const now = new Date();
      scheduledTime = new Date(now.getTime() + minutesInFuture * 60 * 1000);

      // Create cron expression for the exact minute
      // Format: minute hour day month weekday
      // Use shorter format: "M H * * *" instead of full date
      cronExpression = `${scheduledTime.getMinutes()} ${scheduledTime.getHours()} * * *`;
    }

    this.log(
      "info",
      `Creating event "${truncatedName}" at index ${eventIndex}${customCronExpression ? " with custom schedule" : `, scheduled for ${scheduledTime.toLocaleString()}`}`,
    );

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      connection = await context.connect();
      shouldDisconnect = true;
    }

    // Check and negotiate MTU if needed
    let finalMTU = connection.device.mtu;
    try {
      const currentMTU = connection.device.mtu;

      // Try to request a higher MTU if the current one is low
      if (currentMTU < 100) {
        try {
          const updatedDevice = await connection.device.requestMTU(512);
          const newMTU = updatedDevice.mtu;
          finalMTU = newMTU;

          // Update the connection object with the new device reference
          connection = {
            ...connection,
            device: updatedDevice,
          };

          // Small delay to let BLE stack process MTU change
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch {
          // MTU negotiation failed, continue with current MTU
        }
      }
    } catch {
      // Failed to read MTU, continue with default
    }

    try {
      // Create ADD_EVENT command payload according to protocol
      const eventConfig: EventConfig = {
        index: eventIndex,
        name: truncatedName,
        cronExpression,
        vibrationPattern,
        vibrationIntensity,
        ledPattern,
        ledColor,
        severityLevel,
        snoozePeriod,
        snoozeTimeout,
        retriggerDelay: 0, // No retrigger delay by default
        retriggerTimeout: 0, // No retrigger timeout by default
      };

      // Try to create the complete payload first
      let payload: Uint8Array;

      try {
        payload = this.createAddEventPayload(eventConfig);

        // Check if payload might be too large for current MTU
        const totalRequestSize = payload.length + 8; // payload + encryption header
        const availableMTU = finalMTU - 3; // Reserve 3 bytes for BLE headers

        if (finalMTU && totalRequestSize > availableMTU) {
          payload = this.createMinimalAddEventPayload(eventConfig);
        }
      } catch {
        payload = this.createMinimalAddEventPayload(eventConfig);
      }

      // Send the command and wait for response
      let response: Uint8Array;
      try {
        // Verify device is still connected before sending command
        const isStillConnected = await connection.device.isConnected();
        if (!isStillConnected) {
          throw new Error("Device disconnected before sending command");
        }

        response = await sendSecureCommand(
          connection,
          CommandCode.ADD_EVENT,
          payload,
        );
      } catch (error) {
        this.log("error", "Failed to send create event command", error);
        throw error;
      }

      // Handle empty response (fallback mode when response delivered via notification)
      if (response.length === 0) {
        this.log("warn", "Empty response - using notification fallback mode");

        return {
          success: true, // Assume success in fallback mode
          eventIndex,
          eventName: truncatedName,
          scheduledTime,
          cronExpression,
          responseStatus: 0x00, // Assume success status
          connectionUsed: !shouldDisconnect,
        };
      }

      // Check response status (first byte in response payload)
      if (response.length >= 2) {
        const responseStatus = response[0] ?? 0xff; // Response status is first byte of payload
        const responseEventIndex = response[1] ?? 0xff; // Event index is second byte of payload
        const success = responseStatus === 0x00;

        if (success) {
          this.log(
            "info",
            `Event "${truncatedName}" created successfully at index ${responseEventIndex}`,
          );

          // Automatically enable the event
          try {
            const setEventOnOffCommand = new SetEventOnOffCommand();
            const enableContext: BLECommandExecutionContext = {
              ...context,
              connection, // Use the existing connection
              parameters: {
                eventIndex,
                state: true, // Turn ON
              },
            };

            const enableResult =
              await setEventOnOffCommand.execute(enableContext);

            if (enableResult.data?.success) {
              this.log("info", `Event ${eventIndex} enabled successfully`);
            } else {
              this.log("warn", `Failed to enable event ${eventIndex}`);
            }
          } catch (enableError) {
            this.log("warn", `Error enabling event ${eventIndex}`, enableError);
          }
        } else {
          this.log(
            "error",
            `Create Event failed with status: 0x${responseStatus.toString(16).padStart(2, "0")}`,
          );
        }

        return {
          success,
          eventIndex: responseEventIndex,
          eventName: truncatedName,
          scheduledTime,
          cronExpression,
          responseStatus,
          connectionUsed: !shouldDisconnect,
        };
      } else {
        // Response has unexpected length (not 0 and not >= 2)
        const errorMsg = `Invalid response length for Create Event command: ${response.length} bytes (expected 0 or >= 2)`;
        this.log("error", errorMsg, {
          response: Array.from(response)
            .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
            .join(" "),
        });
        console.log(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } finally {
      if (shouldDisconnect) {
        await context.disconnect();
      }
    }
  }

  /**
   * Create ADD_EVENT payload according to BLE protocol specification
   * COMPLETE VERSION - includes all required fields per protocol
   */
  private createAddEventPayload(event: EventConfig): Uint8Array {
    // Calculate required payload size:
    // 8 bytes (fixed fields) + event name (max 11 with null) + cron expression (max 43 with null) + padding
    const eventNameBytes = new TextEncoder().encode(event.name);
    const cronBytes = new TextEncoder().encode(event.cronExpression);

    // Validate lengths per protocol
    if (eventNameBytes.length > 10) {
      throw new Error(
        `Event name too long: ${eventNameBytes.length} bytes (max 10)`,
      );
    }
    if (cronBytes.length > 42) {
      throw new Error(
        `Cron expression too long: ${cronBytes.length} bytes (max 42)`,
      );
    }

    // Calculate total payload size: 8 fixed bytes + name + null + cron + null + padding to 8-byte boundary
    const fixedSize = 8;
    const nameSize = eventNameBytes.length + 1; // +1 for null terminator
    const cronSize = cronBytes.length + 1; // +1 for null terminator
    const baseSize = fixedSize + nameSize + cronSize;

    // Pad to 8-byte boundary for encryption
    const paddedSize = Math.ceil(baseSize / 8) * 8;
    const payload = new Uint8Array(paddedSize);

    let offset = 0;

    // Byte 0: Event Index (0-49)
    payload[offset++] = event.index;

    // Byte 1: Vibration Pattern (bits 0-5) + Vibration Intensity (bits 6-7)
    const vibrationByte =
      (event.vibrationPattern & 0x3f) |
      ((event.vibrationIntensity & 0x03) << 6);
    payload[offset++] = vibrationByte;

    // Byte 2: LED Pattern (bits 0-4) + LED Color (bits 5-7)
    const ledByte = (event.ledPattern & 0x1f) | ((event.ledColor & 0x07) << 5);
    payload[offset++] = ledByte;

    // Byte 3: Severity Level (1=Critical, 2=Important, 3=Informational)
    payload[offset++] = event.severityLevel;

    // Byte 4: Snooze Period (minutes)
    payload[offset++] = event.snoozePeriod;

    // Byte 5: Snooze Timeout (minutes)
    payload[offset++] = event.snoozeTimeout;

    // Byte 6: Retrigger Delay (minutes)
    payload[offset++] = event.retriggerDelay;

    // Byte 7: Retrigger Timeout (minutes)
    payload[offset++] = event.retriggerTimeout;

    // Bytes 8-X: Event Name (max 10 characters + null terminator)
    payload.set(eventNameBytes, offset);
    offset += eventNameBytes.length;
    payload[offset++] = 0x00; // Null terminator

    // Bytes X+1-Y: Cron Expression (max 42 characters + null terminator)
    payload.set(cronBytes, offset);
    offset += cronBytes.length;
    payload[offset++] = 0x00; // Null terminator

    // Remaining bytes: Reserved (0 padded) - already zeroed by Uint8Array constructor

    return payload;
  }

  /**
   * Create MINIMAL ADD_EVENT payload for MTU testing
   * Only includes the essential 8 bytes without strings
   */
  private createMinimalAddEventPayload(event: EventConfig): Uint8Array {
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

    return payload;
  }

  /**
   * Parse the response payload for add event command
   */
  static parseResponse(payload: Uint8Array): {
    success: boolean;
    eventIndex: number;
  } {
    if (payload.length < 2) {
      throw new Error("Invalid add event response - too short");
    }

    // Response payload format: Response Status | Event Index | Reserved
    const responseStatus = payload[0] ?? 0xff;
    const eventIndex = payload[1] ?? 0;
    const success = responseStatus === 0x00;

    return { success, eventIndex };
  }
}
