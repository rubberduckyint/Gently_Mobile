/**
 * Get All Events Command
 *
 * Retrieves information about all events/alarms stored on the device.
 * Returns multiple response packets, one for each configured event.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { CommandCode } from "../protocol-types";
import { BLECommand } from "./base";
import { sendSecureCommand } from "./core";

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
    if (payload.length < 5) {
      throw new Error(
        "Invalid get all events response - expected at least 5 bytes for header",
      );
    }

    // Parse the response according to protocol specification
    const packetNumber = payload[3] ?? 0;
    const totalPackets = payload[4] ?? 0;

    // Check if this is an empty response (no events)
    if (payload.length < 24 || totalPackets === 0) {
      return {
        packetNumber,
        totalPackets,
        eventInfo: null,
      };
    }

    const eventIndex = payload[5] ?? 0;
    const currentState = (payload[6] ?? 0) as EventState;

    // Parse vibration byte (bits 0-5: pattern, bits 6-7: intensity)
    const vibrationByte = payload[7] ?? 0;
    const vibrationPattern = vibrationByte & 0x3f;
    const vibrationIntensity = ((vibrationByte >> 6) &
      0x03) as VibrationIntensity;

    // Parse LED byte (bits 0-4: pattern, bits 5-7: color)
    const ledByte = payload[8] ?? 0;
    const ledPattern = (ledByte & 0x1f) as LedPattern;
    const ledColor = ((ledByte >> 5) & 0x07) as LedColor;

    const severityLevel = (payload[9] ?? 0) as SeverityLevel;
    const snoozePeriod = payload[10] ?? 0;
    const snoozeTimeout = payload[11] ?? 0;
    const retriggerDelay = payload[12] ?? 0;
    const retriggerTimeout = payload[13] ?? 0;

    // Parse event name (starting at byte 14, null-terminated, max 10 chars)
    let nameEndIndex = 14;
    while (nameEndIndex < payload.length && payload[nameEndIndex] !== 0) {
      nameEndIndex++;
    }
    const eventName = new TextDecoder().decode(payload.slice(14, nameEndIndex));

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
    if (payload.length < 5) {
      console.log(
        `🔓 PROTOCOL:     ⚠️  GET_ALL_EVENTS response too short: ${payload.length} bytes (expected at least 5)`,
      );
      return;
    }

    const apiVersion = payload[0];
    const commandCode = payload[1];
    const status = payload[2];
    const packetNumber = payload[3];
    const totalPackets = payload[4];

    console.log(
      `🔓 PROTOCOL:     📋 GET_ALL_EVENTS response: API 0x${apiVersion?.toString(16).padStart(2, "0")}, Cmd 0x${commandCode?.toString(16).padStart(2, "0")}, Status 0x${status?.toString(16).padStart(2, "0")}`,
    );
    console.log(
      `🔓 PROTOCOL:     📋 Packet ${packetNumber}/${totalPackets}, Payload size: ${payload.length} bytes`,
    );

    if (totalPackets === 0 || payload.length < 24) {
      console.log(`🔓 PROTOCOL:     📋 No events found (empty response)`);
      return;
    }

    try {
      const { eventInfo } = this.parseEventResponse(payload);
      if (eventInfo) {
        console.log(
          `🔓 PROTOCOL:     📋 GET_ALL_EVENTS packet ${packetNumber}/${totalPackets}: Event #${eventInfo.eventIndex}`,
        );
        console.log(
          `🔓 PROTOCOL:     📋 Name: "${eventInfo.eventName}", State: ${this.getStateDescription(eventInfo.currentState)}`,
        );
        console.log(
          `🔓 PROTOCOL:     📋 Cron: "${eventInfo.cronExpression}", Severity: ${this.getSeverityDescription(eventInfo.severityLevel)}`,
        );
        console.log(
          `🔓 PROTOCOL:     📋 Vibration: ${this.getVibrationDescription(eventInfo.vibrationIntensity)}, LED: ${this.getLedDescription(eventInfo.ledColor, eventInfo.ledPattern)}`,
        );
      }
    } catch (error) {
      console.log(
        `🔓 PROTOCOL:     ⚠️  GET_ALL_EVENTS response parse error: ${String(error)}`,
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
      // Note: This command may return multiple response packets
      // For now, we'll handle the first response to get the total count
      // In a full implementation, we'd need to handle multiple packets
      const response = await sendSecureCommand(
        connection,
        CommandCode.GET_ALL_EVENTS,
      );

      if (response.length < 5) {
        throw new Error("Invalid get all events response - too short");
      }

      const status = response[0] ?? 0xff;
      if (status !== 0x00) {
        throw new Error(
          `Get all events failed with status: 0x${status.toString(16).padStart(2, "0")}`,
        );
      }

      // Parse the first response packet to get total count
      const { packetNumber, totalPackets, eventInfo } =
        GetAllEventsCommand.parseEventResponse(response);

      if (eventInfo) {
        this.log(
          "info",
          `Received packet ${packetNumber}/${totalPackets} - First event: "${eventInfo.eventName}"`,
        );
        const events: EventInfo[] = [eventInfo];

        return {
          events,
          totalEvents: totalPackets,
          connectionUsed: !shouldDisconnect,
        };
      } else {
        this.log("info", `No events found on device (received empty response)`);

        return {
          events: [],
          totalEvents: 0,
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
