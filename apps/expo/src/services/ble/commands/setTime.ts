/**
 * Set Time Command
 * Sets the time on the device
 */

import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

/**
 * Set time on device
 * Uses current time if no date is provided
 */
export async function setTime(
  serialNumber: string,
  date: Date = new Date(),
): Promise<void> {
  try {
    console.log("\n🕒 Setting device time to:", date.toISOString());

    // Prepare time data payload according to protocol
    // Time format: year(BCD), month(BCD), date(BCD), weekday, hour(BCD), minute(BCD), seconds(BCD), reserved
    const year = date.getFullYear() - 2000; // Protocol uses 2000-2099 range
    const month = date.getMonth() + 1; // getMonth() returns 0-11
    const dateNum = date.getDate();
    const weekDay = date.getDay(); // 0 = Sunday
    const hour = date.getHours();
    const minute = date.getMinutes();
    const seconds = date.getSeconds();

    // Convert to BCD format
    const decimalToBcd = (decimal: number): number => {
      return (Math.floor(decimal / 10) << 4) | decimal % 10;
    };

    const yearBCD = decimalToBcd(year);
    const monthBCD = decimalToBcd(month);
    const dateBCD = decimalToBcd(dateNum);
    const hourBCD = decimalToBcd(hour);
    const minuteBCD = decimalToBcd(minute);
    const secondsBCD = decimalToBcd(seconds);

    // Build payload: 7 bytes + 1 reserved byte = 8 bytes
    const payload = new Uint8Array([
      yearBCD,
      monthBCD,
      dateBCD,
      weekDay,
      hourBCD,
      minuteBCD,
      secondsBCD,
      0x00, // Reserved
    ]);

    console.log("📅 Time payload:", {
      date: date.toISOString(),
      payload: Array.from(payload)
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(" "),
      decoded: {
        year: `20${year.toString().padStart(2, "0")}`,
        month: month.toString().padStart(2, "0"),
        day: dateNum.toString().padStart(2, "0"),
        weekDay:
          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekDay] ??
          "Unknown",
        time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
      },
    });

    const response = await executeBLECommand(
      {
        command: CommandCode.SET_TIME,
        payload: payload,
        apiVersion: 1,
      },
      serialNumber,
    );

    if (response.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${response.status}`);
    }

    console.log("✅ Successfully set device time");
  } catch (error) {
    console.error("❌ Failed to set device time:", error);
    throw new Error(
      `Failed to set device time: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
