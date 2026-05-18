/**
 * Trigger Audio Pattern (Command 0x42)
 * Triggers an audio/beep pattern on the bracelet buzzer
 * Based on BLE Protocol Rev 0.6
 */

import type { BLECommandRequest } from "~/services/ble/types";
import { CommandCode, ResponseStatus } from "~/services/ble/types";

export interface TriggerAudioPatternParams {
  onDurationMs: number; // ON duration in milliseconds (UInt16)
  offDurationMs: number; // OFF duration in milliseconds (UInt16)
  totalDurationSeconds: number; // Total duration in seconds (1-60)
}

/**
 * Create a Trigger Audio Pattern command request.
 *
 * @param params - Audio pattern parameters
 * @returns The BLE command request
 */
export function createTriggerAudioPatternRequest(
  params: TriggerAudioPatternParams,
): BLECommandRequest {
  // Validate inputs
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
    `🔧 Creating TRIGGER_AUDIO_PATTERN: on=${params.onDurationMs}ms, off=${params.offDurationMs}ms, total=${params.totalDurationSeconds}s`,
  );

  // 6-byte payload: 5 bytes of params + 1 byte pad. With the 2-byte
  // [version, command] header prepended by constructCommandPacket, the
  // on-wire frame is exactly 8 bytes = one TEA block, matching firmware.
  // A larger payload would 8-byte-align to a second all-zero TEA block;
  // firmware interprets that as v=0/cmd=0 and cancels the audio thread
  // mid-pattern, producing a single short beep instead of the cadence.
  const payload = new Uint8Array(6).fill(0);
  let offset = 0;

  // Bytes #0-1: ON duration in ms (UInt16, little-endian)
  payload[offset++] = params.onDurationMs & 0xff;
  payload[offset++] = (params.onDurationMs >> 8) & 0xff;

  // Bytes #2-3: OFF duration in ms (UInt16, little-endian)
  payload[offset++] = params.offDurationMs & 0xff;
  payload[offset++] = (params.offDurationMs >> 8) & 0xff;

  // Byte #4: Total duration in seconds
  payload[offset++] = params.totalDurationSeconds & 0xff;

  // Byte #5: Pad (already 0-filled)

  return {
    command: CommandCode.TRIGGER_AUDIO_PATTERN,
    apiVersion: 2,
    payload,
  };
}

export interface TriggerAudioPatternResponse {
  status: "OK" | "ERROR";
}

/**
 * Parse the response from a Trigger Audio Pattern command.
 *
 * @param payload - The response payload from the device
 * @param bleStatus - The BLE status code (0x00 = OK, 0x01 = ERROR)
 * @returns The parsed response
 */
export function parseTriggerAudioPatternResponse(
  payload: Uint8Array,
  bleStatus: ResponseStatus = ResponseStatus.OK,
): TriggerAudioPatternResponse {
  console.log(
    `📥 Parsing TRIGGER_AUDIO_PATTERN response: ${bleStatus === ResponseStatus.OK ? "OK" : "ERROR"}`,
  );

  return {
    status: bleStatus === ResponseStatus.OK ? "OK" : "ERROR",
  };
}
