/**
 * BasicInfoSection Component
 *
 * Reusable form section for alarm basic information (title, description, color).
 * Used by both add and edit alarm forms.
 */

import React from "react";
import { Text, TextInput, View } from "react-native";

import { cards, colors, inputs, spacing, typography } from "~/styles";

export interface AlarmFormData {
  title: string;
  description: string;
  startDate: Date;
  repeat: boolean;
  repeatType: "minutes" | "hours" | "days" | "weeks";
  repeatEvery: number;
  daysOfWeek: string[];
  ends: "never" | "on" | "after";
  endsOnDate?: Date;
  endsAfter?: number;
  // BLE Protocol fields (consolidated - these replace legacy color, priority, hapticChoice)
  severityLevel: "INFORMATIONAL" | "WARNING" | "CRITICAL";
  ledPattern: "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE";
  ledColor: "RED" | "GREEN" | "BLUE" | "YELLOW" | "MAGENTA" | "CYAN" | "WHITE";
  vibrationPattern: number; // 1-63
  vibrationIntensity: "LOW" | "MEDIUM" | "HIGH";
  snoozePeriod: number; // minutes
  snoozeTimeout: number; // minutes
  retriggerDelay: number; // minutes
  retriggerTimeout: number; // minutes
}

// COLOR_OPTIONS removed - LED colors are now handled in AdvancedSection

interface BasicInfoSectionProps {
  formData: AlarmFormData;
  onUpdateFormData: (updates: Partial<AlarmFormData>) => void;
  showValidationErrors?: boolean;
}

export function BasicInfoSection({
  formData,
  onUpdateFormData,
  showValidationErrors = false,
}: BasicInfoSectionProps) {
  const isTitleEmpty = formData.title.trim().length === 0;
  const showTitleError = showValidationErrors && isTitleEmpty;
  return (
    <View style={[cards.base, { marginBottom: spacing[6] }]}>
      <Text style={[typography.h4, { marginBottom: spacing[4] }]}>
        Basic Information
      </Text>

      {/* Title Input */}
      <View style={{ marginBottom: spacing[4] }}>
        <Text
          style={[
            typography.label,
            { marginBottom: spacing[2] },
            showTitleError && { color: colors.error[500] },
          ]}
        >
          Title *
        </Text>
        <TextInput
          style={[
            inputs.base,
            showTitleError && {
              borderColor: colors.error[500],
              borderWidth: 2,
            },
          ]}
          value={formData.title}
          onChangeText={(text) => onUpdateFormData({ title: text })}
          placeholder="Enter alarm title"
          placeholderTextColor={colors.text.secondary}
        />
        {showTitleError && (
          <Text
            style={[
              typography.caption,
              { color: colors.error[500], marginTop: spacing[1] },
            ]}
          >
            Title is required
          </Text>
        )}
      </View>

      {/* Description Input */}
      <View style={{ marginBottom: spacing[4] }}>
        <Text style={[typography.label, { marginBottom: spacing[2] }]}>
          Description
        </Text>
        <TextInput
          style={[inputs.base, { height: 80, textAlignVertical: "top" }]}
          value={formData.description}
          onChangeText={(text) => onUpdateFormData({ description: text })}
          placeholder="Enter description (optional)"
          placeholderTextColor={colors.text.secondary}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Color selection moved to AdvancedSection as LED Color */}
    </View>
  );
}
