import { describe, expect, it } from "vitest";
import { trendArrow, trendLabel } from "./glucose-trend";

describe("trendArrow", () => {
  it.each([
    ["DoubleUp",       "⇈"],
    ["SingleUp",       "↑"],
    ["FortyFiveUp",    "↗"],
    ["Flat",           "→"],
    ["FortyFiveDown",  "↘"],
    ["SingleDown",     "↓"],
    ["DoubleDown",     "⇊"],
  ] as const)("maps %s to %s", (code, arrow) => {
    expect(trendArrow(code)).toBe(arrow);
  });

  it("renders None / unknown trends with a dash", () => {
    expect(trendArrow("None")).toBe("—");
    expect(trendArrow("NotComputable")).toBe("—");
    expect(trendArrow("RateOutOfRange")).toBe("—");
    expect(trendArrow("UnknownGarbage")).toBe("—");
  });
});

describe("trendLabel", () => {
  it("renders a human label", () => {
    expect(trendLabel("Flat")).toBe("Steady");
    expect(trendLabel("SingleUp")).toBe("Rising");
    expect(trendLabel("DoubleDown")).toBe("Falling fast");
  });
});
