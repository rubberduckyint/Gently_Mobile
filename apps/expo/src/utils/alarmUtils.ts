/**
 * Alarm utilities for calculating next occurrence, formatting times, etc.
 */

import { addDays, format, isAfter, isBefore } from "date-fns";

/**
 * Helper function to validate and log invalid dates
 */
function validateDate(date: Date, context: string): boolean {
  if (isNaN(date.getTime())) {
    console.warn(`Invalid date in ${context}:`, date);
    return false;
  }
  return true;
}

export interface AlarmScheduleInfo {
  nextOccurrence: Date | null;
  isOverdue: boolean;
  timeUntilNext: string;
  formattedNextTime: string;
  status: "active" | "inactive" | "overdue" | "completed";
}

/**
 * Calculate the next occurrence of an alarm based on its cron expression and date range
 */
export function calculateNextAlarmOccurrence(alarm: {
  isActive: boolean;
  startDate: Date;
  endDate: Date | null;
  repeat: boolean;
  cronExpression: string;
}): AlarmScheduleInfo {
  const now = new Date();

  // Validate start date
  if (
    !validateDate(alarm.startDate, "calculateNextAlarmOccurrence startDate")
  ) {
    return {
      nextOccurrence: null,
      isOverdue: false,
      timeUntilNext: "Invalid date",
      formattedNextTime: "Invalid date",
      status: "inactive",
    };
  }

  if (!alarm.isActive) {
    return {
      nextOccurrence: null,
      isOverdue: false,
      timeUntilNext: "Inactive",
      formattedNextTime: "Inactive",
      status: "inactive",
    };
  }

  // For non-repeating alarms
  if (!alarm.repeat) {
    const alarmTime = alarm.startDate;

    try {
      if (isAfter(now, alarmTime)) {
        return {
          nextOccurrence: null,
          isOverdue: true,
          timeUntilNext: "Overdue",
          formattedNextTime: formatAlarmTime(alarmTime, true),
          status: "overdue",
        };
      }

      return {
        nextOccurrence: alarmTime,
        isOverdue: false,
        timeUntilNext: formatTimeUntil(alarmTime),
        formattedNextTime: formatAlarmTime(alarmTime, true),
        status: "active",
      };
    } catch (error) {
      console.warn("Error processing non-repeating alarm:", error, alarmTime);
      return {
        nextOccurrence: null,
        isOverdue: false,
        timeUntilNext: "Invalid date",
        formattedNextTime: "Invalid date",
        status: "inactive",
      };
    }
  }

  // For repeating alarms, we need to parse the cron expression
  // This is a simplified implementation - in a real app you'd use a cron parser library
  try {
    const nextOccurrence = calculateNextCronOccurrence(
      alarm.cronExpression,
      alarm.startDate,
      alarm.endDate,
    );

    if (!nextOccurrence || isNaN(nextOccurrence.getTime())) {
      return {
        nextOccurrence: null,
        isOverdue: false,
        timeUntilNext: "Completed",
        formattedNextTime: "No future occurrences",
        status: "completed",
      };
    }

    return {
      nextOccurrence,
      isOverdue: false,
      timeUntilNext: formatTimeUntil(nextOccurrence),
      formattedNextTime: formatAlarmTime(nextOccurrence, true),
      status: "active",
    };
  } catch (error) {
    console.warn(
      "Error processing repeating alarm:",
      error,
      alarm.cronExpression,
    );
    return {
      nextOccurrence: null,
      isOverdue: false,
      timeUntilNext: "Invalid schedule",
      formattedNextTime: "Invalid schedule",
      status: "inactive",
    };
  }
}

/**
 * Calculate next occurrence based on cron expression
 * This is a simplified implementation for common patterns
 */
function calculateNextCronOccurrence(
  cronExpression: string,
  startDate: Date,
  endDate: Date | null,
): Date | null {
  // Validate input dates
  if (isNaN(startDate.getTime())) {
    console.warn(
      "Invalid start date in calculateNextCronOccurrence:",
      startDate,
    );
    return null;
  }

  if (endDate && isNaN(endDate.getTime())) {
    console.warn("Invalid end date in calculateNextCronOccurrence:", endDate);
    endDate = null; // Treat as no end date
  }

  const now = new Date();

  // Parse the cron expression (simplified)
  // Format: "minute hour day month dayOfWeek"
  const parts = cronExpression.split(" ");
  if (parts.length !== 5) {
    console.warn("Invalid cron expression:", cronExpression);
    return null;
  }

  const [minute, hour, day, month, dayOfWeek] = parts;

  // For daily alarms (most common case)
  if (day === "*" && month === "*" && dayOfWeek === "*") {
    const todayAlarm = new Date();

    // Safely parse hour and minute with validation
    const hourNum = hour && hour !== "*" ? parseInt(hour, 10) : 0;
    const minuteNum = minute && minute !== "*" ? parseInt(minute, 10) : 0;

    // Validate parsed hour and minute
    if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) {
      console.warn("Invalid hour in cron expression:", hour, cronExpression);
      return null;
    }
    if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
      console.warn(
        "Invalid minute in cron expression:",
        minute,
        cronExpression,
      );
      return null;
    }

    todayAlarm.setHours(hourNum, minuteNum, 0, 0);

    // Validate the constructed date
    if (isNaN(todayAlarm.getTime())) {
      console.warn("Invalid constructed date:", todayAlarm, hourNum, minuteNum);
      return null;
    }

    try {
      if (isAfter(todayAlarm, now) && isAfter(todayAlarm, startDate)) {
        if (!endDate || isBefore(todayAlarm, endDate)) {
          return todayAlarm;
        }
      }

      // Try tomorrow
      const tomorrowAlarm = addDays(todayAlarm, 1);
      if (isNaN(tomorrowAlarm.getTime())) {
        console.warn("Invalid tomorrow date:", tomorrowAlarm);
        return null;
      }
      if (!endDate || isBefore(tomorrowAlarm, endDate)) {
        return tomorrowAlarm;
      }
    } catch (error) {
      console.warn("Error calculating daily alarm occurrence:", error);
      return null;
    }
  }

  // For weekly alarms
  if (day === "*" && month === "*" && dayOfWeek !== "*") {
    try {
      // Implementation for weekly recurrence would go here
      // For now, return a simple next day calculation
      const nextWeek = addDays(startDate, 7);
      if (isNaN(nextWeek.getTime())) {
        console.warn("Invalid next week date:", nextWeek);
        return null;
      }
      if (!endDate || isBefore(nextWeek, endDate)) {
        return nextWeek;
      }
    } catch (error) {
      console.warn("Error calculating weekly alarm occurrence:", error);
      return null;
    }
  }

  return null;
}

/**
 * Format time until next occurrence in a human-readable way
 */
function formatTimeUntil(targetDate: Date): string {
  // Validate the target date
  if (isNaN(targetDate.getTime())) {
    console.warn("Invalid target date in formatTimeUntil:", targetDate);
    return "Invalid time";
  }

  const now = new Date();
  let diffMs: number;

  try {
    diffMs = targetDate.getTime() - now.getTime();
  } catch (error) {
    console.warn("Error calculating time difference:", error);
    return "Invalid time";
  }

  if (diffMs <= 0) {
    return "Now";
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Get status color for alarm based on its state
 */
export function getAlarmStatusColor(scheduleInfo: AlarmScheduleInfo): string {
  switch (scheduleInfo.status) {
    case "active":
      return "#10b981"; // green
    case "inactive":
      return "#6b7280"; // gray
    case "overdue":
      return "#ef4444"; // red
    case "completed":
      return "#6b7280"; // gray
    default:
      return "#6b7280";
  }
}

/**
 * Format alarm time for display
 */
export function formatAlarmTime(date: Date, includeDate = true): string {
  // Validate the date before formatting
  if (isNaN(date.getTime())) {
    console.warn("Invalid date in formatAlarmTime:", date);
    return "Invalid date";
  }

  try {
    if (includeDate) {
      return format(date, "MMM dd, h:mm a");
    }
    return format(date, "h:mm a");
  } catch (error) {
    console.warn("Error formatting alarm time:", error, date);
    return "Invalid date";
  }
}
