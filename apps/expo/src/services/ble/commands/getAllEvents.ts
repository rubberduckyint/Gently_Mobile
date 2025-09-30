/**
 * Get All Events Command
 * Gets all stored events from the device
 */

import type { BLECommandRequest } from "../types";
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

  if (payload.length < 3) {
    console.error(
      `❌ GET_ALL_EVENTS Response: Payload too short (${payload.length} < 3)`,
    );
    throw new Error("Invalid get all events response: payload too short");
  }

  // Parse according to BLE protocol:
  // After BLE manager strips API version and command code:
  // payload[0]: Response Status (0x00=OK, 0x01=ERROR)
  // payload[1]: Packet number (1...N)
  // payload[2]: Total packets expected (N)
  // payload[3]: Current event index (0-49)
  // payload[4]: Event current state (0x00-0x05)
  // payload[5]: Vibration pattern + intensity (combined byte)
  // payload[6]: LED pattern + color (combined byte)
  // payload[7]: Severity level
  // payload[8]: Snooze period
  // payload[9]: Snooze timeout
  // payload[10]: Retrigger delay
  // payload[11]: Retrigger timeout
  // payload[12-22]: Event name (max 10 chars + null terminator)
  // payload[23-65]: Cron expression (max 42 chars + null terminator)
  // payload[66-71]: Reserved

  const statusByte = payload[0] ?? 0;
  const status = statusByte === 0x00 ? "OK" : "ERROR";
  const packetNumber = payload[1] ?? 0;
  const totalPackets = payload[2] ?? 0;

  console.log(
    `  - Status: 0x${statusByte.toString(16).padStart(2, "0")} (${status})`,
  );
  console.log(`  - Packet: ${packetNumber}/${totalPackets}`);

  if (status === "ERROR") {
    console.error(`❌ GET_ALL_EVENTS Response: Device returned error status`);
    return {
      events: [],
      totalEvents: 0,
      rawPayload: payload,
    };
  }

  if (payload.length < 12) {
    console.warn(
      `⚠️ GET_ALL_EVENTS Response: Insufficient data for event parsing (${payload.length} < 12)`,
    );
    return {
      events: [],
      totalEvents: totalPackets,
      rawPayload: payload,
    };
  }

  // Parse single event from this packet
  const events: Event[] = [];
  const eventIndex = payload[3] ?? 0;
  const eventState = payload[4] ?? 0;
  const vibrationByte = payload[5] ?? 0;
  const ledByte = payload[6] ?? 0;
  const severityLevel = payload[7] ?? 0;

  // Extract vibration pattern and intensity
  const vibrationPattern = vibrationByte & 0x3f; // bits 0-5
  const vibrationIntensity = (vibrationByte >> 6) & 0x03; // bits 6-7

  // Extract LED pattern and color
  const ledPattern = ledByte & 0x1f; // bits 0-4
  const ledColor = (ledByte >> 5) & 0x07; // bits 5-7

  // Parse event name (bytes 12-22)
  let eventName = "";
  for (let i = 12; i < 23 && i < payload.length; i++) {
    const byte = payload[i] ?? 0;
    if (byte === 0) break; // null terminator
    eventName += String.fromCharCode(byte);
  }

  // Parse cron expression (bytes 23-65)
  let cronExpression = "";
  for (let i = 23; i < 66 && i < payload.length; i++) {
    const byte = payload[i] ?? 0;
    if (byte === 0) break; // null terminator
    cronExpression += String.fromCharCode(byte);
  }

  console.log(`  - Event Index: ${eventIndex}`);
  console.log(
    `  - Event State: 0x${eventState.toString(16).padStart(2, "0")} (${eventState === 0 ? "OFF" : eventState === 1 ? "ON/Inactive" : eventState === 2 ? "ON/Vibrating" : "ON/Other"})`,
  );
  console.log(`  - Event Name: "${eventName}"`);
  console.log(`  - Cron Expression: "${cronExpression}"`);
  console.log(
    `  - Vibration: Pattern=${vibrationPattern}, Intensity=${vibrationIntensity}`,
  );
  console.log(`  - LED: Pattern=${ledPattern}, Color=${ledColor}`);
  console.log(`  - Severity Level: ${severityLevel}`);

  // Create event object
  events.push({
    id: eventIndex,
    hour: 0, // Will need to parse from cron expression
    minute: 0, // Will need to parse from cron expression
    days: 0, // Will need to parse from cron expression
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
