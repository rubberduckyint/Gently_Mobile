import { describe, expect, it } from "vitest";
import { nextOnboardingRoute } from "./onboarding-gate";

describe("nextOnboardingRoute", () => {
  it("returns pair-bracelet when no bracelet is paired", () => {
    expect(nextOnboardingRoute({ hasBracelet: false, sources: [] }))
      .toBe("/(onboarding)/pair-bracelet");
  });

  it("returns connect-dexcom when bracelet paired but no source", () => {
    expect(nextOnboardingRoute({ hasBracelet: true, sources: [] }))
      .toBe("/(onboarding)/connect-dexcom");
  });

  it("returns null when both bracelet paired and at least one source", () => {
    expect(nextOnboardingRoute({
      hasBracelet: true,
      sources: [{ id: "s1", displayName: "x", active: true }],
    })).toBeNull();
  });
});
