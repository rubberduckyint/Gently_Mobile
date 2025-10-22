/**
 * Alarm Preferences Section
 * UI component for managing user's default alarm settings
 * Matches the design and behavior of the AdvancedSection in alarm forms
 */

import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { buttons, buttonText, colors, spacing, typography } from "~/styles";

interface AlarmPreferencesSectionProps {
  ledPattern: "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE";
  setLedPattern: (
    value: "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE",
  ) => void;
  ledColor: "RED" | "GREEN" | "BLUE" | "YELLOW" | "MAGENTA" | "CYAN" | "WHITE";
  setLedColor: (
    value: "RED" | "GREEN" | "BLUE" | "YELLOW" | "MAGENTA" | "CYAN" | "WHITE",
  ) => void;
  vibrationIntensity: "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
  setVibrationIntensity: (value: "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM") => void;
  snoozePeriod: string;
  setSnoozePeriod: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

// Constants matching AdvancedSection
const LED_PATTERNS = [
  {
    key: "SOLID" as const,
    label: "Solid",
    description: "Continuous steady light",
    icon: "ellipse" as const,
  },
  {
    key: "BLINK_SLOW" as const,
    label: "Slow Blink",
    description: "Gentle pulsing light",
    icon: "ellipse-outline" as const,
  },
  {
    key: "BLINK_FAST" as const,
    label: "Fast Blink",
    description: "Rapid attention-getting flashes",
    icon: "flash" as const,
  },
  {
    key: "PULSE" as const,
    label: "Pulse",
    description: "Smooth breathing effect",
    icon: "heart" as const,
  },
  {
    key: "STROBE" as const,
    label: "Strobe",
    description: "Intense flashing pattern",
    icon: "flash-outline" as const,
  },
] as const;

const LED_COLORS = [
  { key: "RED" as const, label: "Red", color: colors.error[500] },
  { key: "GREEN" as const, label: "Green", color: colors.success[500] },
  { key: "BLUE" as const, label: "Blue", color: colors.primary[500] },
  { key: "YELLOW" as const, label: "Yellow", color: colors.warning[400] },
  { key: "MAGENTA" as const, label: "Magenta", color: "#FF1493" },
  { key: "CYAN" as const, label: "Cyan", color: "#00BFFF" },
  { key: "WHITE" as const, label: "White", color: colors.gray[100] },
] as const;

const VIBRATION_INTENSITIES = [
  {
    key: "LOW" as const,
    label: "Low",
    description: "Gentle vibration",
    icon: "radio-button-off" as const,
  },
  {
    key: "MEDIUM" as const,
    label: "Med",
    description: "Moderate vibration",
    icon: "remove" as const,
  },
  {
    key: "HIGH" as const,
    label: "High",
    description: "Strong vibration",
    icon: "reorder-three" as const,
  },
  {
    key: "MAXIMUM" as const,
    label: "Max",
    description: "Maximum vibration",
    icon: "reorder-four" as const,
  },
] as const;

export function AlarmPreferencesSection({
  ledPattern,
  setLedPattern,
  ledColor,
  setLedColor,
  vibrationIntensity,
  setVibrationIntensity,
  snoozePeriod,
  setSnoozePeriod,
  onSave,
  isSaving,
}: AlarmPreferencesSectionProps) {
  const currentLedPattern = LED_PATTERNS.find((p) => p.key === ledPattern);
  const currentVibrationIntensity = VIBRATION_INTENSITIES.find(
    (v) => v.key === vibrationIntensity,
  );

  const SNOOZE_OPTIONS = [1, 3, 5, 10, 15] as const;

  return (
    <View>
      {/* Snooze Settings - Button Options */}
      <View style={{ marginBottom: spacing[4] }}>
        <Text style={[typography.label, { marginBottom: spacing[2] }]}>
          Snooze Period
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: spacing[2],
          }}
        >
          {SNOOZE_OPTIONS.map((minutes) => {
            const currentSnooze = parseInt(snoozePeriod);
            const isSelected = currentSnooze === minutes;

            return (
              <Pressable
                key={minutes}
                onPress={() => setSnoozePeriod(minutes.toString())}
                style={{
                  flex: 1,
                  paddingVertical: spacing[3],
                  paddingHorizontal: spacing[2],
                  borderRadius: 8,
                  backgroundColor: isSelected
                    ? colors.primary[500]
                    : colors.background.secondary,
                  borderWidth: 1,
                  borderColor: isSelected
                    ? colors.primary[500]
                    : colors.border.light,
                  alignItems: "center",
                }}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: isSelected
                        ? colors.background.primary
                        : colors.text.primary,
                      fontWeight: isSelected ? "600" : "400",
                    },
                  ]}
                >
                  {minutes}m
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Light Pattern */}
      <View style={{ marginBottom: spacing[4] }}>
        <Text style={[typography.label, { marginBottom: spacing[2] }]}>
          Light Pattern
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: spacing[2],
            marginBottom: spacing[2],
          }}
        >
          {LED_PATTERNS.map((pattern) => (
            <Pressable
              key={pattern.key}
              onPress={() => setLedPattern(pattern.key)}
              style={{
                flex: 1,
                paddingVertical: spacing[2],
                paddingHorizontal: spacing[1],
                borderRadius: 8,
                backgroundColor:
                  ledPattern === pattern.key
                    ? colors.primary[500]
                    : colors.background.secondary,
                borderWidth: 1,
                borderColor:
                  ledPattern === pattern.key
                    ? colors.primary[500]
                    : colors.border.light,
                alignItems: "center",
              }}
            >
              <Ionicons
                name={pattern.icon}
                size={20}
                color={
                  ledPattern === pattern.key
                    ? colors.background.primary
                    : colors.text.secondary
                }
              />
            </Pressable>
          ))}
        </View>
        <Text
          style={[
            typography.caption,
            { color: colors.text.secondary, lineHeight: 18 },
          ]}
        >
          {currentLedPattern?.description}
        </Text>
      </View>

      {/* LED Color */}
      <View style={{ marginBottom: spacing[4] }}>
        <Text style={[typography.label, { marginBottom: spacing[2] }]}>
          Light Color
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: spacing[2],
          }}
        >
          {LED_COLORS.map((colorOption) => (
            <Pressable
              key={colorOption.key}
              onPress={() => setLedColor(colorOption.key)}
              style={{
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                aspectRatio: 1,
                maxWidth: 50,
                borderRadius: 25,
                borderWidth: 3,
                borderColor:
                  ledColor === colorOption.key
                    ? colors.primary[500]
                    : colors.border.light,
                backgroundColor: colorOption.color,
              }}
            />
          ))}
        </View>
      </View>

      {/* Vibration Intensity */}
      <View style={{ marginBottom: spacing[4] }}>
        <Text style={[typography.label, { marginBottom: spacing[2] }]}>
          Vibration Strength
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: spacing[2],
            marginBottom: spacing[2],
          }}
        >
          {VIBRATION_INTENSITIES.map((intensity) => (
            <Pressable
              key={intensity.key}
              onPress={() => setVibrationIntensity(intensity.key)}
              style={{
                flex: 1,
                paddingVertical: spacing[3],
                paddingHorizontal: spacing[2],
                borderRadius: 8,
                backgroundColor:
                  vibrationIntensity === intensity.key
                    ? colors.primary[500]
                    : colors.background.secondary,
                borderWidth: 1,
                borderColor:
                  vibrationIntensity === intensity.key
                    ? colors.primary[500]
                    : colors.border.light,
                alignItems: "center",
              }}
            >
              <Text
                style={[
                  typography.caption,
                  {
                    color:
                      vibrationIntensity === intensity.key
                        ? colors.background.primary
                        : colors.text.primary,
                    fontWeight:
                      vibrationIntensity === intensity.key ? "600" : "400",
                  },
                ]}
              >
                {intensity.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text
          style={[
            typography.caption,
            { color: colors.text.secondary, lineHeight: 18 },
          ]}
        >
          {currentVibrationIntensity?.description}
        </Text>
      </View>

      {/* Save Button */}
      <Pressable
        style={[
          buttons.base,
          buttons.large,
          buttons.primary,
          isSaving && buttons.disabled,
          { marginTop: spacing[2] },
        ]}
        onPress={onSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color={colors.text.inverse} />
        ) : (
          <Text style={buttonText.primary}>Save Alarm Preferences</Text>
        )}
      </Pressable>
    </View>
  );
}
