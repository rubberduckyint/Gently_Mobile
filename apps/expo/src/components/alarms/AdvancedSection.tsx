/**
 * AdvancedSection Component
 *
 * Reusable form section for advanced alarm settings based on the BLE protocol.
 * Includes severity levels, LED patterns, vibration options, and snooze settings.
 * Used by both add and edit alarm forms.
 */

import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { AlarmFormData } from "./BasicInfoSection";
import { cards, colors, inputs, spacing, typography } from "~/styles";

interface AdvancedSectionProps {
  formData: AlarmFormData;
  onUpdateFormData: (updates: Partial<AlarmFormData>) => void;
}

// Define option types with descriptions
const SEVERITY_OPTIONS = [
  {
    key: "CRITICAL" as const,
    label: "Critical",
    description: "Highest priority - Cannot be snoozed or dismissed on device",
    icon: "alert-circle" as const,
    color: colors.error[500],
  },
  {
    key: "WARNING" as const,
    label: "Warning",
    description:
      "High priority - Can be snoozed but cannot be dismissed on device",
    icon: "warning" as const,
    color: colors.warning[500],
  },
  {
    key: "INFORMATIONAL" as const,
    label: "Informational",
    description: "Standard priority - Can be snoozed and dismissed on device",
    icon: "information-circle" as const,
    color: colors.primary[500],
  },
] as const;

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
    label: "Medium",
    description: "Moderate vibration",
    icon: "remove" as const,
  },
  {
    key: "HIGH" as const,
    label: "High",
    description: "Strong vibration",
    icon: "reorder-three" as const,
  },
] as const;

export function AdvancedSection({
  formData,
  onUpdateFormData,
}: AdvancedSectionProps) {
  const canSnooze = formData.severityLevel !== "CRITICAL";

  return (
    <View style={[cards.base, { marginBottom: spacing[6] }]}>
      <Text style={[typography.h4, { marginBottom: spacing[4] }]}>
        Bracelet Settings
      </Text>

      {/* Severity Level */}
      <View style={{ marginBottom: spacing[6] }}>
        <Text style={[typography.label, { marginBottom: spacing[3] }]}>
          Severity Level
        </Text>
        <View style={{ gap: spacing[3] }}>
          {SEVERITY_OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => onUpdateFormData({ severityLevel: option.key })}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                paddingVertical: spacing[3],
                paddingHorizontal: spacing[4],
                borderRadius: 12,
                borderWidth: 2,
                borderColor:
                  formData.severityLevel === option.key
                    ? option.color
                    : colors.border.light,
                backgroundColor:
                  formData.severityLevel === option.key
                    ? `${option.color}15`
                    : colors.background.secondary,
              }}
            >
              <Ionicons
                name={option.icon}
                size={24}
                color={option.color}
                style={{ marginRight: spacing[3], marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    typography.body,
                    {
                      color: option.color,
                      marginBottom: spacing[1],
                      fontWeight: "600",
                    },
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, lineHeight: 18 },
                  ]}
                >
                  {option.description}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Snooze Settings - Only show if applicable */}
      {canSnooze && (
        <View style={{ marginBottom: spacing[6] }}>
          <Text style={[typography.label, { marginBottom: spacing[3] }]}>
            Snooze Settings
          </Text>
          <View
            style={{
              backgroundColor: colors.background.secondary,
              padding: spacing[4],
              borderRadius: 12,
              gap: spacing[4],
            }}
          >
            <View>
              <Text
                style={[
                  typography.body,
                  { marginBottom: spacing[2], fontWeight: "600" },
                ]}
              >
                Snooze Period: {formData.snoozePeriod} minutes
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginBottom: spacing[3] },
                ]}
              >
                How long the alarm stays quiet after snoozing
              </Text>
              <TextInput
                style={[inputs.base]}
                value={formData.snoozePeriod.toString()}
                onChangeText={(text) => {
                  const value = parseInt(text) || 0;
                  onUpdateFormData({
                    snoozePeriod: Math.max(1, Math.min(60, value)),
                  });
                }}
                keyboardType="numeric"
                placeholder="5"
                placeholderTextColor={colors.text.secondary}
              />
            </View>
            <View>
              <Text
                style={[
                  typography.body,
                  { marginBottom: spacing[2], fontWeight: "600" },
                ]}
              >
                Snooze Timeout: {formData.snoozeTimeout} minutes
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginBottom: spacing[3] },
                ]}
              >
                How long snooze is available after the alarm triggers
              </Text>
              <TextInput
                style={[inputs.base]}
                value={formData.snoozeTimeout.toString()}
                onChangeText={(text) => {
                  const value = parseInt(text) || 0;
                  onUpdateFormData({
                    snoozeTimeout: Math.max(1, Math.min(120, value)),
                  });
                }}
                keyboardType="numeric"
                placeholder="15"
                placeholderTextColor={colors.text.secondary}
              />
            </View>
          </View>
        </View>
      )}

      {/* LED Pattern */}
      <View style={{ marginBottom: spacing[6] }}>
        <Text style={[typography.label, { marginBottom: spacing[3] }]}>
          LED Pattern
        </Text>
        <View style={{ gap: spacing[2] }}>
          {LED_PATTERNS.map((pattern) => (
            <Pressable
              key={pattern.key}
              onPress={() => onUpdateFormData({ ledPattern: pattern.key })}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: spacing[3],
                paddingHorizontal: spacing[4],
                borderRadius: 8,
                backgroundColor:
                  formData.ledPattern === pattern.key
                    ? colors.primary[50]
                    : "transparent",
                borderWidth: 1,
                borderColor:
                  formData.ledPattern === pattern.key
                    ? colors.primary[500]
                    : colors.border.light,
              }}
            >
              <Ionicons
                name={pattern.icon}
                size={20}
                color={
                  formData.ledPattern === pattern.key
                    ? colors.primary[500]
                    : colors.text.secondary
                }
                style={{ marginRight: spacing[3] }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    typography.body,
                    {
                      color:
                        formData.ledPattern === pattern.key
                          ? colors.primary[500]
                          : colors.text.primary,
                      fontWeight:
                        formData.ledPattern === pattern.key ? "600" : "400",
                    },
                  ]}
                >
                  {pattern.label}
                </Text>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginTop: 2 },
                  ]}
                >
                  {pattern.description}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* LED Color */}
      <View style={{ marginBottom: spacing[6] }}>
        <Text style={[typography.label, { marginBottom: spacing[3] }]}>
          LED Color
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing[3],
          }}
        >
          {LED_COLORS.map((colorOption) => (
            <Pressable
              key={colorOption.key}
              onPress={() => onUpdateFormData({ ledColor: colorOption.key })}
              style={{
                alignItems: "center",
                paddingVertical: spacing[2],
                paddingHorizontal: spacing[3],
                borderRadius: 8,
                borderWidth: 2,
                borderColor:
                  formData.ledColor === colorOption.key
                    ? colors.primary[500]
                    : colors.border.light,
                backgroundColor:
                  formData.ledColor === colorOption.key
                    ? colors.primary[50]
                    : colors.background.secondary,
                minWidth: 60,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: colorOption.color,
                  marginBottom: spacing[1],
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              />
              <Text
                style={[
                  typography.caption,
                  {
                    color:
                      formData.ledColor === colorOption.key
                        ? colors.primary[500]
                        : colors.text.secondary,
                    fontWeight:
                      formData.ledColor === colorOption.key ? "600" : "400",
                  },
                ]}
              >
                {colorOption.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Vibration Settings */}
      <View style={{ marginBottom: spacing[6] }}>
        <Text style={[typography.label, { marginBottom: spacing[3] }]}>
          Vibration Intensity
        </Text>
        <View style={{ gap: spacing[2] }}>
          {VIBRATION_INTENSITIES.map((intensity) => (
            <Pressable
              key={intensity.key}
              onPress={() =>
                onUpdateFormData({ vibrationIntensity: intensity.key })
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: spacing[3],
                paddingHorizontal: spacing[4],
                borderRadius: 8,
                backgroundColor:
                  formData.vibrationIntensity === intensity.key
                    ? colors.primary[50]
                    : "transparent",
                borderWidth: 1,
                borderColor:
                  formData.vibrationIntensity === intensity.key
                    ? colors.primary[500]
                    : colors.border.light,
              }}
            >
              <Ionicons
                name={intensity.icon}
                size={20}
                color={
                  formData.vibrationIntensity === intensity.key
                    ? colors.primary[500]
                    : colors.text.secondary
                }
                style={{ marginRight: spacing[3] }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    typography.body,
                    {
                      color:
                        formData.vibrationIntensity === intensity.key
                          ? colors.primary[500]
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
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginTop: 2 },
                  ]}
                >
                  {intensity.description}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Vibration Pattern */}
      <View style={{ marginBottom: spacing[6] }}>
        <Text style={[typography.label, { marginBottom: spacing[3] }]}>
          Vibration Pattern
        </Text>
        <View
          style={{
            backgroundColor: colors.background.secondary,
            padding: spacing[4],
            borderRadius: 12,
          }}
        >
          <Text
            style={[
              typography.body,
              { marginBottom: spacing[2], fontWeight: "600" },
            ]}
          >
            Pattern: {formData.vibrationPattern}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.text.secondary, marginBottom: spacing[3] },
            ]}
          >
            Choose a vibration pattern (1-63). Different numbers create unique
            vibration sequences.
          </Text>
          <TextInput
            style={[inputs.base]}
            value={formData.vibrationPattern.toString()}
            onChangeText={(text) => {
              const value = parseInt(text) || 1;
              onUpdateFormData({
                vibrationPattern: Math.max(1, Math.min(63, value)),
              });
            }}
            keyboardType="numeric"
            placeholder="1"
            placeholderTextColor={colors.text.secondary}
          />
        </View>
      </View>
    </View>
  );
}
