/**
 * Get Device Status Command
 * Gets battery status, active events, and error information
 */

import type { BLECommandRequest } from "~/services/ble/types";
import { CommandCode } from "~/services/ble/types";

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
    apiVersion: 2,
  };
}

/**
 * Parse Get Device Status response (Command 0x0C)
 * Response format: API | Command | Status | Voltage(2 bytes) | Charging+Level | Active Events | Reserved
 *
 * Byte 5 breakdown (protocol uses bit 0 = leftmost = MSB):
 * - Bit 0 (leftmost/MSB/bit7): Charging (1 = ON, 0 = OFF)
 * - Bits 1-7 (rightmost/LSBs/bits6-0): Battery Level (0x00-0x04)
 */
export function parseGetDeviceStatusResponse(
  payload: Uint8Array,
): DeviceStatusResponse {
  if (payload.length < 5) {
    throw new Error("Invalid device status response: payload too short");
  }

  // Bytes 0-1: Battery voltage in mV (little endian)
  const batteryVoltage = (payload[0] ?? 0) | ((payload[1] ?? 0) << 8);

  // Byte 2: Charging status (bit 7/MSB) + Battery level (bits 6-0/LSBs)
  const statusByte = payload[2] ?? 0;
  const chargingStatus = (statusByte & 0x80) !== 0; // Check bit 7 (MSB)
  const batteryLevel = Math.min(statusByte & 0x7f, 4); // Get bits 6-0, cap at 4

  // Byte 3: Number of currently active events
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
