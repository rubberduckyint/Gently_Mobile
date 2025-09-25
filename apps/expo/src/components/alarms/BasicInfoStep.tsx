import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { AlarmFormData } from "../../app/devices/[deviceId]/alarms/add";
import {
  buttons,
  buttonText,
  cards,
  colors,
  flex,
  inputs,
  spacing,
  typography,
} from "~/styles";
import { StepLayout } from "./StepLayout";

interface BasicInfoStepProps {
  formData: AlarmFormData;
  onUpdate: (updates: Partial<AlarmFormData>) => void;
  onNext: () => void;
  onCancel: () => void;
}

const COLOR_OPTIONS = [
  "#007AFF", // Blue
  "#34C759", // Green
  "#FF9500", // Orange
  "#FF3B30", // Red
  "#AF52DE", // Purple
  "#FF2D92", // Pink
  "#5AC8FA", // Light Blue
  "#FFCC00", // Yellow
];

export function BasicInfoStep({
  formData,
  onUpdate,
  onNext,
  onCancel,
}: BasicInfoStepProps) {
  const [titleFocused, setTitleFocused] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);

  const canProceed = formData.title.trim().length > 0;

  return (
    <StepLayout
      title="Basic Information"
      subtitle="Give your alarm a name and choose how it looks"
      navigation={
        <View style={[flex.row, flex.justifyBetween]}>
          <Pressable
            style={[buttons.base, buttons.secondary, { flex: 0.45 }]}
            onPress={onCancel}
          >
            <Text style={[buttonText.secondary]}>Cancel</Text>
          </Pressable>

          <Pressable
            style={[
              buttons.base,
              buttons.primary,
              { flex: 0.45 },
              !canProceed && buttons.disabled,
            ]}
            onPress={onNext}
            disabled={!canProceed}
          >
            <Text style={[buttonText.primary]}>Next</Text>
          </Pressable>
        </View>
      }
    >
      <View style={[cards.base, { marginBottom: spacing[6] }]}>
        {/* Title */}
        <View style={inputs.container}>
          <Text style={inputs.label}>Alarm Title *</Text>
          <TextInput
            style={[
              inputs.base,
              titleFocused && {
                borderColor: colors.border.focus,
                borderWidth: 2,
              },
              !canProceed && formData.title.length > 0
                ? { borderColor: colors.border.error }
                : {},
            ]}
            value={formData.title}
            onChangeText={(text) => onUpdate({ title: text })}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => setTitleFocused(false)}
            placeholder="e.g. Morning Wake Up"
            placeholderTextColor={colors.text.tertiary}
            maxLength={50}
          />
          <Text style={[typography.caption, { color: colors.text.tertiary }]}>
            {formData.title.length}/50 characters
          </Text>
        </View>

        {/* Description */}
        <View style={inputs.container}>
          <Text style={inputs.label}>Description (Optional)</Text>
          <TextInput
            style={[
              inputs.base,
              { height: 80, textAlignVertical: "top" },
              descriptionFocused && {
                borderColor: colors.border.focus,
                borderWidth: 2,
              },
            ]}
            value={formData.description}
            onChangeText={(text) => onUpdate({ description: text })}
            onFocus={() => setDescriptionFocused(true)}
            onBlur={() => setDescriptionFocused(false)}
            placeholder="Add a description for your alarm..."
            placeholderTextColor={colors.text.tertiary}
            multiline
            maxLength={128}
          />
          <Text style={[typography.caption, { color: colors.text.tertiary }]}>
            {formData.description.length}/128 characters
          </Text>
        </View>

        {/* Color Selection */}
        <View style={inputs.container}>
          <Text style={inputs.label}>Color</Text>
          <View style={[flex.row, flex.wrap, { gap: spacing[3] }]}>
            {COLOR_OPTIONS.map((color) => (
              <Pressable
                key={color}
                style={[
                  {
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: color,
                    borderWidth: formData.color === color ? 3 : 1,
                    borderColor:
                      formData.color === color
                        ? colors.primary[500]
                        : colors.border.light,
                  },
                ]}
                onPress={() => onUpdate({ color })}
              />
            ))}
          </View>
        </View>
      </View>
    </StepLayout>
  );
}
