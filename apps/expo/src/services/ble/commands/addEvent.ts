/**
 * Add Event Command (0x04)
 * Adds a new event/alarm to the device based on BLE Protocol Rev 0.5
 */

import type { BLECommandRequest } from "../types";
import { CommandCode } from "../types";

export interface AddEventParams {
  eventIndex: number; // 0-49
  eventName: string; // Max 10 characters
  cronExpression: string; // Max 42 characters
  vibrationPattern: number; // 0-63
  vibrationIntensity: number; // 0=LOW, 1=MEDIUM, 2=HIGH, 3=MAXIMUM
  ledPattern: number; // 0=OFF, 1=blink_slow, 2=blink_fast, 3=solid
  ledColor: number; // 0=OFF, 1=Blue, 2=Green, 3=Cyan, 4=Red, 5=Yellow, 6=Magenta, 7=White
  severityLevel: number; // 1=Critical, 2=Important, 3=Informational
  snoozePeriod: number; // minutes
  snoozeTimeout: number; // minutes
  retriggerDelay: number; // minutes
  retriggerTimeout: number; // minutes
}

export function createAddEventRequest(
  params: AddEventParams,
): BLECommandRequest {
  // Validate inputs according to protocol
  if (
    !Number.isInteger(params.eventIndex) ||
    params.eventIndex < 0 ||
    params.eventIndex > 49
  ) {
    throw new Error("Event index must be an integer between 0-49");
  }
  if (params.eventName.length > 10) {
    throw new Error("Event name must be 10 characters or less");
  }
  if (params.cronExpression.length > 42) {
    throw new Error("Cron expression must be 42 characters or less");
  }

  console.log(
    `🔧 Creating ADD_EVENT: "${params.eventName}" at ${params.cronExpression} (index ${params.eventIndex})`,
  );

  const eventNameBytes = new TextEncoder().encode(params.eventName);
  const cronExpressionBytes = new TextEncoder().encode(params.cronExpression);

  // Calculate payload size
  const unpaddedSize =
    8 + (eventNameBytes.length + 1) + (cronExpressionBytes.length + 1);
  const paddedSize = Math.ceil(unpaddedSize / 8) * 8;

  const payload = new Uint8Array(paddedSize).fill(0); // 0-padded
  let offset = 0;

  // Byte #0: Event Index (0-49)
  payload[offset++] = params.eventIndex & 0xff;

  // Byte #1: Vibration Pattern (bits 0-5) + Vibration Intensity (bits 6-7)
  const vibrationByte =
    (params.vibrationPattern & 0x3f) |
    ((params.vibrationIntensity & 0x03) << 6);
  payload[offset++] = vibrationByte;

  // Byte #2: LED Pattern (bits 0-4) + LED Color (bits 5-7)
  const ledByte = (params.ledPattern & 0x1f) | ((params.ledColor & 0x07) << 5);
  payload[offset++] = ledByte;

  // Byte #3: Severity Level
  payload[offset++] = params.severityLevel & 0xff;

  // Byte #4: Snooze period (minutes)
  payload[offset++] = params.snoozePeriod & 0xff;

  // Byte #5: Snooze timeout (minutes)
  payload[offset++] = params.snoozeTimeout & 0xff;

  // Byte #6: Retrigger delay (minutes)
  payload[offset++] = params.retriggerDelay & 0xff;

  // Byte #7: Retrigger timeout (minutes)
  payload[offset++] = params.retriggerTimeout & 0xff;

  // Event Name (null-terminated string)
  payload.set(eventNameBytes, offset);
  offset += eventNameBytes.length;
  payload[offset++] = 0x00; // Null terminator

  // Cron Expression (null-terminated string)
  payload.set(cronExpressionBytes, offset);
  offset += cronExpressionBytes.length;
  payload[offset++] = 0x00; // Null terminator

  console.log(
    `  - Payload: ${payload.length} bytes (vibration ${params.vibrationPattern}/${params.vibrationIntensity}, LED ${params.ledPattern}/${params.ledColor}, severity ${params.severityLevel})`,
  );

  return {
    command: CommandCode.ADD_EVENT,
    apiVersion: 1,
    payload: payload,
  };
}

export interface AddEventResponse {
  status: "OK" | "ERROR";
  eventIndex: number;
}

export function parseAddEventResponse(
  payload: Uint8Array,
  bleStatus: number,
  commandCode: number,
): AddEventResponse {
  console.log(
    `📥 Parsing ADD_EVENT response: ${bleStatus === 0 ? "OK" : "ERROR"}`,
  );

  // Validate command code matches ADD_EVENT (0x04)
  if (commandCode !== 0x04) {
    console.warn(
      `⚠️ Command mismatch: got 0x${commandCode.toString(16)}, expected 0x04 - firmware may not support ADD_EVENT`,
    );
  }

  // Parse response according to BLE Protocol Rev 0.5:
  // Byte #0: API Version (handled by BLE manager)
  // Byte #1: Command Code (handled by BLE manager)
  // Byte #2: Response Status (0x00=OK, 0x01=ERROR)
  // Byte #3: Event Index (0-49)
  // Byte #4-7: RESERVED (0 Padded)

  const responseStatus: "OK" | "ERROR" = bleStatus === 0x00 ? "OK" : "ERROR";
  let responseEventIndex = 0;

  if (payload.length >= 2) {
    // Parse event index from payload byte 1
    const indexByte = payload[1];
    if (indexByte !== undefined) {
      responseEventIndex = indexByte;
    }
  }

  const result: AddEventResponse = {
    status: responseStatus,
    eventIndex: responseEventIndex,
  };

  console.log(
    `  - Event ${responseStatus === "OK" ? "added" : "failed"} at index ${responseEventIndex}`,
  );

  return result;
}
