"use client";

import { formatInUserTimezone } from "~/utils/timezone";
import { useSession } from "next-auth/react";

interface TimezoneAwareDateProps {
  date: Date | string;
  format?: string;
  fallbackTimezone?: string;
}

export function TimezoneAwareDate({
  date,
  format = "MMM d, yyyy 'at' h:mm a",
  fallbackTimezone = "UTC",
}: TimezoneAwareDateProps) {
  const { data: session } = useSession();
  const userTimezone =
    (session?.user as { timezone?: string })?.timezone ?? fallbackTimezone;

  return (
    <span
      title={`${formatInUserTimezone(date, "UTC", "yyyy-MM-dd HH:mm:ss 'UTC'")}`}
    >
      {formatInUserTimezone(date, userTimezone, format)}
    </span>
  );
}

interface TimezoneAwareRelativeTimeProps {
  date: Date | string;
  fallbackTimezone?: string;
}

export function TimezoneAwareRelativeTime({
  date,
  fallbackTimezone = "UTC",
}: TimezoneAwareRelativeTimeProps) {
  const { data: session } = useSession();
  const userTimezone =
    (session?.user as { timezone?: string })?.timezone ?? fallbackTimezone;

  // For relative time, we can use the existing relative-time component
  // but show the timezone-aware absolute time in the tooltip
  return (
    <span
      title={formatInUserTimezone(
        date,
        userTimezone,
        "MMM d, yyyy 'at' h:mm a zzz",
      )}
    >
      <time dateTime={typeof date === "string" ? date : date.toISOString()}>
        {formatInUserTimezone(date, userTimezone, "MMM d, yyyy 'at' h:mm a")}
      </time>
    </span>
  );
}
