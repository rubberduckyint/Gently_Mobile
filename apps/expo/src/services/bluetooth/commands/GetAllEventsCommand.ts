/**
 * Get All Events Command
 *
 * Retrieves information about all events/alarms stored on the device.
 * This command properly handles multiple response packets as specified in the BLE protocol,
 * with each packet containing data for one event.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommandMultiPacket } from "./core";

export interface EventInfo {
  eventIndex: number;
  currentState: EventState;
  vibrationPattern: number;
  vibrationIntensity: VibrationIntensity;
  ledPattern: LedPattern;
  ledColor: LedColor;
  severityLevel: SeverityLevel;
  snoozePeriod: number;
  snoozeTimeout: number;
  retriggerDelay: number;
  retriggerTimeout: number;
  eventName: string;
  cronExpression: string;
}

export enum EventState {
  OFF = 0x00,
  ON_INACTIVE = 0x01,
  ON_ACTIVE_VIBRATION = 0x02,
  ON_ACTIVE_RETRIGGER_DELAY = 0x03,
  ON_ACTIVE_SNOOZE_PERIOD = 0x04,
}

export enum VibrationIntensity {
  LOW = 0x00,
  MEDIUM = 0x01,
  HIGH = 0x02,
  MAXIMUM = 0x03,
}

export enum LedPattern {
  OFF = 0x00,
  BLINK_SLOW = 0x01,
  BLINK_FAST = 0x02,
  SOLID = 0x03,
}

export enum LedColor {
  OFF = 0,
  BLUE = 1,
  GREEN = 2,
  CYAN = 3,
  RED = 4,
  YELLOW = 5,
  MAGENTA = 6,
  WHITE = 7,
}

export enum SeverityLevel {
  CRITICAL = 0x01, // Not snoozable, No disarm
  IMPORTANT = 0x02, // Snoozable, but No disarm
  INFORMATIONAL = 0x03, // Snoozable & disarm
}

export interface GetAllEventsResponse {
  events: EventInfo[];
  totalEvents: number;
  connectionUsed: boolean;
}

export class GetAllEventsCommand extends BLECommand<GetAllEventsResponse> {
  readonly metadata: BLECommandMetadata = {
    id: "get-all-events",
    name: "Get All Events",
    description:
      "Retrieve information about all events/alarms stored on the device",
    category: "events",
    version: "1.0.0",
    requiresConnection: true,
    estimatedDuration: 3000, // May take longer if many events
    tags: ["events", "alarms", "list", "all"],
  };

  /**
   * Create the request payload for get all events command
   */
  static createRequest(): Uint8Array {
    // 6 bytes of padding as per protocol
    return new Uint8Array(6);
  }

  /**
   * Parse a single event response packet
   */
  static parseEventResponse(payload: Uint8Array): {
    packetNumber: number;
    totalPackets: number;
    eventInfo: EventInfo | null;
  } {
    if (payload.length < 2) {
      throw new Error(
        "Invalid get all events response - expected at least 2 bytes for header",
      );
    }

    // The BLE framework already handles the API version, command, and response status.
    // Our payload contains only the command-specific data:
    // Payload Byte 0: Packet number Uint8 (1, …, N)
    // Payload Byte 1: Total Packets Expected (N) Uint8
    // Payload Byte 2: Current Event Index (0-49)
    // Payload Byte 3: Event Current State
    // ... (rest of event data)

    const packetNumber = payload[0] ?? 0;
    const totalPackets = payload[1] ?? 0;

    // Check if this is an empty response (no events)
    if (payload.length < 21 || totalPackets === 0) {
      return {
        packetNumber,
        totalPackets,
        eventInfo: null,
      };
    }

    const eventIndex = payload[2] ?? 0;
    const currentState = (payload[3] ?? 0) as EventState;

    // Parse vibration byte (bits 0-5: pattern, bits 6-7: intensity)
    const vibrationByte = payload[4] ?? 0;
    const vibrationPattern = vibrationByte & 0x3f;
    const vibrationIntensity = ((vibrationByte >> 6) &
      0x03) as VibrationIntensity;

    // Parse LED byte (bits 0-4: pattern, bits 5-7: color)
    const ledByte = payload[5] ?? 0;
    const ledPattern = (ledByte & 0x1f) as LedPattern;
    const ledColor = ((ledByte >> 5) & 0x07) as LedColor;

    const severityLevel = (payload[6] ?? 0) as SeverityLevel;
    const snoozePeriod = payload[7] ?? 0;
    const snoozeTimeout = payload[8] ?? 0;
    const retriggerDelay = payload[9] ?? 0;
    const retriggerTimeout = payload[10] ?? 0;

    // Parse event name (starting at byte 11, null-terminated, max 10 chars)
    let nameEndIndex = 11;
    while (nameEndIndex < payload.length && payload[nameEndIndex] !== 0) {
      nameEndIndex++;
    }
    const eventName = new TextDecoder().decode(payload.slice(11, nameEndIndex));

    // Parse cron expression (starting after name + null terminator)
    const cronStartIndex = nameEndIndex + 1;
    let cronEndIndex = cronStartIndex;
    while (cronEndIndex < payload.length && payload[cronEndIndex] !== 0) {
      cronEndIndex++;
    }
    const cronExpression = new TextDecoder().decode(
      payload.slice(cronStartIndex, cronEndIndex),
    );

    const eventInfo: EventInfo = {
      eventIndex,
      currentState,
      vibrationPattern,
      vibrationIntensity,
      ledPattern,
      ledColor,
      severityLevel,
      snoozePeriod,
      snoozeTimeout,
      retriggerDelay,
      retriggerTimeout,
      eventName,
      cronExpression,
    };

    return {
      packetNumber,
      totalPackets,
      eventInfo,
    };
  }

  /**
   * Log human-readable details about the response payload
   */
  static logPayloadDetails(payload: Uint8Array): void {
    if (payload.length < 2) {
      console.log(
        `🔓 PROTOCOL:     ⚠️  GET_ALL_EVENTS response too short: ${payload.length} bytes (expected at least 2)`,
      );
      return;
    }

    const _packetNumber = payload[0];
    const _totalPackets = payload[1];

    // Verbose packet logging removed for conciseness
    if (payload.length >= 21) {
      const eventIndex = payload[2];
      const currentState = payload[3];
      console.log(
        `🔓 PROTOCOL:     📋 Event Index: ${eventIndex}, State: ${currentState}`,
      );
    }
  }

  static getStateDescription(state: EventState): string {
    switch (state) {
      case EventState.OFF:
        return "OFF";
      case EventState.ON_INACTIVE:
        return "ON (inactive)";
      case EventState.ON_ACTIVE_VIBRATION:
        return "ON (vibrating)";
      case EventState.ON_ACTIVE_RETRIGGER_DELAY:
        return "ON (retrigger delay)";
      case EventState.ON_ACTIVE_SNOOZE_PERIOD:
        return "ON (snoozing)";
      default:
        return `Unknown (0x${(state as number).toString(16)})`;
    }
  }

  static getSeverityDescription(severity: SeverityLevel): string {
    switch (severity) {
      case SeverityLevel.CRITICAL:
        return "Critical";
      case SeverityLevel.IMPORTANT:
        return "Important";
      case SeverityLevel.INFORMATIONAL:
        return "Informational";
      default:
        return `Unknown (0x${(severity as number).toString(16)})`;
    }
  }

  static getVibrationDescription(intensity: VibrationIntensity): string {
    switch (intensity) {
      case VibrationIntensity.LOW:
        return "Low";
      case VibrationIntensity.MEDIUM:
        return "Medium";
      case VibrationIntensity.HIGH:
        return "High";
      case VibrationIntensity.MAXIMUM:
        return "Maximum";
      default:
        return `Unknown (0x${(intensity as number).toString(16)})`;
    }
  }

  static getLedDescription(color: LedColor, pattern: LedPattern): string {
    const colorName = this.getLedColorName(color);
    const patternName = this.getLedPatternName(pattern);
    return `${colorName} ${patternName}`;
  }

  static getLedColorName(color: LedColor): string {
    switch (color) {
      case LedColor.OFF:
        return "Off";
      case LedColor.BLUE:
        return "Blue";
      case LedColor.GREEN:
        return "Green";
      case LedColor.CYAN:
        return "Cyan";
      case LedColor.RED:
        return "Red";
      case LedColor.YELLOW:
        return "Yellow";
      case LedColor.MAGENTA:
        return "Magenta";
      case LedColor.WHITE:
        return "White";
      default:
        return `Unknown (${color as number})`;
    }
  }

  static getLedPatternName(pattern: LedPattern): string {
    switch (pattern) {
      case LedPattern.OFF:
        return "Off";
      case LedPattern.BLINK_SLOW:
        return "Slow Blink";
      case LedPattern.BLINK_FAST:
        return "Fast Blink";
      case LedPattern.SOLID:
        return "Solid";
      default:
        return `Unknown (0x${(pattern as number).toString(16)})`;
    }
  }

  protected async executeImpl(
    context: BLECommandExecutionContext,
  ): Promise<GetAllEventsResponse> {
    this.log("info", "Getting all events from device");

    let connection = context.connection;
    let shouldDisconnect = false;

    if (!connection) {
      this.log("info", "Establishing connection for get all events request...");
      connection = await context.connect();
      shouldDisconnect = true;
    } else {
      this.log("info", "Using existing connection");
    }

    try {
      this.log(
        "debug",
        "📤 Sending GET_ALL_EVENTS command with multi-packet support...",
      );

      // Use the new multi-packet response handler
      // For GET_ALL_EVENTS, packet number is at index 1 and total packets at index 2
      const responses = await sendSecureCommandMultiPacket(
        connection,
        CommandCode.GET_ALL_EVENTS,
        undefined, // no payload for GET_ALL_EVENTS
        {
          packetNumberIndex: 0, // Updated: packet number is now at index 0
          totalPacketsIndex: 1, // Updated: total packets is now at index 1
          maxPackets: 50, // Safety limit for maximum events
        },
      );

      this.log("info", `📦 Received ${responses.length} response packets`);

      if (responses.length === 0) {
        this.log("info", `📭 No events found on device`);
        return {
          events: [],
          totalEvents: 0,
          connectionUsed: !shouldDisconnect,
        };
      }

      // Parse all the response packets to extract events
      const events: EventInfo[] = [];
      const receivedPacketNumbers = new Set<number>();
      let totalPackets = 0;

      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        if (!response) {
          this.log("error", `❌ Missing response packet at index ${i}`);
          continue;
        }

        this.log(
          "debug",
          `📥 Processing response packet ${i + 1}/${responses.length}`,
          {
            responseLength: response.length,
            responseBytes: Array.from(response)
              .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
              .join(" "),
          },
        );

        // Log the payload details for debugging
        GetAllEventsCommand.logPayloadDetails(response);

        try {
          // Parse each response packet
          const {
            packetNumber,
            totalPackets: totalFromPacket,
            eventInfo,
          } = GetAllEventsCommand.parseEventResponse(response);

          // Track packet numbers to ensure we got all expected packets
          receivedPacketNumbers.add(packetNumber);

          if (totalFromPacket > 0) {
            totalPackets = totalFromPacket;
          }

          if (eventInfo) {
            this.log(
              "info",
              `✅ Parsed event ${packetNumber}/${totalFromPacket}: "${eventInfo.eventName}" (State: ${eventInfo.currentState})`,
            );
            events.push(eventInfo);
          } else {
            this.log(
              "warn",
              `⚠️ Packet ${packetNumber} contained no event data`,
            );
          }
        } catch (parseError) {
          this.log("error", `❌ Failed to parse response packet ${i + 1}`, {
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          });
          // Continue processing other packets even if one fails
        }
      }

      // Validate we received all expected packets
      if (totalPackets > 0) {
        const expectedPackets = Array.from(
          { length: totalPackets },
          (_, i) => i + 1,
        );
        const missingPackets = expectedPackets.filter(
          (num) => !receivedPacketNumbers.has(num),
        );

        if (missingPackets.length > 0) {
          this.log(
            "warn",
            `⚠️ Missing packet numbers: ${missingPackets.join(", ")}`,
          );
        } else {
          this.log(
            "info",
            `✅ Received all expected packets (1-${totalPackets})`,
          );
        }
      }

      this.log(
        "info",
        `✅ Successfully retrieved ${events.length} events from ${responses.length} packets`,
      );

      return {
        events,
        totalEvents: totalPackets || events.length,
        connectionUsed: !shouldDisconnect,
      };
    } catch (error) {
      this.log("error", "❌ Get all events failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      if (shouldDisconnect) {
        this.log("debug", "🔌 Disconnecting from device");
        await context.disconnect();
      }
    }
  }
}
