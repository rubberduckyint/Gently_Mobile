/**
 * AdvancedSection Component
 *
 * Reusable form section for advanced alarm settings based on the BLE protocol.
 * Includes severity levels, LED patterns, vibration options, and snooze settings.
 * Used by both add and edit alarm forms.
 */

import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { AlarmFormData } from "./BasicInfoSection";
import { cards, colors, spacing, typography } from "~/styles";

interface AdvancedSectionProps {
  formData: AlarmFormData;
  onUpdateFormData: (updates: Partial<AlarmFormData>) => void;
}

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
  { key: "MAGENTA" as const, label: "Magenta", color: "#FF1493" }, // Use direct hex for magenta
  { key: "CYAN" as const, label: "Cyan", color: "#00BFFF" }, // Use direct hex for cyan
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

const VIBRATION_PATTERNS = [
  {
    key: "QUICK" as const,
    label: "Quick",
    description: "Short, sharp vibrations",
    icon: "flash" as const,
  },
  {
    key: "HEARTBEAT" as const,
    label: "Heartbeat",
    description: "Rhythmic double pulses",
    icon: "heart" as const,
  },
  {
    key: "RAPID" as const,
    label: "Rapid",
    description: "Fast continuous pulses",
    icon: "pulse" as const,
  },
  {
    key: "SYMPHONY" as const,
    label: "Symphony",
    description: "Complex musical pattern",
    icon: "musical-notes" as const,
  },
] as const;

export function AdvancedSection({
  formData,
  onUpdateFormData,
}: AdvancedSectionProps) {
  // Get current selection descriptions
  const currentLedPattern = LED_PATTERNS.find(
    (p) => p.key === formData.ledPattern,
  );
  const currentVibrationPattern = VIBRATION_PATTERNS.find(
    (p) => p.key === formData.vibrationPattern,
  );
  const currentVibrationIntensity = VIBRATION_INTENSITIES.find(
    (i) => i.key === formData.vibrationIntensity,
  );

  const SNOOZE_OPTIONS = [1, 3, 5, 10, 15] as const;

  return (
    <View style={[cards.base, { marginBottom: spacing[4] }]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing[2],
          marginBottom: spacing[4],
        }}
      >
        <Ionicons name="watch" size={20} color={colors.primary[500]} />
        <Text style={[typography.h4]}>Bracelet Settings</Text>
      </View>

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
          {SNOOZE_OPTIONS.map((minutes) => (
            <Pressable
              key={minutes}
              onPress={() =>
                onUpdateFormData({
                  snoozePeriod: minutes,
                  retriggerDelay: minutes,
                })
              }
              style={{
                flex: 1,
                paddingVertical: spacing[3],
                paddingHorizontal: spacing[2],
                borderRadius: 8,
                backgroundColor:
                  formData.snoozePeriod === minutes
                    ? colors.primary[500]
                    : colors.background.secondary,
                borderWidth: 1,
                borderColor:
                  formData.snoozePeriod === minutes
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
                      formData.snoozePeriod === minutes
                        ? colors.background.primary
                        : colors.text.primary,
                    fontWeight:
                      formData.snoozePeriod === minutes ? "600" : "400",
                  },
                ]}
              >
                {minutes}m
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Light Pattern - Compact Horizontal */}
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
              onPress={() => onUpdateFormData({ ledPattern: pattern.key })}
              style={{
                flex: 1,
                paddingVertical: spacing[2],
                paddingHorizontal: spacing[1],
                borderRadius: 8,
                backgroundColor:
                  formData.ledPattern === pattern.key
                    ? colors.primary[500]
                    : colors.background.secondary,
                borderWidth: 1,
                borderColor:
                  formData.ledPattern === pattern.key
                    ? colors.primary[500]
                    : colors.border.light,
                alignItems: "center",
              }}
            >
              <Ionicons
                name={pattern.icon}
                size={20}
                color={
                  formData.ledPattern === pattern.key
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
              onPress={() => onUpdateFormData({ ledColor: colorOption.key })}
              style={{
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                aspectRatio: 1,
                maxWidth: 50,
                borderRadius: 25,
                borderWidth: 3,
                borderColor:
                  formData.ledColor === colorOption.key
                    ? colors.primary[500]
                    : colors.border.light,
                backgroundColor: colorOption.color,
              }}
            />
          ))}
        </View>
      </View>

      {/* Vibration Intensity - Compact Horizontal */}
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
              onPress={() =>
                onUpdateFormData({ vibrationIntensity: intensity.key })
              }
              style={{
                flex: 1,
                paddingVertical: spacing[3],
                paddingHorizontal: spacing[2],
                borderRadius: 8,
                backgroundColor:
                  formData.vibrationIntensity === intensity.key
                    ? colors.primary[500]
                    : colors.background.secondary,
                borderWidth: 1,
                borderColor:
                  formData.vibrationIntensity === intensity.key
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
                      formData.vibrationIntensity === intensity.key
                        ? colors.background.primary
                        : colors.text.primary,
                    fontWeight:
                      formData.vibrationIntensity === intensity.key
                        ? "600"
                        : "400",
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

      {/* Vibration Pattern - Compact Horizontal */}
      <View style={{ marginBottom: 0 }}>
        <Text style={[typography.label, { marginBottom: spacing[2] }]}>
          Vibration Pattern
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: spacing[2],
            marginBottom: spacing[2],
          }}
        >
          {VIBRATION_PATTERNS.map((pattern) => (
            <Pressable
              key={pattern.key}
              onPress={() =>
                onUpdateFormData({ vibrationPattern: pattern.key })
              }
              style={{
                flex: 1,
                paddingVertical: spacing[2],
                paddingHorizontal: spacing[1],
                borderRadius: 8,
                backgroundColor:
                  formData.vibrationPattern === pattern.key
                    ? colors.primary[500]
                    : colors.background.secondary,
                borderWidth: 1,
                borderColor:
                  formData.vibrationPattern === pattern.key
                    ? colors.primary[500]
                    : colors.border.light,
                alignItems: "center",
              }}
            >
              <Ionicons
                name={pattern.icon}
                size={20}
                color={
                  formData.vibrationPattern === pattern.key
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
          {currentVibrationPattern?.description}
        </Text>
      </View>
    </View>
  );
}
