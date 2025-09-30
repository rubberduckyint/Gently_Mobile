/**
 * Get Time Command
 * Gets the current time from the device
 */

import type { BLECommandRequest } from "../types";
import { CommandCode } from "../types";

export interface TimeResponse {
  date: Date;
  year: number;
  month: number;
  day: number;
  weekDay: number;
  hour: number;
  minute: number;
  seconds: number;
}

export function createGetTimeRequest(): BLECommandRequest {
  return {
    command: CommandCode.GET_TIME,
    apiVersion: 1,
  };
}

export function parseGetTimeResponse(payload: Uint8Array): TimeResponse {
  if (payload.length < 8) {
    throw new Error("Invalid time response: payload too short");
  }

  const bcdToDecimal = (bcd: number): number => {
    return (bcd >> 4) * 10 + (bcd & 0x0f);
  };

  const year = 2000 + bcdToDecimal(payload[0] ?? 0);
  const month = bcdToDecimal(payload[1] ?? 0);
  const day = bcdToDecimal(payload[2] ?? 0);
  const weekDay = payload[3] ?? 0;
  const hour = bcdToDecimal(payload[4] ?? 0);
  const minute = bcdToDecimal(payload[5] ?? 0);
  const seconds = bcdToDecimal(payload[6] ?? 0);

  const date = new Date(year, month - 1, day, hour, minute, seconds);

  return {
    date,
    year,
    month,
    day,
    weekDay,
    hour,
    minute,
    seconds,
  };
}
