/**
 * Get Device Info Command
 * Gets hardware and firmware version information
 */

import type { BLECommandRequest } from "../types";
import { CommandCode } from "../types";

export interface DeviceInfoResponse {
  hardwareVersion: number;
  firmwareVersionMajor: number;
  firmwareVersionMinor: number;
  firmwareBuildNumber: number;
}

export const GET_DEVICE_INFO_TIMEOUT_MS = 5000;

export function createGetDeviceInfoRequest(): BLECommandRequest {
  return {
    command: CommandCode.GET_DEVICE_INFO,
    apiVersion: 1,
  };
}

export function parseGetDeviceInfoResponse(
  payload: Uint8Array,
): DeviceInfoResponse {
  if (payload.length < 5) {
    throw new Error("Invalid device info response: payload too short");
  }

  let firmwareBuildNumber = payload[3] ?? 0;

  if (payload.length >= 7) {
    firmwareBuildNumber =
      (payload[3] ?? 0) |
      ((payload[4] ?? 0) << 8) |
      ((payload[5] ?? 0) << 16) |
      ((payload[6] ?? 0) << 24);
  }

  return {
    hardwareVersion: payload[0] ?? 0,
    firmwareVersionMajor: payload[1] ?? 0,
    firmwareVersionMinor: payload[2] ?? 0,
    firmwareBuildNumber,
  };
}
