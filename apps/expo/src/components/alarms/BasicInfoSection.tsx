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
  isActive?: boolean; // Optional to support editing existing alarms
  // BLE Protocol fields (consolidated - these replace legacy color, priority, hapticChoice)
  severityLevel: "INFORMATIONAL" | "WARNING" | "CRITICAL";
  ledPattern: "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE";
  ledColor: "OFF" | "RED" | "GREEN" | "BLUE" | "YELLOW" | "MAGENTA" | "CYAN" | "WHITE";
  vibrationPattern: "QUICK" | "HEARTBEAT" | "RAPID" | "SYMPHONY"; // 0-3: quick, heartbeat, rapid, symphony
  vibrationIntensity: "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
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
    <View style={[cards.base, { marginBottom: spacing[4] }]}>
      {/* Title Input */}
      <View style={{ marginBottom: spacing[2] }}>
        <Text
          style={[
            typography.label,
            { marginBottom: spacing[2] },
            showTitleError && { color: colors.error[500] },
          ]}
        >
          Alarm Name *
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
          placeholder="e.g., Take Medication, Morning Reminder"
          placeholderTextColor={colors.text.secondary}
        />
        {showTitleError && (
          <Text
            style={[
              typography.caption,
              { color: colors.error[500], marginTop: spacing[1] },
            ]}
          >
            Alarm name is required
          </Text>
        )}
      </View>
    </View>
  );
}
