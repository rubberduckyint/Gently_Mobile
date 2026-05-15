/**
 * Translate an SRF AlertPayload into a sequence of BLE command requests
 * the bracelet understands.
 *
 * Pure function — no I/O, easily testable.
 *
 * Pattern-id contract surface: SRF and the bracelet firmware both refer
 * to vibration/audio patterns by integer id, but the on/off-duration
 * params for audio are firmware-specific and not carried in the payload.
 * This file holds Mobile's view of that mapping. If SRF and the firmware
 * later converge on a richer payload (e.g. on/off durations carried
 * directly), simplify this and remove the mapping.
 */

import type { AlertPayload } from "~/types/alert-payload";
import type { BLECommandRequest } from "~/services/ble/types";
import { createTriggerAudioPatternRequest } from "~/services/ble/commands/triggerAudioPattern";
import { createTriggerLedPatternRequest } from "~/services/ble/commands/triggerLedPattern";
import { createTriggerVibrationPatternRequest } from "~/services/ble/commands/triggerVibrationPattern";
import type { VibrationPattern } from "~/services/ble/types";
import { LedColor, VibrationIntensity } from "~/services/ble/types";

const MIN_DURATION_SEC = 1;
const MAX_DURATION_SEC = 60;

// SRF preset packs use these case-formatted color names today; firmware
// command takes a 0–7 numeric value. Match case-insensitively to be
// resilient to small SRF formatting changes.
const LED_COLOR_BY_NAME: Record<string, LedColor> = {
  off: LedColor.OFF,
  blue: LedColor.BLUE,
  green: LedColor.GREEN,
  cyan: LedColor.CYAN,
  red: LedColor.RED,
  yellow: LedColor.YELLOW,
  magenta: LedColor.MAGENTA,
  white: LedColor.WHITE,
};

// patternId → (onMs, offMs) — repeated for the duration of the alarm.
// patternId values match SRF's level-translator AUDIO_BY_LEVEL mapping:
// audioLevel 0 → null (Off, no command)
// audioLevel 1 → patternId 1 (Quick)
// audioLevel 2 → patternId 2 (Long)
// audioLevel 3 → patternId 3 (Steady)
// audioLevel 4 → patternId 4 (Heartbeat)
//
// The bracelet's buzzer is fixed-loudness — these patterns vary cadence,
// not volume. Tuned by ear; revisit if firmware exposes finer controls.
const AUDIO_PATTERN_PARAMS: Record<number, { onMs: number; offMs: number }> = {
  1: { onMs: 100, offMs: 100 }, // Quick — rapid alternating beeps
  2: { onMs: 500, offMs: 200 }, // Long — slower, more deliberate beeps
  3: { onMs: 2000, offMs: 0 },  // Steady — continuous tone within durationSec
  4: { onMs: 80, offMs: 180 },  // Heartbeat — rapid pulse rhythm
};

function clampDurationSec(durationSec: number): number {
  if (durationSec < MIN_DURATION_SEC) return MIN_DURATION_SEC;
  if (durationSec > MAX_DURATION_SEC) return MAX_DURATION_SEC;
  return durationSec;
}

function vibrationCommand(
  vibrationPatternId: number,
  durationSec: number,
): BLECommandRequest | null {
  if (vibrationPatternId < 0 || vibrationPatternId > 63) return null;
  return createTriggerVibrationPatternRequest({
    vibrationPattern: vibrationPatternId as VibrationPattern,
    vibrationIntensity: VibrationIntensity.MAXIMUM,
    totalDurationSeconds: clampDurationSec(durationSec),
  });
}

function ledCommand(
  colorName: string,
  ledOnMs: number,
  ledOffMs: number,
  durationSec: number,
): BLECommandRequest | null {
  const color = LED_COLOR_BY_NAME[colorName.toLowerCase()];
  if (color === undefined) return null;
  const totalDurationSeconds = clampDurationSec(durationSec);
  // The BLE builder requires onMs + offMs <= totalDuration*1000; if the
  // payload over-shoots, scale both down proportionally rather than
  // failing the whole alert.
  const totalMs = totalDurationSeconds * 1000;
  let on = ledOnMs;
  let off = ledOffMs;
  if (on + off > totalMs && on + off > 0) {
    const scale = totalMs / (on + off);
    on = Math.floor(on * scale);
    off = Math.floor(off * scale);
  }
  return createTriggerLedPatternRequest({
    ledColor: color,
    onDurationMs: on,
    offDurationMs: off,
    totalDurationSeconds,
  });
}

export function audioCommand(
  audioPatternId: number | null,
  durationSec: number,
): BLECommandRequest | null {
  if (audioPatternId === null) return null;
  const params = AUDIO_PATTERN_PARAMS[audioPatternId];
  if (!params) return null;
  const totalDurationSeconds = clampDurationSec(durationSec);
  // Same on+off <= total guard as LED.
  const totalMs = totalDurationSeconds * 1000;
  let on = params.onMs;
  let off = params.offMs;
  if (on + off > totalMs && on + off > 0) {
    const scale = totalMs / (on + off);
    on = Math.floor(on * scale);
    off = Math.floor(off * scale);
  }
  return createTriggerAudioPatternRequest({
    onDurationMs: on,
    offDurationMs: off,
    totalDurationSeconds,
  });
}

export function alertPayloadToBleCommands(
  payload: AlertPayload,
): BLECommandRequest[] {
  const commands: BLECommandRequest[] = [];

  if (payload.vibrationPatternId !== null) {
    const cmd = vibrationCommand(payload.vibrationPatternId, payload.durationSec);
    if (cmd) commands.push(cmd);
  }

  if (
    payload.ledColor !== null &&
    payload.ledOnMs !== null &&
    payload.ledOffMs !== null
  ) {
    const cmd = ledCommand(
      payload.ledColor,
      payload.ledOnMs,
      payload.ledOffMs,
      payload.durationSec,
    );
    if (cmd) commands.push(cmd);
  }

  if (payload.audioPatternId !== null) {
    const cmd = audioCommand(payload.audioPatternId, payload.durationSec);
    if (cmd) commands.push(cmd);
  }

  return commands;
}
