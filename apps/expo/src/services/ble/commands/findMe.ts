/**
 * Find Me Command
 * Triggers the "Find Me" function on the device (LED, vibration, etc.)
 */

import type { BLECommandRequest } from "~/services/ble/types";
import { CommandCode } from "~/services/ble/types";

export const DEFAULT_FIND_ME_PATTERN = 0x02;

export function createFindMeRequest(
  audioPattern: number = DEFAULT_FIND_ME_PATTERN,
): BLECommandRequest {
  if (
    !Number.isInteger(audioPattern) ||
    audioPattern < 0 ||
    audioPattern > 0xff
  ) {
    throw new Error("Audio pattern must be an integer between 0 and 255");
  }

  return {
    command: CommandCode.FIND_ME,
    apiVersion: 2,
    payload: new Uint8Array([audioPattern & 0xff]),
  };
}

export function parseFindMeResponse(_payload: Uint8Array): void {
  // FIND_ME responses do not include structured payload data.
}
