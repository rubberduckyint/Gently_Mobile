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

  // For minute-based alarms (e.g., "*/45 * * * *" for every 45 minutes)
  if (minute && minute.startsWith("*/") && hour === "*" && day === "*" && month === "*" && dayOfWeek === "*") {
    try {
      const minuteInterval = parseInt(minute.substring(2), 10);

      // Validate interval
      if (isNaN(minuteInterval) || minuteInterval <= 0 || minuteInterval > 59) {
        console.warn("Invalid minute interval in cron expression:", minute);
        return null;
      }

      // Start from current time
      const checkDate = new Date();
      const currentMinutes = checkDate.getHours() * 60 + checkDate.getMinutes();
      
      // Calculate minutes since midnight
      const nextIntervalMinutes = Math.ceil(currentMinutes / minuteInterval) * minuteInterval;
      
      // Convert back to hours and minutes
      const nextHour = Math.floor(nextIntervalMinutes / 60);
      const nextMinute = nextIntervalMinutes % 60;
      
      // Handle day overflow
      if (nextHour >= 24) {
        const daysToAdd = Math.floor(nextHour / 24);
        const adjustedHour = nextHour % 24;
        checkDate.setHours(adjustedHour, nextMinute, 0, 0);
        const result = addDays(checkDate, daysToAdd);
        
        // Validate the constructed date
        if (isNaN(result.getTime())) {
          console.warn("Invalid constructed minute-based alarm date:", result);
          return null;
        }
        
        // Respect start date
        if (isBefore(result, startDate)) {
          // Calculate next occurrence from startDate
          const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
          const nextFromStart = Math.ceil(startMinutes / minuteInterval) * minuteInterval;
          const hourFromStart = Math.floor(nextFromStart / 60);
          const minFromStart = nextFromStart % 60;
          
          const fromStartDate = new Date(startDate);
          fromStartDate.setHours(hourFromStart, minFromStart, 0, 0);
          
          if (hourFromStart >= 24) {
            const daysFromStart = Math.floor(hourFromStart / 24);
            fromStartDate.setHours(hourFromStart % 24, minFromStart, 0, 0);
            return addDays(fromStartDate, daysFromStart);
          }
          
          return fromStartDate;
        }
        
        // Check if within end date range
        if (!endDate || isBefore(result, endDate)) {
          return result;
        }
      } else {
        checkDate.setHours(nextHour, nextMinute, 0, 0);
        
        // Validate the constructed date
        if (isNaN(checkDate.getTime())) {
          console.warn("Invalid constructed minute-based alarm date:", checkDate);
          return null;
        }
        
        // Respect start date
        if (isBefore(checkDate, startDate)) {
          return startDate;
        }
        
        // Check if within end date range
        if (!endDate || isBefore(checkDate, endDate)) {
          return checkDate;
        }
      }

      return null;
    } catch (error) {
      console.warn("Error calculating minute-based alarm occurrence:", error);
      return null;
    }
  }

  // For hourly alarms (e.g., "0 */12 * * *" for every 12 hours)
  if (hour && hour.startsWith("*/") && day === "*" && month === "*" && dayOfWeek === "*") {
    try {
      const hourInterval = parseInt(hour.substring(2), 10);
      const minuteNum = minute && minute !== "*" ? parseInt(minute, 10) : 0;

      // Validate interval and minute
      if (isNaN(hourInterval) || hourInterval <= 0 || hourInterval > 24) {
        console.warn("Invalid hour interval in cron expression:", hour);
        return null;
      }
      if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
        console.warn("Invalid minute in cron expression:", minute);
        return null;
      }

      // Start from current time
      let checkDate = new Date();
      
      // Round up to the next interval
      const currentHour = checkDate.getHours();
      const currentMinute = checkDate.getMinutes();
      
      // Calculate the next occurrence based on the interval
      // For example, if interval is 12 and current hour is 10:
      // Next occurrences would be at 12:00, 0:00, 12:00, etc.
      let nextHour = Math.ceil(currentHour / hourInterval) * hourInterval;
      
      // If we're past the minute mark in the current interval, move to next interval
      if (nextHour === currentHour && currentMinute >= minuteNum) {
        nextHour += hourInterval;
      }
      
      // Handle day overflow
      let daysToAdd = 0;
      while (nextHour >= 24) {
        nextHour -= 24;
        daysToAdd++;
      }
      
      checkDate.setHours(nextHour, minuteNum, 0, 0);
      if (daysToAdd > 0) {
        checkDate = addDays(checkDate, daysToAdd);
      }

      // Validate the constructed date
      if (isNaN(checkDate.getTime())) {
        console.warn("Invalid constructed hourly alarm date:", checkDate);
        return null;
      }

      // Respect start date - if checkDate is before startDate, use startDate as base
      if (isBefore(checkDate, startDate)) {
        checkDate = new Date(startDate);
        const startHour = checkDate.getHours();
        
        // Find next interval from start date
        nextHour = Math.ceil(startHour / hourInterval) * hourInterval;
        if (nextHour === startHour && checkDate.getMinutes() >= minuteNum) {
          nextHour += hourInterval;
        }
        
        daysToAdd = 0;
        while (nextHour >= 24) {
          nextHour -= 24;
          daysToAdd++;
        }
        
        checkDate.setHours(nextHour, minuteNum, 0, 0);
        if (daysToAdd > 0) {
          checkDate = addDays(checkDate, daysToAdd);
        }
      }

      // Check if within end date range
      if (!endDate || isBefore(checkDate, endDate)) {
        return checkDate;
      }

      return null;
    } catch (error) {
      console.warn("Error calculating hourly alarm occurrence:", error);
      return null;
    }
  }

  // For day interval alarms (e.g., "0 12 */3 * *" for every 3 days at 12:00)
  if (day && day.startsWith("*/") && month === "*" && dayOfWeek === "*") {
    try {
      const dayInterval = parseInt(day.substring(2), 10);
      const hourNum = hour && hour !== "*" ? parseInt(hour, 10) : 0;
      const minuteNum = minute && minute !== "*" ? parseInt(minute, 10) : 0;

      // Validate interval, hour, and minute
      if (isNaN(dayInterval) || dayInterval <= 0 || dayInterval > 31) {
        console.warn("Invalid day interval in cron expression:", day);
        return null;
      }
      if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) {
        console.warn("Invalid hour in cron expression:", hour);
        return null;
      }
      if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
        console.warn("Invalid minute in cron expression:", minute);
        return null;
      }

      // Calculate days since a reference point (using startDate as reference)
      const referenceDate = new Date(startDate);
      referenceDate.setHours(hourNum, minuteNum, 0, 0);
      
      // If the reference time today hasn't passed yet and it's after or equal to startDate, use it
      const todayOccurrence = new Date();
      todayOccurrence.setHours(hourNum, minuteNum, 0, 0);
      
      if (isAfter(todayOccurrence, now) && !isBefore(todayOccurrence, startDate)) {
        // Check if today is on the interval from startDate
        const daysDiff = Math.floor((todayOccurrence.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff % dayInterval === 0) {
          if (!endDate || isBefore(todayOccurrence, endDate)) {
            return todayOccurrence;
          }
        }
      }
      
      // Find the next occurrence
      let checkDate = new Date(todayOccurrence <= now ? addDays(todayOccurrence, 1) : todayOccurrence);
      checkDate.setHours(hourNum, minuteNum, 0, 0);
      
      // Ensure we don't go before startDate
      if (isBefore(checkDate, startDate)) {
        checkDate = new Date(startDate);
        checkDate.setHours(hourNum, minuteNum, 0, 0);
        
        // If time has passed on start date, move to next day
        if (isBefore(checkDate, startDate)) {
          checkDate = addDays(checkDate, 1);
          checkDate.setHours(hourNum, minuteNum, 0, 0);
        }
      }
      
      // Find the next date that matches the interval
      const maxSearchDays = dayInterval * 2; // Search up to 2 intervals ahead
      for (let i = 0; i < maxSearchDays; i++) {
        const daysDiff = Math.floor((checkDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff >= 0 && daysDiff % dayInterval === 0) {
          // Validate the found date
          if (isNaN(checkDate.getTime())) {
            console.warn("Invalid check date for day interval:", checkDate);
            return null;
          }
          
          // Check if within end date range
          if (!endDate || isBefore(checkDate, endDate)) {
            return checkDate;
          }
          
          return null;
        }
        
        checkDate = addDays(checkDate, 1);
      }

      console.warn("Could not find matching day interval occurrence");
      return null;
    } catch (error) {
      console.warn("Error calculating day interval alarm occurrence:", error);
      return null;
    }
  }

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
  if (day === "*" && month === "*" && dayOfWeek !== "*" && dayOfWeek) {
    try {
      // Parse the allowed days of week (0 = Sunday, 1 = Monday, etc.)
      const allowedDays = dayOfWeek.split(",").map((d) => parseInt(d.trim(), 10));
      
      // Validate parsed days
      if (allowedDays.some((d) => isNaN(d) || d < 0 || d > 6)) {
        console.warn("Invalid day of week in cron expression:", dayOfWeek);
        return null;
      }

      // Parse hour and minute from cron
      const hourNum = hour && hour !== "*" ? parseInt(hour, 10) : 0;
      const minuteNum = minute && minute !== "*" ? parseInt(minute, 10) : 0;

      // Validate parsed hour and minute
      if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) {
        console.warn("Invalid hour in cron expression:", hour, cronExpression);
        return null;
      }
      if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
        console.warn("Invalid minute in cron expression:", minute, cronExpression);
        return null;
      }

      // Start checking from today
      let checkDate = new Date();
      checkDate.setHours(hourNum, minuteNum, 0, 0);

      // If today's alarm time has passed, start checking from tomorrow
      if (checkDate <= now) {
        checkDate = addDays(checkDate, 1);
      }

      // Also respect the startDate - don't return a date before it
      if (isBefore(checkDate, startDate)) {
        checkDate = new Date(startDate);
        checkDate.setHours(hourNum, minuteNum, 0, 0);
        
        // If this time has passed on the start date, move to next day
        if (checkDate < startDate) {
          checkDate = addDays(checkDate, 1);
        }
      }

      // Search for the next matching day (up to 7 days ahead)
      for (let i = 0; i < 7; i++) {
        const currentDay = checkDate.getDay();
        
        if (allowedDays.includes(currentDay)) {
          // Validate the found date
          if (isNaN(checkDate.getTime())) {
            console.warn("Invalid check date:", checkDate);
            return null;
          }
          
          // Check if within end date range
          if (!endDate || isBefore(checkDate, endDate)) {
            return checkDate;
          }
          
          // If we're past the end date, no more occurrences
          return null;
        }
        
        checkDate = addDays(checkDate, 1);
      }

      // Should never reach here, but just in case
      console.warn("Could not find matching day in next 7 days");
      return null;
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
