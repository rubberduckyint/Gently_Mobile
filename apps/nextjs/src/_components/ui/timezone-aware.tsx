"use client";

import { format } from "date-fns";

// import { useSession } from "next-auth/react";

// import { formatInUserTimezone } from "~/utils/timezone";

interface TimezoneAwareDateProps {
  date: Date | string;
  format?: string;
  fallbackTimezone?: string;
}

export function TimezoneAwareDate({
  date,
  format: formatString = "MMM d, yyyy 'at' h:mm a",
  fallbackTimezone: _fallbackTimezone = "UTC",
}: TimezoneAwareDateProps) {
  // const { data: session } = useSession();
  // const userTimezone =
  //   (session?.user as { timezone?: string })?.timezone ?? fallbackTimezone;

  const dateObj = typeof date === "string" ? new Date(date) : date;

  return (
    <span title={format(dateObj, "yyyy-MM-dd HH:mm:ss")}>
      {format(dateObj, formatString)}
    </span>
  );
}

interface TimezoneAwareRelativeTimeProps {
  date: Date | string;
  fallbackTimezone?: string;
}

export function TimezoneAwareRelativeTime({
  date,
  fallbackTimezone: _fallbackTimezone = "UTC",
}: TimezoneAwareRelativeTimeProps) {
  // const { data: session } = useSession();
  // const userTimezone =
  //   (session?.user as { timezone?: string })?.timezone ?? fallbackTimezone;

  const dateObj = typeof date === "string" ? new Date(date) : date;

  // For relative time, we can use the existing relative-time component
  // but show the absolute time in the tooltip
  return (
    <span title={format(dateObj, "MMM d, yyyy 'at' h:mm a")}>
      <time dateTime={typeof date === "string" ? date : date.toISOString()}>
        {format(dateObj, "MMM d, yyyy 'at' h:mm a")}
      </time>
    </span>
  );
}
