import React from "react";
import { Pressable, Switch, Text, View } from "react-native";

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

interface ScheduleStepProps {
  formData: AlarmFormData;
  onUpdate: (updates: Partial<AlarmFormData>) => void;
  onNext: () => void;
  onPrevious: () => void;
}

const REPEAT_TYPE_OPTIONS = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
] as const;

const DAYS_OF_WEEK = [
  { value: "1", label: "Monday", short: "Mon" },
  { value: "2", label: "Tuesday", short: "Tue" },
  { value: "3", label: "Wednesday", short: "Wed" },
  { value: "4", label: "Thursday", short: "Thu" },
  { value: "5", label: "Friday", short: "Fri" },
  { value: "6", label: "Saturday", short: "Sat" },
  { value: "0", label: "Sunday", short: "Sun" },
];

const ENDS_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "on", label: "On Date" },
  { value: "after", label: "After Occurrences" },
] as const;

export function ScheduleStep({
  formData,
  onUpdate,
  onNext,
  onPrevious,
}: ScheduleStepProps) {
  const toggleDayOfWeek = (day: string) => {
    const newDaysOfWeek = formData.daysOfWeek.includes(day)
      ? formData.daysOfWeek.filter((d) => d !== day)
      : [...formData.daysOfWeek, day];
    onUpdate({ daysOfWeek: newDaysOfWeek });
  };

  return (
    <StepLayout
      title="Schedule"
      subtitle="Set when your alarm should activate"
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
            <Text style={[buttonText.primary]}>Next</Text>
          </Pressable>
        </View>
      }
    >
      <View style={[cards.base, { marginBottom: spacing[6] }]}>
        {/* Start Date/Time - simplified for now */}
        <View style={inputs.container}>
          <Text style={inputs.label}>Start Time</Text>
          <View
            style={[
              {
                borderWidth: 1,
                borderColor: colors.border.medium,
                backgroundColor: colors.background.secondary,
                paddingHorizontal: spacing[4],
                paddingVertical: spacing[4],
                borderRadius: 8,
              },
            ]}
          >
            <Text style={{ color: colors.text.primary, fontSize: 16 }}>
              {formData.startDate.toLocaleString()}
            </Text>
          </View>
          <Text
            style={{
              color: colors.text.tertiary,
              fontSize: 12,
              marginTop: spacing[1],
            }}
          >
            Time selection will be improved in a future update
          </Text>
        </View>

        {/* Repeat Toggle */}
        <View
          style={[
            inputs.container,
            flex.row,
            flex.itemsCenter,
            flex.justifyBetween,
          ]}
        >
          <Text style={inputs.label}>Repeat</Text>
          <Switch
            value={formData.repeat}
            onValueChange={(repeat) => onUpdate({ repeat })}
            trackColor={{ false: colors.gray[300], true: colors.primary[500] }}
            thumbColor={colors.background.secondary}
          />
        </View>

        {/* Repeat Settings */}
        {formData.repeat && (
          <>
            {/* Repeat Type */}
            <View style={inputs.container}>
              <Text style={inputs.label}>Repeat Every</Text>
              <View style={[flex.row, { gap: spacing[2] }]}>
                {REPEAT_TYPE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[
                      buttons.base,
                      formData.repeatType === option.value
                        ? buttons.primary
                        : buttons.secondary,
                      { flex: 1 },
                    ]}
                    onPress={() => onUpdate({ repeatType: option.value })}
                  >
                    <Text
                      style={[
                        formData.repeatType === option.value
                          ? buttonText.primary
                          : buttonText.secondary,
                        { fontSize: 14 },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Days of Week (for weekly repeat) */}
            {formData.repeatType === "weeks" && (
              <View style={inputs.container}>
                <Text style={inputs.label}>Days of Week</Text>
                <View style={[flex.row, flex.wrap, { gap: spacing[2] }]}>
                  {DAYS_OF_WEEK.map((day) => (
                    <Pressable
                      key={day.value}
                      style={[
                        buttons.base,
                        buttons.small,
                        formData.daysOfWeek.includes(day.value)
                          ? buttons.primary
                          : buttons.secondary,
                        { flex: 0, minWidth: 50 },
                      ]}
                      onPress={() => toggleDayOfWeek(day.value)}
                    >
                      <Text
                        style={[
                          formData.daysOfWeek.includes(day.value)
                            ? buttonText.primary
                            : buttonText.secondary,
                          buttonText.small,
                        ]}
                      >
                        {day.short}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Ends */}
            <View style={inputs.container}>
              <Text style={inputs.label}>Ends</Text>
              <View style={[flex.row, { gap: spacing[2] }]}>
                {ENDS_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[
                      buttons.base,
                      formData.ends === option.value
                        ? buttons.primary
                        : buttons.secondary,
                      { flex: 1 },
                    ]}
                    onPress={() => onUpdate({ ends: option.value })}
                  >
                    <Text
                      style={[
                        formData.ends === option.value
                          ? buttonText.primary
                          : buttonText.secondary,
                        { fontSize: 14 },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* End Date (if selected) - simplified for now */}
            {formData.ends === "on" && (
              <View style={inputs.container}>
                <Text style={inputs.label}>End Date</Text>
                <View
                  style={[
                    {
                      borderWidth: 1,
                      borderColor: colors.border.medium,
                      backgroundColor: colors.background.secondary,
                      paddingHorizontal: spacing[4],
                      paddingVertical: spacing[4],
                      borderRadius: 8,
                    },
                  ]}
                >
                  <Text style={{ color: colors.text.primary, fontSize: 16 }}>
                    {formData.endsOnDate
                      ? formData.endsOnDate.toLocaleDateString()
                      : "Select date"}
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.text.tertiary,
                    fontSize: 12,
                    marginTop: spacing[1],
                  }}
                >
                  Date selection will be improved in a future update
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </StepLayout>
  );
}
