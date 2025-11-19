/**
 * Trigger LED Pattern (Command 0x41)
 * Triggers an LED pattern on the bracelet
 * Based on BLE Protocol Rev 0.6
 */

import type { BLECommandRequest } from "../types";
import { CommandCode, ResponseStatus } from "../types";

export interface TriggerLedPatternParams {
  ledColor: number; // 0=OFF, 1=Blue, 2=Green, 3=Cyan, 4=Red, 5=Yellow, 6=Magenta, 7=White
  onDurationMs: number; // ON duration in milliseconds (UInt16)
  offDurationMs: number; // OFF duration in milliseconds (UInt16)
  totalDurationSeconds: number; // Total duration in seconds (1-60)
}

/**
 * Create a Trigger LED Pattern command request.
 *
 * @param params - LED pattern parameters
 * @returns The BLE command request
 */
export function createTriggerLedPatternRequest(
  params: TriggerLedPatternParams,
): BLECommandRequest {
  // Validate inputs
  if (params.ledColor < 0 || params.ledColor > 7) {
    throw new Error("LED color must be between 0 and 7");
  }
  if (params.onDurationMs < 0 || params.onDurationMs > 65535) {
    throw new Error("ON duration must be between 0 and 65535 ms");
  }
  if (params.offDurationMs < 0 || params.offDurationMs > 65535) {
    throw new Error("OFF duration must be between 0 and 65535 ms");
  }
  if (params.totalDurationSeconds < 1 || params.totalDurationSeconds > 60) {
    throw new Error("Total duration must be between 1 and 60 seconds");
  }
  if (
    params.onDurationMs + params.offDurationMs >
    params.totalDurationSeconds * 1000
  ) {
    throw new Error("ON + OFF duration cannot exceed total duration");
  }

  console.log(
    `🔧 Creating TRIGGER_LED_PATTERN: color=${params.ledColor}, on=${params.onDurationMs}ms, off=${params.offDurationMs}ms, total=${params.totalDurationSeconds}s`,
  );

  // 8-byte aligned payload
  const payload = new Uint8Array(8).fill(0);
  let offset = 0;

  // Byte #0: LED Color
  payload[offset++] = params.ledColor & 0xff;

  // Bytes #1-2: ON duration in ms (UInt16, little-endian)
  payload[offset++] = params.onDurationMs & 0xff;
  payload[offset++] = (params.onDurationMs >> 8) & 0xff;

  // Bytes #3-4: OFF duration in ms (UInt16, little-endian)
  payload[offset++] = params.offDurationMs & 0xff;
  payload[offset++] = (params.offDurationMs >> 8) & 0xff;

  // Byte #5: Total duration in seconds
  payload[offset++] = params.totalDurationSeconds & 0xff;

  // Bytes #6-7: Reserved (already 0-filled)

  return {
    command: CommandCode.TRIGGER_LED_PATTERN,
    apiVersion: 2,
    payload,
  };
}

export interface TriggerLedPatternResponse {
  status: "OK" | "ERROR";
}

/**
 * Parse the response from a Trigger LED Pattern command.
 *
 * @param payload - The response payload from the device
 * @param bleStatus - The BLE status code (0x00 = OK, 0x01 = ERROR)
 * @returns The parsed response
 */
export function parseTriggerLedPatternResponse(
  payload: Uint8Array,
  bleStatus: ResponseStatus = ResponseStatus.OK,
): TriggerLedPatternResponse {
  console.log(
    `📥 Parsing TRIGGER_LED_PATTERN response: ${bleStatus === ResponseStatus.OK ? "OK" : "ERROR"}`,
  );

  return {
    status: bleStatus === ResponseStatus.OK ? "OK" : "ERROR",
  };
}
