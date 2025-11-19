"use client";

import { formatDistanceToNow } from "date-fns";
import { Calendar, Clock, Flag, Palette, Vibrate } from "lucide-react";

import { Badge } from "~/_components/ui/badge";

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
  className?: string;
}

// Helper function to format severity level
function formatSeverityLevel(severity: string): string {
  switch (severity) {
    case "INFORMATIONAL":
      return "Informational";
    case "WARNING":
      return "Warning";
    case "CRITICAL":
      return "Critical";
    default:
      return severity;
  }
}

// Helper function to format LED pattern
function formatLedPattern(pattern: string): string {
  switch (pattern) {
    case "SOLID":
      return "Solid";
    case "BLINK_SLOW":
      return "Blink Slow";
    case "BLINK_FAST":
      return "Blink Fast";
    case "PULSE":
      return "Pulse";
    case "STROBE":
      return "Strobe";
    default:
      return pattern;
  }
}

// Helper function to format LED color
function formatLedColor(color: string): string {
  switch (color) {
    case "RED":
      return "Red";
    case "GREEN":
      return "Green";
    case "BLUE":
      return "Blue";
    case "YELLOW":
      return "Yellow";
    case "MAGENTA":
      return "Magenta";
    case "CYAN":
      return "Cyan";
    case "WHITE":
      return "White";
    default:
      return color;
  }
}

// Helper function to format vibration intensity
function formatVibrationIntensity(intensity: string): string {
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
      return intensity;
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

// Helper function to get LED color for display
function getLedColorValue(color: string): string {
  switch (color) {
    case "RED":
      return "#ef4444";
    case "GREEN":
      return "#22c55e";
    case "BLUE":
      return "#3b82f6";
    case "YELLOW":
      return "#eab308";
    case "MAGENTA":
      return "#d946ef";
    case "CYAN":
      return "#06b6d4";
    case "WHITE":
      return "#ffffff";
    default:
      return "#6b7280";
  }
}

export function AlarmCard({
  alarm,
  formatCronExpressionWithStartEnd,
  showExpiredBadge = false,
  className = "",
}: AlarmCardProps) {
  const scheduleInfo = formatCronExpressionWithStartEnd(alarm);

  return (
    <div className={`flex w-full min-w-0 flex-col gap-3 ${className}`}>
      {/* Status badges and meta info */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {!alarm.isActive && (
          <Badge variant="outline" className="text-muted-foreground">
            DISABLED
          </Badge>
        )}
        <Badge
          variant={alarm.syncStatus === "ERROR" ? "destructive" : "secondary"}
        >
          {alarm.syncStatus}
        </Badge>
        {showExpiredBadge && scheduleInfo.isExpired && (
          <Badge variant="outline" className="text-muted-foreground">
            EXPIRED
          </Badge>
        )}
        {alarm.lastSync && (
          <span className="text-muted-foreground text-xs">
            Last sync{" "}
            {formatDistanceToNow(new Date(alarm.lastSync), {
              addSuffix: true,
            })}
          </span>
        )}
      </div>

      {/* Title and description */}
      <div>
        <h3 className="text-foreground truncate text-lg font-semibold">
          {alarm.title}
        </h3>
        {alarm.description && (
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">
            {alarm.description}
          </p>
        )}
      </div>

      {/* Properties */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Flag className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-xs font-medium">
            Severity:
          </span>
          <Badge variant="outline">
            {formatSeverityLevel(alarm.severityLevel)}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Palette className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-xs font-medium">
            LED:
          </span>
          <div className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded-full border shadow-sm"
              style={{
                backgroundColor: getLedColorValue(alarm.ledColor),
              }}
              title={formatLedColor(alarm.ledColor)}
            />
            <Badge variant="outline" className="text-xs">
              {alarm.ledColor.slice(0, 3)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {formatLedPattern(alarm.ledPattern)}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Vibrate className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-xs font-medium">
            Vibration:
          </span>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs">
              {formatVibrationIntensity(alarm.vibrationIntensity)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {getVibrationPatternLabel(alarm.vibrationPattern)}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-xs font-medium">
            Snooze:
          </span>
          <Badge variant="outline" className="text-xs">
            {alarm.snoozePeriod}m
          </Badge>
        </div>
      </div>

      {/* Cron expressions and schedule information */}
      <div className="space-y-2">
        <div className="border-accent bg-accent/60 text-foreground rounded-md border px-3 py-2">
          <div className="text-sm font-medium">
            {scheduleInfo.cronDescription}
          </div>
          <div className="text-muted-foreground mt-1 font-mono text-xs">
            {alarm.cronExpression} (debug)
          </div>
        </div>

        {/* Start and End date information */}
        <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
          {scheduleInfo.startInfo && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{scheduleInfo.startInfo}</span>
            </div>
          )}
          {scheduleInfo.endInfo && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span
                className={scheduleInfo.isExpired ? "text-destructive" : ""}
              >
                {scheduleInfo.endInfo}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Read-only notice */}
      <div className="pt-2">
        <p className="text-muted-foreground text-xs italic">
          Alarms can only be managed from the mobile app
        </p>
      </div>
    </div>
  );
}
