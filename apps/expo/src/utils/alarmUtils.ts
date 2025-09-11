/**
 * Alarm utilities for calculating next occurrence, formatting times, etc.
 */

import { addDays, format, isAfter, isBefore } from "date-fns";

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

    if (isAfter(now, alarmTime)) {
      return {
        nextOccurrence: null,
        isOverdue: true,
        timeUntilNext: "Overdue",
        formattedNextTime: format(alarmTime, "MMM dd, yyyy h:mm a"),
        status: "overdue",
      };
    }

    return {
      nextOccurrence: alarmTime,
      isOverdue: false,
      timeUntilNext: formatTimeUntil(alarmTime),
      formattedNextTime: format(alarmTime, "MMM dd, yyyy h:mm a"),
      status: "active",
    };
  }

  // For repeating alarms, we need to parse the cron expression
  // This is a simplified implementation - in a real app you'd use a cron parser library
  const nextOccurrence = calculateNextCronOccurrence(
    alarm.cronExpression,
    alarm.startDate,
    alarm.endDate,
  );

  if (!nextOccurrence) {
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
    formattedNextTime: format(nextOccurrence, "MMM dd, yyyy h:mm a"),
    status: "active",
  };
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

    // Safely parse hour and minute with defaults
    const hourNum = hour ? parseInt(hour, 10) : 0;
    const minuteNum = minute ? parseInt(minute, 10) : 0;

    todayAlarm.setHours(hourNum, minuteNum, 0, 0);

    if (isAfter(todayAlarm, now) && isAfter(todayAlarm, startDate)) {
      if (!endDate || isBefore(todayAlarm, endDate)) {
        return todayAlarm;
      }
    }

    // Try tomorrow
    const tomorrowAlarm = addDays(todayAlarm, 1);
    if (!endDate || isBefore(tomorrowAlarm, endDate)) {
      return tomorrowAlarm;
    }
  }

  // For weekly alarms
  if (day === "*" && month === "*" && dayOfWeek !== "*") {
    // Implementation for weekly recurrence would go here
    // For now, return a simple next day calculation
    const nextWeek = addDays(startDate, 7);
    if (!endDate || isBefore(nextWeek, endDate)) {
      return nextWeek;
    }
  }

  return null;
}

/**
 * Format time until next occurrence in a human-readable way
 */
function formatTimeUntil(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();

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
  if (includeDate) {
    return format(date, "MMM dd, h:mm a");
  }
  return format(date, "h:mm a");
}
