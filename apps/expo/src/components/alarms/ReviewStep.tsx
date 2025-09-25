import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { AlarmFormData } from "../../app/devices/[deviceId]/alarms/add";
import {
  buttons,
  buttonText,
  cards,
  colors,
  flex,
  spacing,
  typography,
} from "~/styles";
import { StepLayout } from "./StepLayout";

interface ReviewStepProps {
  formData: AlarmFormData;
  onFinish: () => void;
  onPrevious: () => void;
  isLoading: boolean;
}

const formatHapticChoice = (haptic: string) => {
  switch (haptic) {
    case "STANDARD":
      return "Standard";
    case "STRONG":
      return "Strong";
    case "SOFT":
      return "Soft";
    case "DOUBLE":
      return "Double";
    case "PULSE":
      return "Pulse";
    case "WAVE":
      return "Wave";
    default:
      return haptic;
  }
};

const formatRepeatSettings = (formData: AlarmFormData) => {
  if (!formData.repeat) {
    return "No repeat (One-time alarm)";
  }

  let result = `Every ${formData.repeatEvery} ${formData.repeatType}`;

  if (formData.repeatType === "weeks" && formData.daysOfWeek.length > 0) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const selectedDays = formData.daysOfWeek
      .map((day) => dayNames[parseInt(day)] ?? day)
      .join(", ");
    result += ` on ${selectedDays}`;
  }

  if (formData.ends === "on" && formData.endsOnDate) {
    result += ` until ${formData.endsOnDate.toLocaleDateString()}`;
  } else if (formData.ends === "after" && formData.endsAfter) {
    result += ` for ${formData.endsAfter} occurrences`;
  }

  return result;
};

export function ReviewStep({
  formData,
  onFinish,
  onPrevious,
  isLoading,
}: ReviewStepProps) {
  return (
    <StepLayout
      title="Review Alarm"
      subtitle="Check your alarm settings before creating"
      navigation={
        <View style={[flex.row, flex.justifyBetween]}>
          <Pressable
            style={[buttons.base, buttons.secondary, { flex: 0.45 }]}
            onPress={onPrevious}
          >
            <Text style={[buttonText.secondary]}>Previous</Text>
          </Pressable>

          <Pressable
            style={[
              buttons.base,
              buttons.primary,
              { flex: 0.45 },
              isLoading && buttons.disabled,
            ]}
            onPress={onFinish}
            disabled={isLoading}
          >
            {isLoading ? (
              <View style={[flex.row, flex.itemsCenter, { gap: spacing[2] }]}>
                <ActivityIndicator size="small" color={colors.text.inverse} />
                <Text style={[buttonText.primary]}>Creating...</Text>
              </View>
            ) : (
              <Text style={[buttonText.primary]}>Create Alarm</Text>
            )}
          </Pressable>
        </View>
      }
    >
      <View style={[cards.base, { marginBottom: spacing[6] }]}>
        {/* Basic Info */}
        <View style={[{ marginBottom: spacing[4] }]}>
          <Text style={[typography.h4, { marginBottom: spacing[2] }]}>
            Basic Information
          </Text>

          <View
            style={[
              flex.row,
              flex.itemsCenter,
              flex.justifyBetween,
              { marginBottom: spacing[2] },
            ]}
          >
            <Text style={[typography.label]}>Title:</Text>
            <Text style={[typography.body, { flex: 1, textAlign: "right" }]}>
              {formData.title}
            </Text>
          </View>

          {formData.description && (
            <View
              style={[
                flex.row,
                flex.itemsCenter,
                flex.justifyBetween,
                { marginBottom: spacing[2] },
              ]}
            >
              <Text style={[typography.label]}>Description:</Text>
              <Text style={[typography.body, { flex: 1, textAlign: "right" }]}>
                {formData.description}
              </Text>
            </View>
          )}

          <View
            style={[
              flex.row,
              flex.itemsCenter,
              flex.justifyBetween,
              { marginBottom: spacing[2] },
            ]}
          >
            <Text style={[typography.label]}>Color:</Text>
            <View style={[flex.row, flex.itemsCenter, { gap: spacing[2] }]}>
              <View
                style={[
                  {
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: formData.color,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  },
                ]}
              />
              <Text style={[typography.body]}>{formData.color}</Text>
            </View>
          </View>
        </View>

        {/* Schedule */}
        <View style={[{ marginBottom: spacing[4] }]}>
          <Text style={[typography.h4, { marginBottom: spacing[2] }]}>
            Schedule
          </Text>

          <View
            style={[
              flex.row,
              flex.itemsCenter,
              flex.justifyBetween,
              { marginBottom: spacing[2] },
            ]}
          >
            <Text style={[typography.label]}>Start Time:</Text>
            <Text style={[typography.body]}>
              {formData.startDate.toLocaleString()}
            </Text>
          </View>

          <View style={[flex.row, { marginBottom: spacing[2] }]}>
            <Text style={[typography.label, { flex: 0.3 }]}>Repeat:</Text>
            <Text style={[typography.body, { flex: 0.7, textAlign: "right" }]}>
              {formatRepeatSettings(formData)}
            </Text>
          </View>
        </View>

        {/* Advanced Settings */}
        <View>
          <Text style={[typography.h4, { marginBottom: spacing[2] }]}>
            Advanced Settings
          </Text>

          <View
            style={[
              flex.row,
              flex.itemsCenter,
              flex.justifyBetween,
              { marginBottom: spacing[2] },
            ]}
          >
            <Text style={[typography.label]}>Priority:</Text>
            <Text style={[typography.body]}>{formData.priority}</Text>
          </View>

          <View style={[flex.row, flex.itemsCenter, flex.justifyBetween]}>
            <Text style={[typography.label]}>Haptic Feedback:</Text>
            <Text style={[typography.body]}>
              {formatHapticChoice(formData.hapticChoice)}
            </Text>
          </View>
        </View>
      </View>
    </StepLayout>
  );
}
