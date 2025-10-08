/**
 * Get All Events Command
 * Gets all stored events from the device
 */

import type { BLECommandRequest } from "../types";
import { sendMultiPacketCommand } from "../manager";
import { CommandCode } from "../types";

export interface Event {
  id: number;
  hour: number;
  minute: number;
  days: number; // Bitmask for days of week
  enabled: boolean;
  vibratePattern: number;
  name?: string;
}

export interface AllEventsResponse {
  events: Event[];
  totalEvents: number;
  rawPayload: Uint8Array; // For debugging
}

export interface CronParseResult {
  isValid: boolean;
  hour: number;
  minute: number;
  days: number; // Bitmask for days of week
  daysText: string;
  error?: string;
}

function getEventStateText(eventState: number): string {
  const stateTexts = [
    "OFF",
    "ON/Inactive",
    "ON/Vibrating",
    "ON/Retrigger Delay",
    "ON/Snooze Period",
    "ON/Other",
  ];
  return stateTexts[eventState] ?? `Unknown State (${eventState})`;
}

function parseCronExpression(cronExpression: string): CronParseResult {
  if (!cronExpression || cronExpression.trim() === "") {
    return {
      isValid: false,
      hour: 0,
      minute: 0,
      days: 0,
      daysText: "None",
      error: "Empty cron expression",
    };
  }

  try {
    // Standard cron format: "minute hour day month weekday"
    // For device scheduling, we typically care about: "minute hour * * weekday"
    const parts = cronExpression.trim().split(/\s+/);

    if (parts.length < 5) {
      return {
        isValid: false,
        hour: 0,
        minute: 0,
        days: 0,
        daysText: "Invalid format",
        error: `Expected 5 parts, got ${parts.length}`,
      };
    }

    const minute = parseInt(parts[0] ?? "0", 10);
    const hour = parseInt(parts[1] ?? "0", 10);
    const weekday = parts[4] ?? "*";

    // Validate time ranges
    if (isNaN(minute) || minute < 0 || minute > 59) {
      return {
        isValid: false,
        hour: 0,
        minute: 0,
        days: 0,
        daysText: "Invalid minute",
        error: `Invalid minute: ${parts[0]}`,
      };
    }

    if (isNaN(hour) || hour < 0 || hour > 23) {
      return {
        isValid: false,
        hour: 0,
        minute: 0,
        days: 0,
        daysText: "Invalid hour",
        error: `Invalid hour: ${parts[1]}`,
      };
    }

    // Parse weekday to bitmask
    let daysBitmask = 0;
    let daysText = "";

    if (weekday === "*") {
      daysBitmask = 0b1111111; // All days
      daysText = "Every day";
    } else if (weekday.includes(",")) {
      // Multiple specific days: "1,3,5"
      const dayNumbers = weekday.split(",").map((d) => parseInt(d.trim(), 10));
      const dayNames: string[] = [];

      for (const dayNum of dayNumbers) {
        if (dayNum >= 0 && dayNum <= 6) {
          daysBitmask |= 1 << dayNum;
          dayNames.push(getDayName(dayNum));
        }
      }
      daysText = dayNames.join(", ");
    } else if (weekday.includes("-")) {
      // Range of days: "1-5" (Mon-Fri)
      const rangeParts = weekday.split("-").map((d) => parseInt(d.trim(), 10));
      const start = rangeParts[0];
      const end = rangeParts[1];

      if (
        start !== undefined &&
        end !== undefined &&
        !isNaN(start) &&
        !isNaN(end) &&
        start >= 0 &&
        start <= 6 &&
        end >= 0 &&
        end <= 6
      ) {
        const dayNames: string[] = [];
        for (let day = start; day <= end; day++) {
          daysBitmask |= 1 << day;
          dayNames.push(getDayName(day));
        }
        daysText = dayNames.join(", ");
      }
    } else {
      // Single day
      const dayNum = parseInt(weekday, 10);
      if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
        daysBitmask = 1 << dayNum;
        daysText = getDayName(dayNum);
      }
    }

    return {
      isValid: true,
      hour,
      minute,
      days: daysBitmask,
      daysText: daysText || "No days selected",
    };
  } catch (error) {
    return {
      isValid: false,
      hour: 0,
      minute: 0,
      days: 0,
      daysText: "Parse error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function getDayName(dayNumber: number): string {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return dayNames[dayNumber] ?? `Day${dayNumber}`;
}

export function createGetAllEventsRequest(): BLECommandRequest {
  console.log(`📤 GET_ALL_EVENTS Request Created:`);
  console.log(
    `  - Command: 0x${CommandCode.GET_ALL_EVENTS.toString(16).padStart(2, "0")}`,
  );
  console.log(`  - No payload required for this command`);

  return {
    command: CommandCode.GET_ALL_EVENTS,
    apiVersion: 1,
  };
}

// Store for accumulating multi-packet responses
interface PacketAccumulator {
  packets: Map<number, Uint8Array>;
  totalPackets: number;
  events: Event[];
}

const eventPacketStore = new Map<string, PacketAccumulator>();

export function handleGetAllEventsPacket(
  payload: Uint8Array,
  deviceId: string,
): AllEventsResponse | null {
  console.log(`📥 GET_ALL_EVENTS Packet Handler for device: ${deviceId}`);
  console.log(
    `  - Payload after header stripping (${payload.length} bytes): [${Array.from(
      payload,
    )
      .map((b) => "0x" + b.toString(16).padStart(2, "0"))
      .join(", ")}]`,
  );

  if (payload.length < 2) {
    console.error(`❌ Packet too short (${payload.length} < 2)`);
    throw new Error("Invalid packet: payload too short");
  }

  // After parseResponsePacket strips headers, the payload structure is:
  // payload[0]: Packet number (1...N)
  // payload[1]: Total packets expected (N)
  // payload[2]: Current event index (0-49)
  // payload[3+]: Event data

  const packetNumber = payload[0] ?? 0;
  const totalPackets = payload[1] ?? 0;

  console.log(`  - Packet ${packetNumber}/${totalPackets}`);

  // Initialize or get accumulator for this device
  let accumulator = eventPacketStore.get(deviceId);
  if (!accumulator) {
    accumulator = {
      packets: new Map(),
      totalPackets,
      events: [],
    };
    eventPacketStore.set(deviceId, accumulator);
  }

  // Store this packet
  accumulator.packets.set(packetNumber, payload);

  // Check if we have all packets (all should have status 0x00 per protocol)
  if (accumulator.packets.size === totalPackets) {
    console.log(
      `✅ All packets received for device ${deviceId}, processing...`,
    );

    // Process all packets in order
    const allEvents: Event[] = [];
    for (let i = 1; i <= totalPackets; i++) {
      const packet = accumulator.packets.get(i);
      if (packet) {
        // Note: packet here is already the payload without headers (thanks to parseResponsePacket)
        const singlePacketResponse = parseGetAllEventsResponse(packet);
        allEvents.push(...singlePacketResponse.events);
      } else {
        console.warn(`⚠️ Missing packet ${i} for device ${deviceId}`);
      }
    }

    // Clean up
    eventPacketStore.delete(deviceId);

    return {
      events: allEvents,
      totalEvents: allEvents.length,
      rawPayload: new Uint8Array(), // Combined payload would be too large
    };
  } // Still waiting for more packets
  console.log(
    `⏳ Waiting for ${totalPackets - accumulator.packets.size} more packets...`,
  );
  return null;
}

export function parseGetAllEventsResponse(
  payload: Uint8Array,
): AllEventsResponse {
  console.log(`📥 GET_ALL_EVENTS Response Received:`);
  console.log(`  - Payload Length: ${payload.length} bytes`);
  console.log(
    `  - Payload Hex: [${Array.from(payload)
      .map((b) => "0x" + b.toString(16).padStart(2, "0"))
      .join(", ")}]`,
  );

  if (payload.length < 2) {
    console.error(
      `❌ GET_ALL_EVENTS Response: Payload too short (${payload.length} < 2)`,
    );
    throw new Error("Invalid get all events response: payload too short");
  }

  // Parse according to BLE protocol specification:
  // parseResponsePacket strips API version, command code, and status, so:
  // payload[0]: Packet number (1...N)
  // payload[1]: Total packets expected (N)
  // payload[2]: Current event index (0-49)
  // payload[3]: Event current state (0x00-0x05)
  // payload[4]: Vibration pattern + intensity (combined byte)
  // payload[5]: LED pattern + color (combined byte)
  // payload[6]: Severity level
  // payload[7]: Snooze period
  // payload[8]: Snooze timeout
  // payload[9]: Retrigger delay
  // payload[10]: Retrigger timeout
  // payload[11-21]: Event name (max 10 chars + null terminator)
  // payload[22-64]: Cron expression (max 42 chars + null terminator)
  // payload[65-68]: Reserved

  const packetNumber = payload[0] ?? 0;
  const totalPackets = payload[1] ?? 0;

  console.log(`  - Packet: ${packetNumber}/${totalPackets}`);

  if (payload.length < 11) {
    console.warn(
      `⚠️ GET_ALL_EVENTS Response: Insufficient data for event parsing (${payload.length} < 11)`,
    );
    return {
      events: [],
      totalEvents: totalPackets,
      rawPayload: payload,
    };
  }

  // Parse single event from this packet
  const events: Event[] = [];
  const eventIndex = payload[2] ?? 0;
  const eventState = payload[3] ?? 0;
  const vibrationByte = payload[4] ?? 0;
  const ledByte = payload[5] ?? 0;
  const severityLevel = payload[6] ?? 0;

  // Extract vibration pattern and intensity
  const vibrationPattern = vibrationByte & 0x3f; // bits 0-5
  const vibrationIntensity = (vibrationByte >> 6) & 0x03; // bits 6-7

  // Extract LED pattern and color
  const ledPattern = ledByte & 0x1f; // bits 0-4
  const ledColor = (ledByte >> 5) & 0x07; // bits 5-7

  // Parse event name (bytes 11-21, after header stripping)
  let eventName = "";
  for (let i = 11; i < 22 && i < payload.length; i++) {
    const byte = payload[i] ?? 0;
    if (byte === 0) break; // null terminator
    eventName += String.fromCharCode(byte);
  }

  // Parse cron expression (bytes 22-64, after header stripping)
  let cronExpression = "";
  console.log(`  - Debug: Looking for cron expression starting at byte 22`);
  console.log(`  - Debug: Payload length is ${payload.length}`);

  // Find the end of the event name to locate cron expression start
  let cronStart = 11;
  while (cronStart < payload.length && payload[cronStart] !== 0) {
    cronStart++;
  }
  cronStart++; // Skip the null terminator

  console.log(`  - Debug: Cron expression should start at byte ${cronStart}`);
  console.log(
    `  - Debug: Bytes from ${cronStart} onward: [${Array.from(
      payload.slice(cronStart, Math.min(cronStart + 20, payload.length)),
    )
      .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
      .join(", ")}]`,
  );

  for (let i = cronStart; i < payload.length; i++) {
    const byte = payload[i] ?? 0;
    if (byte === 0) break; // null terminator
    cronExpression += String.fromCharCode(byte);
  }

  // Parse cron expression to extract time and days
  const cronParsed = parseCronExpression(cronExpression);

  console.log(`  - Event Index: ${eventIndex}`);
  console.log(
    `  - Event State: 0x${eventState.toString(16).padStart(2, "0")} (${getEventStateText(eventState)})`,
  );
  console.log(`  - Event Name: "${eventName}"`);
  console.log(`  - Cron Expression: "${cronExpression}"`);

  if (cronParsed.isValid) {
    console.log(
      `  - Parsed Time: ${cronParsed.hour.toString().padStart(2, "0")}:${cronParsed.minute.toString().padStart(2, "0")}`,
    );
    console.log(
      `  - Days: ${cronParsed.daysText} (bitmask: 0b${cronParsed.days.toString(2).padStart(7, "0")})`,
    );
  } else {
    console.log(`  - ⚠️ Cron parsing failed: ${cronParsed.error}`);
  }

  console.log(
    `  - Vibration: Pattern=${vibrationPattern}, Intensity=${vibrationIntensity}`,
  );
  console.log(`  - LED: Pattern=${ledPattern}, Color=${ledColor}`);
  console.log(`  - Severity Level: ${severityLevel}`);

  // Create event object
  events.push({
    id: eventIndex,
    hour: cronParsed.isValid ? cronParsed.hour : 0,
    minute: cronParsed.isValid ? cronParsed.minute : 0,
    days: cronParsed.isValid ? cronParsed.days : 0,
    enabled: eventState > 0,
    vibratePattern: vibrationPattern,
    name: eventName,
  });

  return {
    events,
    totalEvents: totalPackets,
    rawPayload: payload,
  };
}

/**
 * Main function to get all events using multi-packet handling
 */
export async function getAllEvents(
  peripheralId: string,
  encryptionKey: string,
): Promise<AllEventsResponse> {
  console.log(`🔍 Getting all events from device: ${peripheralId}`);

  const command = createGetAllEventsRequest();

  return sendMultiPacketCommand(
    peripheralId,
    encryptionKey,
    command,
    handleGetAllEventsPacket,
  );
}
