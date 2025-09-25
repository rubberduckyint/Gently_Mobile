/**
 * Add Event Command (0x04)
 * Adds a new event to the Gently bracelet
 */

import type { EventData, EventResponse } from "../types";
import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

/**
 * Add a new event to the bracelet
 */
export async function addEvent(
  serialNumber: string,
  eventData: EventData,
): Promise<EventResponse> {
  // Validate event index (0-49)
  if (eventData.eventIndex < 0 || eventData.eventIndex > 49) {
    throw new Error("Event index must be between 0 and 49");
  }

  // Validate event name (max 10 characters)
  if (eventData.eventName.length > 10) {
    throw new Error("Event name must be 10 characters or less");
  }

  // Validate cron expression (max 42 characters)
  if (eventData.cronExpression.length > 42) {
    throw new Error("Cron expression must be 42 characters or less");
  }

  // Create payload according to BLE protocol specification
  const payload = new Uint8Array(72); // Max size needed
  let offset = 0;

  // Byte #2: Event Index
  payload[offset++] = eventData.eventIndex;

  // Byte #3: Vibration Pattern (bits 0-5) + Vibration Intensity (bits 6-7)
  const vibrationByte =
    (eventData.vibrationPattern & 0x3f) |
    ((eventData.vibrationIntensity & 0x03) << 6);
  payload[offset++] = vibrationByte;

  // Byte #4: LED Pattern (bits 0-4) + LED Color (bits 5-7)
  const ledByte =
    (eventData.ledPattern & 0x1f) | ((eventData.ledColor & 0x07) << 5);
  payload[offset++] = ledByte;

  // Byte #5: Severity Level
  payload[offset++] = eventData.severityLevel;

  // Byte #6: Snooze period (minutes)
  payload[offset++] = eventData.snoozePeriod;

  // Byte #7: Snooze timeout (minutes)
  payload[offset++] = eventData.snoozeTimeout;

  // Byte #8: Retrigger delay (minutes)
  payload[offset++] = eventData.retriggerDelay;

  // Byte #9: Retrigger timeout (minutes)
  payload[offset++] = eventData.retriggerTimeout;

  // Bytes #10-20: Event Name (max 10 chars + null terminator)
  const eventNameBytes = new TextEncoder().encode(
    eventData.eventName.substring(0, 10),
  );
  for (let i = 0; i < 11; i++) {
    const byte = i < eventNameBytes.length ? eventNameBytes[i] : undefined;
    payload[offset++] = byte ?? 0x00;
  }

  // Bytes #21-63: Cron expression (max 42 chars + null terminator)
  const cronBytes = new TextEncoder().encode(
    eventData.cronExpression.substring(0, 42),
  );
  for (let i = 0; i < 43; i++) {
    const byte = i < cronBytes.length ? cronBytes[i] : undefined;
    payload[offset++] = byte ?? 0x00;
  }

  // Remaining bytes: RESERVED (0 padded) - already initialized to 0

  console.log(
    `\n🎯 Adding event ${eventData.eventIndex}: "${eventData.eventName}"`,
  );
  console.log("   • Cron Expr   :", eventData.cronExpression);
  console.log("   • Vibrate/LED :", {
    vibrationPattern: eventData.vibrationPattern,
    vibrationIntensity: eventData.vibrationIntensity,
    ledPattern: eventData.ledPattern,
    ledColor: eventData.ledColor,
  });
  console.log("   • Timing      :", {
    severityLevel: eventData.severityLevel,
    snoozePeriod: eventData.snoozePeriod,
    snoozeTimeout: eventData.snoozeTimeout,
    retriggerDelay: eventData.retriggerDelay,
    retriggerTimeout: eventData.retriggerTimeout,
  });

  const response = await executeBLECommand(
    {
      command: CommandCode.ADD_EVENT,
      payload,
    },
    serialNumber,
  );

  if (response.status !== ResponseStatus.OK) {
    console.log(`❌ Failed to add event ${eventData.eventIndex}`);
    throw new Error(`Failed to add event: status ${response.status}`);
  }

  if (response.payload.length < 1) {
    throw new Error("Invalid response payload length for addEvent");
  }

  const responseEventIndex = response.payload[0] ?? eventData.eventIndex;
  const payloadHex = Array.from(response.payload)
    .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
    .join(" ");
  const reservedBytes = response.payload.slice(1);
  const reservedHex = Array.from(reservedBytes)
    .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
    .join(" ");

  const result: EventResponse = {
    eventIndex: responseEventIndex,
    status: response.status,
  };

  console.log(`   • Event Index : ${responseEventIndex}`);
  if (reservedBytes.length > 0) {
    console.log(`   • Reserved    : ${reservedHex || "0x00"}`);
  }
  console.log(`   • Raw Bytes   : ${payloadHex}`);
  console.log("✅ Event added successfully");

  return result;
}
