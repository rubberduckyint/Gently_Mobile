/**
 * Time Notification Command
 *
 * This is an async notification sent by the device to report the current time.
 * It does not require a request from the app - it's automatically sent by the device.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { BLECommand } from "./base";

export interface TimeData {
  hour: number; // Hour (0-23)
  minute: number; // Minute (0-59)
  second: number; // Second (0-59)
  year: number; // Full year (e.g., 2025)
  month: number; // Month (1-12)
  date: number; // Day of month (1-31)
  weekDay: number; // Day of week (0=Sunday, 6=Saturday)
  timestamp: Date; // When the notification was received
}

export class TimeNotifyCommand extends BLECommand<TimeData> {
  readonly metadata: BLECommandMetadata = {
    id: "time-notify",
    name: "Time Notification",
    description: "Async notification from device about current time",
    category: "notification",
    version: "1.0.0",
    requiresConnection: false, // This is a notification, not a request
    estimatedDuration: 0,
    tags: ["time", "notification", "async"],
  };

  /**
   * Parse the notification payload for time data
   * According to BLE protocol:
   * Byte 0: Year (BCD format, 0x00-0x99 for 2000-2099)
   * Byte 1: Month (BCD format, 0x01-0x12)
   * Byte 2: Date (BCD format, 0x01-0x31)
   * Byte 3: Week day (0-6, Sunday=0x00)
   * Byte 4: Hour (BCD format, 0x00-0x23)
   * Byte 5: Minute (BCD format, 0x00-0x59)
   * Byte 6: Seconds (BCD format, 0x00-0x59)
   */
  static parseNotification(payload: Uint8Array): TimeData {
    if (payload.length < 7) {
      throw new Error(
        `Invalid time notification: payload too short (${payload.length} bytes, expected at least 7)`,
      );
    }

    console.log(
      "[TimeNotifyCommand] Raw payload:",
      Array.from(payload)
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(" "),
    );

    // Helper function to decode BCD (Binary Coded Decimal)
    const decodeBCD = (bcdValue: number): number => {
      return ((bcdValue >> 4) & 0x0f) * 10 + (bcdValue & 0x0f);
    };

    const year = 2000 + decodeBCD(payload[0] ?? 0); // BCD year offset from 2000
    const month = decodeBCD(payload[1] ?? 0); // BCD month (1-12)
    const date = decodeBCD(payload[2] ?? 0); // BCD date (1-31)
    const weekDay = payload[3] ?? 0; // Week day (0-6, not BCD)
    const hour = decodeBCD(payload[4] ?? 0); // BCD hour (0-23)
    const minute = decodeBCD(payload[5] ?? 0); // BCD minute (0-59)
    const second = decodeBCD(payload[6] ?? 0); // BCD second (0-59)

    console.log("[TimeNotifyCommand] Parsed time:", {
      year,
      month,
      date,
      weekDay,
      hour,
      minute,
      second,
    });

    // Create a proper Date object from the parsed values
    // Note: JavaScript Date constructor expects month to be 0-based, but protocol uses 1-based
    const deviceDate = new Date(year, month - 1, date, hour, minute, second);

    console.log("[TimeNotifyCommand] Device date:", deviceDate.toString());

    return {
      hour,
      minute,
      second,
      year,
      month,
      date,
      weekDay,
      timestamp: deviceDate,
    };
  }

  /**
   * Get weekday name from weekday number
   */
  static getWeekDayName(weekDay: number): string {
    const weekDayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    return weekDayNames[weekDay] ?? `Day${weekDay}`;
  }

  /**
   * Format time as HH:MM:SS
   */
  static formatTime(data: TimeData): string {
    return `${data.hour.toString().padStart(2, "0")}:${data.minute.toString().padStart(2, "0")}:${data.second.toString().padStart(2, "0")}`;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  static formatDate(data: TimeData): string {
    return `${data.year}-${data.month.toString().padStart(2, "0")}-${data.date.toString().padStart(2, "0")}`;
  }

  /**
   * Log human-readable details about the time notification
   */
  static logNotificationDetails(data: TimeData): void {
    console.log("🕐 TIME NOTIFICATION:");
    console.log(`   • Current Time: ${this.formatTime(data)}`);
    console.log(
      `   • Current Date: ${this.formatDate(data)} (${this.getWeekDayName(data.weekDay)})`,
    );
    console.log(`   • Received: ${data.timestamp.toISOString()}`);

    // Check if device time seems reasonable
    const now = new Date();
    const deviceDate = new Date(
      data.year,
      data.month - 1,
      data.date,
      data.hour,
      data.minute,
      data.second,
    );
    const timeDiff = Math.abs(now.getTime() - deviceDate.getTime());
    const timeDiffMinutes = Math.floor(timeDiff / (1000 * 60));

    if (timeDiffMinutes > 5) {
      console.log(
        `   ⚠️  Device time differs from system time by ${timeDiffMinutes} minutes`,
      );
    }
  }

  protected executeImpl(
    _context: BLECommandExecutionContext,
  ): Promise<TimeData> {
    throw new Error(
      "TimeNotifyCommand cannot be executed - it's a notification handler only",
    );
  }
}
