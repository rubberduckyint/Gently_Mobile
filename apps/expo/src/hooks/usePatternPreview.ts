/**
 * usePatternPreview Hook
 *
 * Provides functionality to preview LED and vibration patterns on a connected Gently device.
 * Used in alarm forms and settings to let users test/preview their selected patterns.
 *
 * Based on BLE Protocol Rev 0.6 [API 2]
 */

import { useState } from "react";

import type {
  LedColor,
  LedPattern,
  VibrationIntensity,
} from "@gently/db/schema";

import { useBLE } from "~/contexts/BLEContext";
import {
  createTriggerLedPatternRequest,
  createTriggerVibrationPatternRequest,
} from "~/services/ble/commands";
import { sendCommand } from "~/services/ble/manager";
import { VibrationPattern } from "~/services/ble/types";

/**
 * Map LED pattern to duration values (in milliseconds)
 * Short 1-second previews for instant feedback
 */
function mapLedPatternToDurations(pattern: LedPattern): {
  onDurationMs: number;
  offDurationMs: number;
  totalDurationSeconds: number;
} {
  switch (pattern) {
    case "SOLID":
      return { onDurationMs: 1000, offDurationMs: 0, totalDurationSeconds: 1 }; // 1 second solid
    case "BLINK_SLOW":
      return { onDurationMs: 500, offDurationMs: 500, totalDurationSeconds: 1 }; // 500ms on/off, 1 cycle
    case "BLINK_FAST":
      return { onDurationMs: 200, offDurationMs: 200, totalDurationSeconds: 1 }; // 200ms on/off, 2.5 cycles
    case "PULSE":
      return { onDurationMs: 250, offDurationMs: 250, totalDurationSeconds: 1 }; // 250ms on/off, 2 cycles
    case "STROBE":
      return { onDurationMs: 100, offDurationMs: 100, totalDurationSeconds: 1 }; // 100ms on/off, 5 cycles
  }
}

/**
 * Map LED color to protocol color code
 */
function mapLedColorToNumber(color: LedColor): number {
  const colorMap: Record<LedColor, number> = {
    RED: 4,
    GREEN: 2,
    BLUE: 1,
    YELLOW: 5,
    MAGENTA: 6,
    CYAN: 3,
    WHITE: 7,
  };
  return colorMap[color];
}

/**
 * Map vibration pattern number (1-4) to enum value
 */
function mapVibrationPatternToEnum(patternNumber: number): VibrationPattern {
  switch (patternNumber) {
    case 1:
      return VibrationPattern.QUICK;
    case 2:
      return VibrationPattern.HEARTBEAT;
    case 3:
      return VibrationPattern.RAPID;
    case 4:
      return VibrationPattern.SYMPHONY;
    default:
      return VibrationPattern.QUICK;
  }
}

/**
 * Map vibration intensity to protocol value (0-3)
 */
function mapVibrationIntensityToNumber(
  intensity: VibrationIntensity,
): 0 | 1 | 2 | 3 {
  const intensityMap: Record<VibrationIntensity, 0 | 1 | 2 | 3> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    MAXIMUM: 3,
  };
  return intensityMap[intensity];
}

export function usePatternPreview() {
  const { connectedDevice, encryptionKey } = useBLE();
  const [isPreviewingLed, setIsPreviewingLed] = useState(false);
  const [isPreviewingVibration, setIsPreviewingVibration] = useState(false);

  const deviceId = connectedDevice?.id;
  const canPreview = !!deviceId && !!encryptionKey;

  /**
   * Preview LED pattern with specified color and pattern
   */
  const previewLedPattern = async (color: LedColor, pattern: LedPattern) => {
    if (!deviceId || !encryptionKey) {
      console.warn("No device connected - cannot preview LED pattern");
      return;
    }

    setIsPreviewingLed(true);

    try {
      const ledColorNum = mapLedColorToNumber(color);
      const durations = mapLedPatternToDurations(pattern);

      const command = createTriggerLedPatternRequest({
        ledColor: ledColorNum,
        onDurationMs: durations.onDurationMs,
        offDurationMs: durations.offDurationMs,
        totalDurationSeconds: durations.totalDurationSeconds,
      });

      await sendCommand({
        peripheralId: deviceId,
        command,
        encryptionKey,
      });

      console.log(`✨ Previewed LED pattern: ${color} ${pattern} (1 second)`);
    } catch (error) {
      console.error("Failed to preview LED pattern:", error);
    } finally {
      setIsPreviewingLed(false);
    }
  };

  /**
   * Preview vibration pattern with specified pattern and intensity
   */
  const previewVibrationPattern = async (
    patternNumber: number,
    intensity: VibrationIntensity,
  ) => {
    if (!deviceId || !encryptionKey) {
      console.warn("No device connected - cannot preview vibration pattern");
      return;
    }

    setIsPreviewingVibration(true);

    try {
      const vibrationPattern = mapVibrationPatternToEnum(patternNumber);
      const vibrationIntensity = mapVibrationIntensityToNumber(intensity);

      const command = createTriggerVibrationPatternRequest({
        vibrationPattern,
        vibrationIntensity,
        totalDurationSeconds: 1, // 1 second preview for instant feedback
      });

      await sendCommand({
        peripheralId: deviceId,
        command,
        encryptionKey,
      });

      console.log(
        `📳 Previewed vibration pattern: ${VibrationPattern[vibrationPattern]} at intensity ${intensity}`,
      );
    } catch (error) {
      console.error("Failed to preview vibration pattern:", error);
    } finally {
      setIsPreviewingVibration(false);
    }
  };

  return {
    previewLedPattern,
    previewVibrationPattern,
    isPreviewingLed,
    isPreviewingVibration,
    canPreview,
  };
}
