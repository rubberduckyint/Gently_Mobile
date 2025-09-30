/**
 * Add Event Command
 * Adds a new event/alarm to the device
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
  // Validate inputs
  if (params.eventIndex < 0 || params.eventIndex > 49) {
    throw new Error("Event index must be between 0-49");
  }
  if (params.eventName.length > 10) {
    throw new Error("Event name must be 10 characters or less");
  }
  if (params.cronExpression.length > 42) {
    throw new Error("Cron expression must be 42 characters or less");
  }

  // Create payload according to protocol
  const payload = new Uint8Array(72); // Max size to accommodate all fields
  let offset = 0;

  // Byte #2: Event Index
  payload[offset++] = params.eventIndex;

  // Byte #3: Vibration Pattern (bits 0-5) + Vibration Intensity (bits 6-7)
  payload[offset++] =
    (params.vibrationPattern & 0x3f) |
    ((params.vibrationIntensity & 0x03) << 6);

  // Byte #4: LED Pattern (bits 0-4) + LED Color (bits 5-7)
  payload[offset++] =
    (params.ledPattern & 0x1f) | ((params.ledColor & 0x07) << 5);

  // Byte #5: Severity Level
  payload[offset++] = params.severityLevel;

  // Byte #6: Snooze period
  payload[offset++] = params.snoozePeriod;

  // Byte #7: Snooze timeout
  payload[offset++] = params.snoozeTimeout;

  // Byte #8: Retrigger delay
  payload[offset++] = params.retriggerDelay;

  // Byte #9: Retrigger timeout
  payload[offset++] = params.retriggerTimeout;

  // Bytes #10-20: Event Name (max 10 chars + null terminator)
  const nameBytes = new TextEncoder().encode(params.eventName.substring(0, 10));
  payload.set(nameBytes, offset);
  payload[offset + nameBytes.length] = 0; // null terminator
  offset += 11; // 10 chars + null terminator

  // Bytes #21-63: Cron expression (max 42 chars + null terminator)
  const cronBytes = new TextEncoder().encode(
    params.cronExpression.substring(0, 42),
  );
  payload.set(cronBytes, offset);
  payload[offset + cronBytes.length] = 0; // null terminator
  offset += 43; // 42 chars + null terminator

  // Remaining bytes are reserved (0 padded - already done by Uint8Array constructor)

  const finalPayload = payload.slice(0, offset);
  console.log(`📤 ADD_EVENT Request Created:`);
  console.log(
    `  - Command: 0x${CommandCode.ADD_EVENT.toString(16).padStart(2, "0")}`,
  );
  console.log(`  - Event Index: ${params.eventIndex}`);
  console.log(`  - Event Name: "${params.eventName}"`);
  console.log(`  - Cron Expression: "${params.cronExpression}"`);
  console.log(
    `  - Vibration: Pattern=${params.vibrationPattern}, Intensity=${params.vibrationIntensity}`,
  );
  console.log(
    `  - LED: Pattern=${params.ledPattern}, Color=${params.ledColor}`,
  );
  console.log(`  - Severity: ${params.severityLevel}`);
  console.log(`  - Payload Size: ${finalPayload.length} bytes`);
  console.log(
    `  - Payload Hex: [${Array.from(finalPayload)
      .map((b) => "0x" + b.toString(16).padStart(2, "0"))
      .join(", ")}]`,
  );

  return {
    command: CommandCode.ADD_EVENT,
    apiVersion: 1,
    payload: finalPayload,
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
  console.log(`📥 ADD_EVENT Response Received:`);
  console.log(
    `  - BLE Status: 0x${bleStatus.toString(16).padStart(2, "0")} (${bleStatus === 0 ? "OK" : "ERROR"})`,
  );
  console.log(
    `  - Command Code: 0x${commandCode.toString(16).padStart(2, "0")} (Expected: 0x04)`,
  );
  console.log(`  - Payload Length: ${payload.length} bytes`);
  console.log(
    `  - Payload Hex: [${Array.from(payload)
      .map((b) => "0x" + b.toString(16).padStart(2, "0"))
      .join(", ")}]`,
  );

  // Check if command code matches expected ADD_EVENT
  if (commandCode !== 0x04) {
    console.warn(
      `⚠️ ADD_EVENT Response: Unexpected command code 0x${commandCode.toString(16)} (expected 0x04)`,
    );
    console.warn(
      `  - This may indicate a protocol mismatch or device firmware issue`,
    );
  }

  // Use BLE manager status instead of parsing from payload
  const status = bleStatus === 0x00 ? "OK" : "ERROR";

  // For ADD_EVENT response according to BLE protocol:
  // payload[0]: Event Index (0-49)
  // payload[1-4]: RESERVED (0 padded)
  let eventIndex = 0;
  if (payload.length >= 1) {
    eventIndex = payload[0] ?? 0;
  }

  console.log(`  - Parsed Status: ${status}`);
  console.log(`  - Event Index: ${eventIndex}`);
  if (payload.length > 1) {
    console.log(
      `  - Reserved Bytes: [${Array.from(payload.slice(1))
        .map((b) => "0x" + b.toString(16).padStart(2, "0"))
        .join(", ")}]`,
    );
  }

  return {
    status,
    eventIndex,
  };
}
