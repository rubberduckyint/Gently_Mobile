/**
 * Get Device Status Command
 * Gets battery status, active events, and error information
 */

import type { BLECommandRequest } from "../types";
import { CommandCode } from "../types";

export interface DeviceStatusResponse {
  batteryVoltage: number; // in mV
  batteryLevel: number; // 0-4 scale (CRITICAL, LOW, MEDIUM, GOOD, FULL)
  chargingStatus: boolean;
  activeEventsCount: number;
  errorCode: number;
  rawPayload: Uint8Array; // For debugging
}

export function createGetDeviceStatusRequest(): BLECommandRequest {
  return {
    command: CommandCode.GET_DEVICE_STATUS,
    apiVersion: 1,
  };
}

export function parseGetDeviceStatusResponse(
  payload: Uint8Array,
): DeviceStatusResponse {
  if (payload.length < 5) {
    throw new Error("Invalid device status response: payload too short");
  }

  const batteryVoltage = (payload[0] ?? 0) | ((payload[1] ?? 0) << 8);
  const statusByte = payload[2] ?? 0;
  const chargingStatus = (statusByte & 0x01) === 0x01;
  const batteryLevelRaw = (statusByte >> 1) & 0x7f;
  const batteryLevel = Math.min(batteryLevelRaw, 4);
  const activeEventsCount = payload[3] ?? 0;

  let errorCode = 0;
  if (payload.length >= 7) {
    errorCode = (payload[5] ?? 0) | ((payload[6] ?? 0) << 8);
  } else if (payload.length === 6) {
    errorCode = payload[5] ?? 0;
  }

  return {
    batteryVoltage,
    batteryLevel,
    chargingStatus,
    activeEventsCount,
    errorCode,
    rawPayload: payload,
  };
}
