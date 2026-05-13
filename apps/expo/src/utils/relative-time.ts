export function relativeTime(then: Date, nowMs: number = Date.now()): string {
  const diffMs = nowMs - then.getTime();
  if (diffMs < 15_000) return "just now";
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  return `${Math.floor(diffMs / 3_600_000)}h ago`;
}
