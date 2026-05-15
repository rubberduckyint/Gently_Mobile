import { describe, expect, it, vi } from "vitest";

// Mock BLE modules that pull in react-native (Flow-typed, not parseable by Vite).
// The translator's audioCommand only uses createTriggerAudioPatternRequest;
// we capture its params to assert against them directly.

vi.mock("~/services/ble/types", () => ({
  CommandCode: { TRIGGER_AUDIO_PATTERN: 0x42, TRIGGER_LED_PATTERN: 0x41, TRIGGER_VIBRATION_PATTERN: 0x40 },
  ResponseStatus: { OK: 0x00, ERROR: 0x01 },
  LedColor: { OFF: 0, BLUE: 1, GREEN: 2, CYAN: 3, RED: 4, YELLOW: 5, MAGENTA: 6, WHITE: 7 },
  VibrationIntensity: { MAXIMUM: 3 },
}));

vi.mock("~/services/ble/commands/triggerAudioPattern", () => ({
  createTriggerAudioPatternRequest: (params: { onDurationMs: number; offDurationMs: number; totalDurationSeconds: number }) => ({
    _type: "audio",
    onDurationMs: params.onDurationMs,
    offDurationMs: params.offDurationMs,
    totalDurationSeconds: params.totalDurationSeconds,
  }),
}));

vi.mock("~/services/ble/commands/triggerLedPattern", () => ({
  createTriggerLedPatternRequest: (params: unknown) => ({ _type: "led", ...params as object }),
}));

vi.mock("~/services/ble/commands/triggerVibrationPattern", () => ({
  createTriggerVibrationPatternRequest: (params: unknown) => ({ _type: "vibration", ...params as object }),
}));

import { audioCommand } from "./translator";

describe("audioCommand", () => {
  it("returns null for audioPatternId=null (Off)", () => {
    expect(audioCommand(null, 10)).toBeNull();
  });

  it("returns Quick Beeps command for audioPatternId=1", () => {
    const cmd = audioCommand(1, 10) as { onDurationMs: number; offDurationMs: number; totalDurationSeconds: number } | null;
    expect(cmd).not.toBeNull();
    expect(cmd?.onDurationMs).toBe(100);
    expect(cmd?.offDurationMs).toBe(100);
    expect(cmd?.totalDurationSeconds).toBe(10);
  });

  it("returns Long Beeps command for audioPatternId=2", () => {
    const cmd = audioCommand(2, 10) as { onDurationMs: number; offDurationMs: number } | null;
    expect(cmd?.onDurationMs).toBe(500);
    expect(cmd?.offDurationMs).toBe(200);
  });

  it("returns Steady tone command for audioPatternId=3", () => {
    const cmd = audioCommand(3, 10) as { onDurationMs: number; offDurationMs: number } | null;
    expect(cmd?.onDurationMs).toBeGreaterThan(0);
    expect(cmd?.offDurationMs).toBe(0);
  });

  it("returns Heartbeat command for audioPatternId=4", () => {
    const cmd = audioCommand(4, 10) as { onDurationMs: number; offDurationMs: number } | null;
    expect(cmd?.onDurationMs).toBe(80);
    expect(cmd?.offDurationMs).toBe(180);
  });
});
