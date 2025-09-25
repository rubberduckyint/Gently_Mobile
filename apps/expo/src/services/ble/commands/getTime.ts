/**
 * Get Time Command
 * Gets the current time from the device
 */

import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

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

/**
 * Get current time from device
 * Returns both a Date object and individual time components
 */
export async function getTime(serialNumber: string): Promise<TimeResponse> {
  try {
    console.log("\n🕒 Requesting device time...");

    const response = await executeBLECommand(
      {
        command: CommandCode.GET_TIME,
        apiVersion: 1,
      },
      serialNumber,
    );

    if (response.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${response.status}`);
    }

    if (response.payload.length < 8) {
      throw new Error("Invalid time response: payload too short");
    }

    // Parse time from 8-byte payload according to protocol
    // Format: year(BCD), month(BCD), date(BCD), weekday, hour(BCD), minute(BCD), seconds(BCD), reserved
    const payload = response.payload;

    // Convert BCD to decimal
    const bcdToDecimal = (bcd: number): number => {
      return (bcd >> 4) * 10 + (bcd & 0x0f);
    };

    const year = 2000 + bcdToDecimal(payload[0] ?? 0);
    const month = bcdToDecimal(payload[1] ?? 0);
    const day = bcdToDecimal(payload[2] ?? 0);
    const weekDay = payload[3] ?? 0; // 0 = Sunday
    const hour = bcdToDecimal(payload[4] ?? 0);
    const minute = bcdToDecimal(payload[5] ?? 0);
    const seconds = bcdToDecimal(payload[6] ?? 0);

    // Create Date object (month is 0-indexed in JavaScript)
    const date = new Date(year, month - 1, day, hour, minute, seconds);

    const timeInfo: TimeResponse = {
      date,
      year,
      month,
      day,
      weekDay,
      hour,
      minute,
      seconds,
    };

    const weekDayLabel =
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekDay] ?? "Unknown";

    console.log(`   • ISO Time    : ${date.toISOString()}`);
    console.log(`   • Local Time  : ${date.toLocaleString()}`);
    console.log(
      `   • Components : ${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")} (${weekDayLabel}) ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
    );

    return timeInfo;
  } catch (error) {
    console.error("❌ Failed to get device time:", error);
    throw new Error(
      `Failed to get device time: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
