import * as cronstrue from "cronstrue";
import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";

// Helper function to safely parse cron expressions
export function formatCronExpression(cronExpression: string): string {
  try {
    return cronstrue.toString(cronExpression, {
      use24HourTimeFormat: false,
      verbose: true,
    });
  } catch (error) {
    console.warn("Failed to parse cron expression:", cronExpression, error);
    return "Invalid cron expression";
  }
}

// Helper function to format cron expression with start and end date information
export function formatCronExpressionWithStartEnd(alarm: {
  startDate: Date | null;
  endDate: Date | null;
  cronExpression: string;
}): {
  cronDescription: string;
  startInfo: string | null;
  endInfo: string | null;
  isExpired: boolean;
} {
  const cronDescription = formatCronExpression(alarm.cronExpression);
  const now = new Date();
  const startDate = alarm.startDate ? new Date(alarm.startDate) : new Date();

  let startInfo = null;
  let endInfo = null;
  let isExpired = false;

  // Helper function to format dates with relative context
  const formatDateWithContext = (date: Date, _isPast: boolean) => {
    if (isToday(date)) {
      return `today at ${format(date, "h:mm a")}`;
    } else if (isTomorrow(date)) {
      return `tomorrow at ${format(date, "h:mm a")}`;
    } else if (isYesterday(date)) {
      return `yesterday at ${format(date, "h:mm a")}`;
    } else {
      const distance = formatDistanceToNow(date, { addSuffix: true });
      const fullDate = format(date, "MMM d, yyyy 'at' h:mm a");
      return `${fullDate} (${distance})`;
    }
  };

  // Format start date information
  if (startDate > now) {
    startInfo = `Starts ${formatDateWithContext(startDate, false)}`;
  } else {
    startInfo = `Started ${formatDateWithContext(startDate, true)}`;
  }

  // Format end date information
  if (alarm.endDate) {
    const endDate = new Date(alarm.endDate);
    if (endDate < now) {
      endInfo = `Ended ${formatDateWithContext(endDate, true)}`;
      isExpired = true;
    } else {
      endInfo = `Ends ${formatDateWithContext(endDate, false)}`;
    }
  }

  return {
    cronDescription,
    startInfo,
    endInfo,
    isExpired,
  };
}
