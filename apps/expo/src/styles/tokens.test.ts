import { describe, expect, it } from "vitest";
import { tokens } from "./tokens";

describe("design tokens", () => {
  it("exposes brand cyan", () => {
    expect(tokens.color.cyan).toBe("#16BCE9");
    expect(tokens.color.cyanDeep).toBe("#0E8FB6");
    expect(tokens.color.cyanBg).toBe("#E4F5FB");
  });
  it("exposes semantic colors (no green)", () => {
    expect(tokens.color.amber).toBe("#C07A1C");
    expect(tokens.color.coral).toBe("#C24A4A");
    expect(tokens.color).not.toHaveProperty("green");
  });
  it("exposes radius scale", () => {
    expect(tokens.radius.card).toBe(20);
    expect(tokens.radius.pill).toBe(999);
  });
  it("exposes typography weights as strings (RN compatible)", () => {
    expect(tokens.font.weightStrong).toBe("700");
  });
});
