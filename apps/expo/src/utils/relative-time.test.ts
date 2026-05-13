import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
  const now = new Date("2026-05-12T20:00:00Z").getTime();

  it("renders 'just now' under 15 seconds", () => {
    expect(relativeTime(new Date(now - 5_000), now)).toBe("just now");
  });

  it("renders seconds 15s..59s", () => {
    expect(relativeTime(new Date(now - 30_000), now)).toBe("30s ago");
    expect(relativeTime(new Date(now - 59_000), now)).toBe("59s ago");
  });

  it("renders minutes 1m..59m", () => {
    expect(relativeTime(new Date(now - 90_000), now)).toBe("1m ago");
    expect(relativeTime(new Date(now - 60 * 30 * 1000), now)).toBe("30m ago");
  });

  it("renders hours+ for older", () => {
    expect(relativeTime(new Date(now - 60 * 60 * 1000), now)).toBe("1h ago");
    expect(relativeTime(new Date(now - 60 * 60 * 1000 * 5), now)).toBe("5h ago");
  });
});
