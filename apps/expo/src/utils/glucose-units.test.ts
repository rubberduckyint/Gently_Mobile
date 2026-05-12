import { describe, expect, it } from "vitest";
import {
  toMmolL,
  toMgDl,
  formatGlucose,
  clampCriticalLow,
} from "./glucose-units";

describe("glucose-units", () => {
  it("converts mg/dL to mmol/L (rounded to 1 decimal)", () => {
    expect(toMmolL(70)).toBe(3.9);
    expect(toMmolL(180)).toBe(10.0);
    expect(toMmolL(50)).toBe(2.8);
  });

  it("converts mmol/L to mg/dL (rounded to nearest integer)", () => {
    expect(toMgDl(3.9)).toBe(70);
    expect(toMgDl(10.0)).toBe(180);
    expect(toMgDl(2.8)).toBe(50);
  });

  it("round-trip preserves whole mg/dL values within 1 mg/dL", () => {
    for (const mg of [50, 70, 100, 140, 180, 250, 300]) {
      const round = toMgDl(toMmolL(mg));
      expect(Math.abs(round - mg)).toBeLessThanOrEqual(1);
    }
  });

  it("formatGlucose renders with the right unit suffix", () => {
    expect(formatGlucose(70, "mg_dl")).toBe("70 mg/dL");
    expect(formatGlucose(70, "mmol_l")).toBe("3.9 mmol/L");
  });

  it("clampCriticalLow rejects below 50 mg/dL", () => {
    expect(clampCriticalLow(49)).toBe(50);
    expect(clampCriticalLow(50)).toBe(50);
    expect(clampCriticalLow(70)).toBe(70);
  });
});
