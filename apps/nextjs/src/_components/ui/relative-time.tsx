"use client";

import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";

// import { useSession } from "next-auth/react";

// import { formatInUserTimezone } from "~/utils/timezone";

interface RelativeTimeProps {
  date: Date | string | number;
  formatString?: string;
  addSuffix?: boolean;
  showTimezone?: boolean;
}

export function RelativeTime({
  date,
  formatString = "MMMM d, yyyy, h:mm a",
  addSuffix = true,
  showTimezone: _showTimezone = false,
}: RelativeTimeProps) {
  // const { data: session } = useSession();
  const [relative, setRelative] = useState<string | null>(null);
  // const userTimezone =
  //   (session?.user as { timezone?: string })?.timezone ?? "UTC";

  useEffect(() => {
    // Use the original date for relative time calculation
    setRelative(formatDistanceToNow(new Date(date), { addSuffix }));
  }, [date, addSuffix]);

  // Format the absolute time using simple date-fns format
  const absoluteTime = format(
    typeof date === "number" ? new Date(date) : new Date(date),
    formatString,
  );

  if (relative) {
    return (
      <span title={absoluteTime} className="cursor-help">
        {relative}
      </span>
    );
  }

  // Fallback for SSR: show absolute time
  return <>{absoluteTime}</>;
}
