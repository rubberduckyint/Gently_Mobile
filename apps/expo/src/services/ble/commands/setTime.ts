/**
 * Set Time Command
 * Builds payloads to update the bracelet clock and parses acknowledgements.
 */

import type { BLECommandRequest } from "~/services/ble/types";
import { CommandCode } from "~/services/ble/types";

export function createSetTimeRequest(
  date: Date = new Date(),
): BLECommandRequest {
  const year = date.getFullYear() - 2000;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekDay = date.getDay();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const seconds = date.getSeconds();

  const decimalToBcd = (value: number): number => {
    return (Math.floor(value / 10) << 4) | (value % 10);
  };

  const payload = new Uint8Array([
    decimalToBcd(year),
    decimalToBcd(month),
    decimalToBcd(day),
    weekDay,
    decimalToBcd(hour),
    decimalToBcd(minute),
    decimalToBcd(seconds),
    0x00,
  ]);

  return {
    command: CommandCode.SET_TIME,
    apiVersion: 2,
    payload,
  };
}

export function parseSetTimeResponse(_payload: Uint8Array): void {
  // No additional data is returned for SET_TIME acknowledgements.
}
