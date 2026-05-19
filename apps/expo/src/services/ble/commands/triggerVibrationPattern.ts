/**
 * Trigger Vibration Pattern (Command 0x43)
 * Triggers a vibration pattern on the bracelet motor
 * Based on BLE Protocol Rev 0.6
 */

import type {
  BLECommandRequest,
  VibrationIntensity,
  VibrationPattern,
} from "~/services/ble/types";
import { CommandCode, ResponseStatus } from "~/services/ble/types";

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

  // 2-byte payload: combined param byte + duration byte. With the 2-byte
  // [version, command] header prepended by constructCommandPacket, the
  // on-wire frame totals 4 bytes; constructCommandPacket pads to the next
  // multiple of 8, giving a single 8-byte TEA block matching firmware.
  // Avoids a trailing all-zero second TEA block that firmware would
  // decrypt as v=0/cmd=0 — same encoding fix landed for audio in
  // commit 82d90b3.
  const payload = new Uint8Array(2).fill(0);
  let offset = 0;

  // Byte #0: Combined vibration param byte. Firmware reads this bitfield
  // LSB-first per app_types.h:107-110 (GCC on ARM-LE packs LSB-first):
  //   bit 0-1: intensity (2 bits, 0=LOW..3=MAXIMUM)
  //   bit 2-7: pattern   (6 bits, 0=QUICK..3=SYMPHONY, room for more)
  // Compose: param = (pattern << 2) | (intensity & 0x03)
  // The reverse ordering (pattern in low bits, intensity in high bits) was
  // the original implementation and the firmware engineer flagged it as the
  // #1 common mistake — produces junk vibration on the bracelet.
  const vibrationByte = ((patternNum & 0x3f) << 2) | (intensityNum & 0x03);
  payload[offset++] = vibrationByte;

  // Byte #1: Total duration in seconds
  payload[offset++] = params.totalDurationSeconds & 0xff;

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
