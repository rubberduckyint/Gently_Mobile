"use client";

import { useMemo } from "react";
import { format, formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import {
  Bell,
  BellOff,
  Calendar,
  ChevronRight,
  Circle,
  CircleDot,
  Clock,
  Lightbulb,
  Zap,
} from "lucide-react";

import { Badge } from "~/_components/ui/badge";
import { cn } from "~/lib/utils";

interface AlarmCardProps {
  alarm: {
    id: string;
    title: string;
    description: string | null;
    isActive: boolean;
    syncStatus: string;
    lastSync: Date | null;
    severityLevel: string;
    vibrationIntensity: string;
    vibrationPattern: number;
    ledColor: string;
    ledPattern: string;
    snoozePeriod: number;
    cronExpression: string;
    startDate: Date | null;
    endDate: Date | null;
    repeat: boolean;
    calendarEventAlarm?: {
      calendarConnection?: {
        accountEmail?: string;
      };
    } | null;
  };
  formatCronExpressionWithStartEnd: (alarm: {
    startDate: Date | null;
    endDate: Date | null;
    cronExpression: string;
  }) => {
    cronDescription: string;
    startInfo: string | null;
    endInfo: string | null;
    isExpired: boolean;
  };
  showExpiredBadge?: boolean;
  canEdit?: boolean;
  className?: string;
  onClick?: () => void;
}

// Helper function to get LED color hex value
function getLedColorValue(color: string): string {
  switch (color) {
    case "RED":
      return "#ff3b30";
    case "GREEN":
      return "#34c759";
    case "BLUE":
      return "#007aff";
    case "YELLOW":
      return "#ffcc02";
    case "MAGENTA":
      return "#af52de";
    case "CYAN":
      return "#00ffff";
    case "WHITE":
      return "#ffffff";
    default:
      return "#6b7280";
  }
}

// Helper function to format vibration intensity
function getVibrationIntensityLabel(intensity: string): string {
  switch (intensity) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Med";
    case "HIGH":
      return "High";
    case "MAXIMUM":
      return "Max";
    default:
      return intensity.slice(0, 3);
  }
}

// Helper function to format vibration pattern number to label
function getVibrationPatternLabel(pattern: number): string {
  if (pattern >= 1 && pattern <= 8) return "Quick";
  if (pattern >= 9 && pattern <= 16) return "Heartbeat";
  if (pattern >= 17 && pattern <= 32) return "Rapid";
  if (pattern >= 33 && pattern <= 63) return "Symphony";
  return `P${pattern}`;
}

// Helper function to get LED pattern label
function getLedPatternLabel(pattern: string): string {
  switch (pattern) {
    case "SOLID":
      return "Solid";
    case "BLINK_SLOW":
      return "Slow";
    case "BLINK_FAST":
      return "Fast";
    case "PULSE":
      return "Pulse";
    case "STROBE":
      return "Strobe";
    default:
      return pattern;
  }
}

// Helper function to get sync status config
function getSyncStatusConfig(status: string) {
  switch (status) {
    case "SYNCED":
      return {
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        text: "Synced",
      };
    case "SYNCING":
      return {
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        text: "Syncing",
      };
    case "ERROR":
      return {
        color: "text-red-500",
        bgColor: "bg-red-500/10",
        text: "Error",
      };
    default:
      return {
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10",
        text: "Pending",
      };
  }
}

export function AlarmCard({
  alarm,
  formatCronExpressionWithStartEnd,
  showExpiredBadge = false,
  canEdit = false,
  className = "",
  onClick,
}: AlarmCardProps) {
  const scheduleInfo = formatCronExpressionWithStartEnd(alarm);
  const isExpired = showExpiredBadge && scheduleInfo.isExpired;
  const syncConfig = getSyncStatusConfig(alarm.syncStatus);

  // Calendar sync info
  const isCalendarSynced = !!alarm.calendarEventAlarm;
  const calendarAccountEmail =
    alarm.calendarEventAlarm?.calendarConnection?.accountEmail;

  // Format date with time helper
  const formatDateWithTime = (date: Date) => {
    const timeStr = format(date, "h:mm a");

    if (isToday(date)) return `Today at ${timeStr}`;
    if (isTomorrow(date)) return `Tomorrow at ${timeStr}`;

    const dateStr = format(date, "MMM d");
    return `${dateStr} at ${timeStr}`;
  };

  // Generate schedule description
  const scheduleDescription = useMemo(() => {
    const startDate = alarm.startDate ? new Date(alarm.startDate) : new Date();
    const endDate = alarm.endDate ? new Date(alarm.endDate) : null;

    // For expired alarms, show when it ended/was scheduled
    if (isExpired) {
      if (endDate) {
        return `Ended ${formatDateWithTime(endDate)}`;
      }
      return `Was scheduled for ${formatDateWithTime(startDate)}`;
    }

    if (alarm.repeat) {
      // Show cron description with next occurrence
      return scheduleInfo.cronDescription;
    } else {
      return `One-time • ${formatDateWithTime(startDate)}`;
    }
  }, [alarm, isExpired, scheduleInfo.cronDescription]);

  // Calculate next occurrence display
  const nextOccurrenceText = useMemo(() => {
    if (isExpired || !alarm.isActive) return null;

    const startDate = alarm.startDate ? new Date(alarm.startDate) : null;
    if (!startDate) return null;

    const now = new Date();
    if (startDate > now) {
      return formatDistanceToNow(startDate, { addSuffix: false });
    }

    // For recurring alarms, we could calculate next occurrence but for now show start info
    return null;
  }, [alarm, isExpired]);

  return (
    <div
      className={cn(
        "bg-card hover:bg-accent/50 flex w-full min-w-0 cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-all",
        !alarm.isActive && "opacity-70",
        className,
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Active/Inactive Icon */}
          {alarm.isActive ? (
            <Bell className="text-primary h-5 w-5 shrink-0" />
          ) : (
            <BellOff className="text-muted-foreground h-5 w-5 shrink-0" />
          )}

          {/* Title */}
          <h3
            className={cn(
              "truncate text-base font-semibold",
              alarm.isActive ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {alarm.title}
          </h3>

          {/* Calendar Sync Indicator */}
          {isCalendarSynced && (
            <div className="bg-primary/10 flex shrink-0 items-center gap-1 rounded px-2 py-0.5">
              <Calendar className="text-primary h-3 w-3" />
              <span className="text-primary text-[10px] font-semibold">
                {calendarAccountEmail
                  ? calendarAccountEmail.split("@")[0]
                  : "Synced"}
              </span>
            </div>
          )}
        </div>

        {/* Chevron */}
        {onClick && (
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
        )}
      </div>

      {/* Time Description */}
      <p className="text-muted-foreground truncate text-xs">
        {scheduleDescription}
      </p>

      {/* Status Badge - Show if disabled */}
      {!alarm.isActive && (
        <Badge variant="secondary" className="w-fit text-[10px]">
          DISABLED
        </Badge>
      )}

      {/* Expired Badge */}
      {isExpired && (
        <Badge
          variant="outline"
          className="text-muted-foreground w-fit text-[10px]"
        >
          EXPIRED
        </Badge>
      )}

      {/* Next Occurrence - only show for non-expired active alarms */}
      {!isExpired && nextOccurrenceText && alarm.isActive && (
        <div className="flex items-center gap-1">
          <Clock className="text-primary h-3 w-3" />
          <span className="text-primary text-[10px] font-medium">
            Next: {nextOccurrenceText}
          </span>
        </div>
      )}

      {/* Icon Row - Settings Display */}
      <div className="border-border flex items-start justify-between border-t pt-3">
        {/* LED Group */}
        <div className="flex-1.5 flex flex-col items-center">
          <span className="text-muted-foreground mb-1 text-[8px] font-semibold uppercase">
            LED
          </span>
          <div className="flex items-center gap-2">
            {/* LED Color */}
            <div className="flex flex-col items-center">
              <div
                className="mb-1 h-6 w-6 rounded-full border shadow-sm"
                style={{ backgroundColor: getLedColorValue(alarm.ledColor) }}
              />
              <span className="text-muted-foreground text-[9px]">
                {alarm.ledColor.slice(0, 3)}
              </span>
            </div>

            {/* LED Pattern */}
            <div className="flex flex-col items-center">
              <Lightbulb className="text-muted-foreground mb-1 h-6 w-6" />
              <span className="text-muted-foreground text-[9px]">
                {getLedPatternLabel(alarm.ledPattern)}
              </span>
            </div>
          </div>
        </div>

        {/* Vibration Group */}
        <div className="flex-1.5 flex flex-col items-center">
          <span className="text-muted-foreground mb-1 text-[8px] font-semibold uppercase">
            Vibration
          </span>
          <div className="flex items-center gap-2">
            {/* Vibration Intensity */}
            <div className="flex flex-col items-center">
              <CircleDot className="text-muted-foreground mb-1 h-6 w-6" />
              <span className="text-muted-foreground text-[9px]">
                {getVibrationIntensityLabel(alarm.vibrationIntensity)}
              </span>
            </div>

            {/* Vibration Pattern */}
            <div className="flex flex-col items-center">
              <Zap className="text-muted-foreground mb-1 h-6 w-6" />
              <span className="text-muted-foreground text-[9px]">
                {getVibrationPatternLabel(alarm.vibrationPattern)}
              </span>
            </div>
          </div>
        </div>

        {/* Snooze */}
        <div className="flex flex-1 flex-col items-center">
          <span className="text-muted-foreground mb-1 text-[8px] font-semibold uppercase">
            Snooze
          </span>
          <Clock className="text-muted-foreground mb-1 h-6 w-6" />
          <span className="text-muted-foreground text-[9px]">
            {alarm.snoozePeriod}m
          </span>
        </div>

        {/* Sync Status */}
        <div className="flex flex-1 flex-col items-center">
          <span className="text-muted-foreground mb-1 text-[8px] font-semibold uppercase">
            Sync
          </span>
          <Circle className={cn("mb-1 h-6 w-6", syncConfig.color)} />
          <span className={cn("text-[9px] font-semibold", syncConfig.color)}>
            {syncConfig.text}
          </span>
        </div>
      </div>

      {/* Sync status notice for editable alarms */}
      {canEdit && alarm.syncStatus === "NOT_SYNCED" && (
        <div className="border-warning/30 bg-warning/10 rounded-md border px-3 py-2">
          <p className="text-warning-foreground text-xs font-medium">
            ⏳ Pending sync - Changes will be applied when you open the mobile
            app
          </p>
        </div>
      )}

      {/* Read-only notice for non-editable alarms */}
      {!canEdit && (
        <p className="text-muted-foreground pt-2 text-xs italic">
          Alarms can only be managed by the device owner or users with write
          access
        </p>
      )}
    </div>
  );
}
