/**
 * Alarm Constants
 *
 * Shared constants for alarms used across web and mobile apps.
 * These define the options for LED patterns, colors, vibration settings, etc.
 */

// ============================================================================
// Default Form Values
// ============================================================================
import type {
  AlarmFormData,
  ColorOption,
  LabeledOption,
  LedColor,
  LedPattern,
  RepeatType,
  SeverityLevel,
  VibrationIntensity,
  VibrationPattern,
} from "./types";

// ============================================================================
// Days of Week
// ============================================================================

export const DAYS_OF_WEEK: LabeledOption<string>[] = [
  { value: "0", label: "Sunday", short: "Sun" },
  { value: "1", label: "Monday", short: "Mon" },
  { value: "2", label: "Tuesday", short: "Tue" },
  { value: "3", label: "Wednesday", short: "Wed" },
  { value: "4", label: "Thursday", short: "Thu" },
  { value: "5", label: "Friday", short: "Fri" },
  { value: "6", label: "Saturday", short: "Sat" },
];

// ============================================================================
// Repeat Type Options
// ============================================================================

export const REPEAT_TYPE_OPTIONS: LabeledOption<RepeatType>[] = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
];

// ============================================================================
// Severity Level Options
// ============================================================================

export const SEVERITY_LEVEL_OPTIONS: LabeledOption<SeverityLevel>[] = [
  {
    value: "INFORMATIONAL",
    label: "Informational",
    description: "Low priority notification",
  },
  {
    value: "WARNING",
    label: "Warning",
    description: "Moderate priority alert",
  },
  {
    value: "CRITICAL",
    label: "Critical",
    description: "High priority urgent alert",
  },
];

// ============================================================================
// LED Pattern Options
// ============================================================================

export const LED_PATTERN_OPTIONS: LabeledOption<LedPattern>[] = [
  {
    value: "OFF",
    label: "Off",
    description: "LED disabled",
    icon: "remove-circle-outline",
  },
  {
    value: "SOLID",
    label: "Solid",
    description: "Continuous steady light",
    icon: "ellipse",
  },
  {
    value: "BLINK_SLOW",
    label: "Slow Blink",
    short: "Slow",
    description: "Gentle pulsing light",
    icon: "ellipse-outline",
  },
  {
    value: "BLINK_FAST",
    label: "Fast Blink",
    short: "Fast",
    description: "Rapid attention-getting flashes",
    icon: "flash",
  },
  {
    value: "PULSE",
    label: "Pulse",
    description: "Smooth breathing effect",
    icon: "heart",
  },
  {
    value: "STROBE",
    label: "Strobe",
    description: "Intense flashing pattern",
    icon: "flash-outline",
  },
];

// ============================================================================
// LED Color Options
// ============================================================================

export const LED_COLOR_OPTIONS: ColorOption[] = [
  { value: "RED", label: "Red", hex: "#ff3b30" },
  { value: "GREEN", label: "Green", hex: "#34c759" },
  { value: "BLUE", label: "Blue", hex: "#007aff" },
  { value: "YELLOW", label: "Yellow", hex: "#ffcc02" },
  { value: "MAGENTA", label: "Magenta", hex: "#af52de" },
  { value: "CYAN", label: "Cyan", hex: "#00bfff" },
  { value: "WHITE", label: "White", hex: "#ffffff" },
];

/**
 * Get the hex color value for an LED color
 */
export function getLedColorHex(color: LedColor): string {
  const option = LED_COLOR_OPTIONS.find((o) => o.value === color);
  return option?.hex ?? "#6b7280";
}

// ============================================================================
// Vibration Intensity Options
// ============================================================================

export const VIBRATION_INTENSITY_OPTIONS: LabeledOption<VibrationIntensity>[] =
  [
    {
      value: "LOW",
      label: "Low",
      short: "Low",
      description: "Gentle vibration",
      icon: "radio-button-off",
    },
    {
      value: "MEDIUM",
      label: "Medium",
      short: "Med",
      description: "Moderate vibration",
      icon: "remove",
    },
    {
      value: "HIGH",
      label: "High",
      short: "High",
      description: "Strong vibration",
      icon: "reorder-three",
    },
    {
      value: "MAXIMUM",
      label: "Maximum",
      short: "Max",
      description: "Maximum vibration",
      icon: "reorder-four",
    },
  ];

// ============================================================================
// Vibration Pattern Options
// ============================================================================

export const VIBRATION_PATTERN_OPTIONS: LabeledOption<VibrationPattern>[] = [
  {
    value: "QUICK",
    label: "Quick",
    description: "Short, sharp vibrations",
    icon: "flash",
  },
  {
    value: "HEARTBEAT",
    label: "Heartbeat",
    description: "Rhythmic double pulses",
    icon: "heart",
  },
  {
    value: "RAPID",
    label: "Rapid",
    description: "Fast continuous pulses",
    icon: "pulse",
  },
  {
    value: "SYMPHONY",
    label: "Symphony",
    description: "Complex musical pattern",
    icon: "musical-notes",
  },
];

/**
 * Map vibration pattern number to pattern type
 */
export function getVibrationPatternFromNumber(
  pattern: number,
): VibrationPattern {
  if (pattern >= 1 && pattern <= 8) return "QUICK";
  if (pattern >= 9 && pattern <= 16) return "HEARTBEAT";
  if (pattern >= 17 && pattern <= 32) return "RAPID";
  return "SYMPHONY";
}

/**
 * Map vibration pattern type to a representative number
 */
export function getVibrationPatternNumber(pattern: VibrationPattern): number {
  switch (pattern) {
    case "QUICK":
      return 1;
    case "HEARTBEAT":
      return 9;
    case "RAPID":
      return 17;
    case "SYMPHONY":
      return 33;
    default:
      return 1;
  }
}

/**
 * Get vibration pattern label from number
 */
export function getVibrationPatternLabel(pattern: number): string {
  if (pattern >= 1 && pattern <= 8) return "Quick";
  if (pattern >= 9 && pattern <= 16) return "Heartbeat";
  if (pattern >= 17 && pattern <= 32) return "Rapid";
  if (pattern >= 33 && pattern <= 63) return "Symphony";
  return `P${pattern}`;
}

// ============================================================================
// Snooze Options
// ============================================================================

export const SNOOZE_PERIOD_OPTIONS = [1, 3, 5, 10, 15] as const;
export type SnoozePeriod = (typeof SNOOZE_PERIOD_OPTIONS)[number];

export const DEFAULT_ALARM_FORM_VALUES: Omit<AlarmFormData, "startDate"> = {
  title: "",
  description: "",
  repeat: false,
  repeatType: "days",
  repeatEvery: 1,
  daysOfWeek: [],
  ends: "never",
  endsOnDate: undefined,
  endsAfter: undefined,
  isActive: true,
  severityLevel: "INFORMATIONAL",
  ledPattern: "BLINK_SLOW",
  ledColor: "BLUE",
  vibrationPattern: "QUICK",
  vibrationIntensity: "MEDIUM",
  snoozePeriod: 5,
  snoozeTimeout: 15,
  retriggerDelay: 1,
  retriggerTimeout: 5,
  pushNotification: true,
  emailNotification: false,
};
