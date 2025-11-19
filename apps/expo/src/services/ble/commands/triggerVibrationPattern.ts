/**
 * Trigger Vibration Pattern (Command 0x43)
 * Triggers a vibration pattern on the bracelet motor
 * Based on BLE Protocol Rev 0.6
 */

import type {
  BLECommandRequest,
  VibrationIntensity,
  VibrationPattern,
} from "../types";
import { CommandCode, ResponseStatus } from "../types";

export interface TriggerVibrationPatternParams {
  vibrationPattern: VibrationPattern; // 0=Quick, 1=Heartbeat, 2=Rapid, 3=Symphony
  vibrationIntensity: VibrationIntensity; // 0=LOW, 1=MEDIUM, 2=HIGH, 3=MAXIMUM
  totalDurationSeconds: number; // Total duration in seconds (1-60)
}

/**
 * Create a Trigger Vibration Pattern command request.
 *
 * @param params - Vibration pattern parameters
 * @returns The BLE command request
 */
export function createTriggerVibrationPatternRequest(
  params: TriggerVibrationPatternParams,
): BLECommandRequest {
  // Validate inputs
  const patternNum = Number(params.vibrationPattern);
  const intensityNum = Number(params.vibrationIntensity);

  if (patternNum < 0 || patternNum > 63) {
    throw new Error("Vibration pattern must be between 0 and 63");
  }
  if (intensityNum < 0 || intensityNum > 3) {
    throw new Error("Vibration intensity must be between 0 and 3");
  }
  if (params.totalDurationSeconds < 1 || params.totalDurationSeconds > 60) {
    throw new Error("Total duration must be between 1 and 60 seconds");
  }

  console.log(
    `🔧 Creating TRIGGER_VIBRATION_PATTERN: pattern=${patternNum}, intensity=${intensityNum}, total=${params.totalDurationSeconds}s`,
  );

  // 8-byte aligned payload
  const payload = new Uint8Array(8).fill(0);
  let offset = 0;

  // Byte #0: Combined vibration byte
  // Bits 0-5: Vibration Pattern (0-63)
  // Bits 6-7: Vibration Intensity (0-3)
  const vibrationByte = (patternNum & 0x3f) | ((intensityNum & 0x03) << 6);
  payload[offset++] = vibrationByte;

  // Byte #1: Total duration in seconds
  payload[offset++] = params.totalDurationSeconds & 0xff;

  // Bytes #2-7: Reserved (already 0-filled)

  return {
    command: CommandCode.TRIGGER_VIBRATION_PATTERN,
    apiVersion: 2,
    payload,
  };
}

export interface TriggerVibrationPatternResponse {
  status: "OK" | "ERROR";
}

/**
 * Parse the response from a Trigger Vibration Pattern command.
 *
 * @param payload - The response payload from the device
 * @param bleStatus - The BLE status code (0x00 = OK, 0x01 = ERROR)
 * @returns The parsed response
 */
export function parseTriggerVibrationPatternResponse(
  payload: Uint8Array,
  bleStatus: ResponseStatus = ResponseStatus.OK,
): TriggerVibrationPatternResponse {
  console.log(
    `📥 Parsing TRIGGER_VIBRATION_PATTERN response: ${bleStatus === ResponseStatus.OK ? "OK" : "ERROR"}`,
  );

  return {
    status: bleStatus === ResponseStatus.OK ? "OK" : "ERROR",
  };
}
