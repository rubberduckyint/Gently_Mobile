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
   */
  static parseNotification(payload: Uint8Array): TimeData {
    if (payload.length < 7) {
      throw new Error(
        `Invalid time notification: payload too short (${payload.length} bytes, expected at least 7)`,
      );
    }

    const hour = payload[0] ?? 0;
    const minute = payload[1] ?? 0;
    const second = payload[2] ?? 0;
    const year = 2000 + (payload[3] ?? 0); // Year offset from 2000
    const month = payload[4] ?? 0;
    const date = payload[5] ?? 0;
    const weekDay = payload[6] ?? 0;

    return {
      hour,
      minute,
      second,
      year,
      month,
      date,
      weekDay,
      timestamp: new Date(),
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
