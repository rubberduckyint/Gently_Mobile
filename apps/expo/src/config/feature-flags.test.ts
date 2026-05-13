import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS } from "./feature-flags";

describe("FEATURE_FLAGS", () => {
  it("disables multi-device for v1", () => {
    expect(FEATURE_FLAGS.MULTI_DEVICE_ENABLED).toBe(false);
  });
  it("is a frozen const object (no runtime mutation)", () => {
    expect(Object.isFrozen(FEATURE_FLAGS)).toBe(true);
  });
});
