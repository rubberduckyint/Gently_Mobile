import React from "react";
import { Pressable, Text, View } from "react-native";

import type { AlarmFormData } from "../[deviceId]";
import {
  buttons,
  buttonText,
  cards,
  colors,
  flex,
  inputs,
  spacing,
} from "~/styles";
import { StepLayout } from "./StepLayout";

interface AdvancedStepProps {
  formData: AlarmFormData;
  onUpdate: (updates: Partial<AlarmFormData>) => void;
  onNext: () => void;
  onPrevious: () => void;
}

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low", color: colors.success[500] },
  { value: "MEDIUM", label: "Medium", color: colors.warning[500] },
  { value: "HIGH", label: "High", color: colors.error[500] },
] as const;

const HAPTIC_OPTIONS = [
  {
    value: "STANDARD",
    label: "Standard",
    description: "Default haptic feedback",
  },
  { value: "STRONG", label: "Strong", description: "Intense vibration" },
  { value: "SOFT", label: "Soft", description: "Gentle vibration" },
  { value: "DOUBLE", label: "Double", description: "Two quick pulses" },
  { value: "PULSE", label: "Pulse", description: "Rhythmic pulsing" },
  { value: "WAVE", label: "Wave", description: "Gradual wave pattern" },
] as const;

export function AdvancedStep({
  formData,
  onUpdate,
  onNext,
  onPrevious,
}: AdvancedStepProps) {
  return (
    <StepLayout
      title="Advanced Settings"
      subtitle="Customize priority and haptic feedback"
      navigation={
        <View style={[flex.row, flex.justifyBetween]}>
          <Pressable
            style={[buttons.base, buttons.secondary, { flex: 0.45 }]}
            onPress={onPrevious}
          >
            <Text style={[buttonText.secondary]}>Previous</Text>
          </Pressable>

          <Pressable
            style={[buttons.base, buttons.primary, { flex: 0.45 }]}
            onPress={onNext}
          >
            <Text style={[buttonText.primary]}>Review</Text>
          </Pressable>
        </View>
      }
    >
      <View style={[cards.base, { marginBottom: spacing[6] }]}>
        {/* Priority */}
        <View style={inputs.container}>
          <Text style={inputs.label}>Priority</Text>
          <Text
            style={[
              {
                color: colors.text.secondary,
                fontSize: 14,
                marginBottom: spacing[3],
              },
            ]}
          >
            Higher priority alarms may override system settings
          </Text>
          <View style={[flex.row, { gap: spacing[2] }]}>
            {PRIORITY_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  buttons.base,
                  formData.priority === option.value
                    ? buttons.primary
                    : buttons.secondary,
                  { flex: 1 },
                ]}
                onPress={() => onUpdate({ priority: option.value })}
              >
                <View style={[flex.row, flex.itemsCenter, { gap: spacing[2] }]}>
                  <View
                    style={[
                      {
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: option.color,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      formData.priority === option.value
                        ? buttonText.primary
                        : buttonText.secondary,
                      { fontSize: 14 },
                    ]}
                  >
                    {option.label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Haptic Choice */}
        <View style={inputs.container}>
          <Text style={inputs.label}>Haptic Feedback</Text>
          <Text
            style={[
              {
                color: colors.text.secondary,
                fontSize: 14,
                marginBottom: spacing[3],
              },
            ]}
          >
            Choose how your device will vibrate for this alarm
          </Text>
          <View style={{ gap: spacing[2] }}>
            {HAPTIC_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  {
                    borderWidth: 1,
                    borderColor:
                      formData.hapticChoice === option.value
                        ? colors.primary[500]
                        : colors.border.medium,
                    backgroundColor:
                      formData.hapticChoice === option.value
                        ? colors.primary[50]
                        : colors.background.secondary,
                    paddingHorizontal: spacing[4],
                    paddingVertical: spacing[3],
                    borderRadius: 8,
                  },
                ]}
                onPress={() => onUpdate({ hapticChoice: option.value })}
              >
                <View style={[flex.row, flex.itemsCenter, flex.justifyBetween]}>
                  <View>
                    <Text
                      style={[
                        {
                          fontSize: 16,
                          fontWeight: "600",
                          color:
                            formData.hapticChoice === option.value
                              ? colors.primary[700]
                              : colors.text.primary,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        {
                          fontSize: 14,
                          color:
                            formData.hapticChoice === option.value
                              ? colors.primary[600]
                              : colors.text.secondary,
                          marginTop: spacing[1],
                        },
                      ]}
                    >
                      {option.description}
                    </Text>
                  </View>
                  <View
                    style={[
                      {
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor:
                          formData.hapticChoice === option.value
                            ? colors.primary[500]
                            : colors.border.medium,
                        backgroundColor:
                          formData.hapticChoice === option.value
                            ? colors.primary[500]
                            : "transparent",
                      },
                    ]}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </StepLayout>
  );
}
