/**
 * Get Device Uptime Command
 * Gets the device uptime in milliseconds since last boot/reset
 */

import type { BLECommandRequest } from "../types";
import { CommandCode } from "../types";

export interface UptimeResponse {
  uptime: number; // milliseconds since boot
  uptimeBytes: Uint8Array; // 8-byte uptime value for key generation
}

export const GET_UPTIME_TIMEOUT_MS = 5000;

export function createGetUptimeRequest(): BLECommandRequest {
  return {
    command: CommandCode.GET_UPTIME,
    apiVersion: 1,
  };
}

export function parseGetUptimeResponse(payload: Uint8Array): UptimeResponse {
  if (payload.length < 8) {
    throw new Error("Invalid uptime response: payload too short");
  }

  const uptimeBytes = payload.slice(0, 8);
  let uptime = 0;

  for (let i = 0; i < 8; i++) {
    uptime += (uptimeBytes[i] ?? 0) * Math.pow(256, i);
  }

  return {
    uptime,
    uptimeBytes,
  };
}
