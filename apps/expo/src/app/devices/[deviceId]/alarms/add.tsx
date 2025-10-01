/**
 * Add Alarm Page
 *
 * Single-page form for creating a new alarm for a specific device.
 * All settings are displayed on one scrollable page for better UX.
 */

import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { AlarmFormData } from "~/components/alarms";
import {
  AdvancedSection,
  BasicInfoSection,
  ScheduleSection,
} from "~/components/alarms";
import { Header } from "~/components/ui/Header";
import { buttons, buttonText, colors, containers, spacing } from "~/styles";
import { trpc } from "~/utils/api";

const getDefaultFormData = (): AlarmFormData => {
  const now = new Date();
  const defaultStart = new Date(now.getTime() + 60000); // 1 minute from now

  return {
    title: "",
    description: "",
    startDate: defaultStart,
    repeat: false,
    repeatType: "days",
    repeatEvery: 1,
    daysOfWeek: [],
    ends: "never",
    endsOnDate: undefined,
    endsAfter: undefined,
    // BLE Protocol defaults (consolidated - replaces legacy color, priority, hapticChoice)
    severityLevel: "INFORMATIONAL",
    ledPattern: "BLINK_SLOW",
    ledColor: "BLUE",
    vibrationPattern: 1,
    vibrationIntensity: "MEDIUM",
    snoozePeriod: 5, // 5 minutes
    snoozeTimeout: 15, // 15 minutes
    retriggerDelay: 1, // 1 minute
    retriggerTimeout: 5, // 5 minutes
  };
};

// Generate cron expression from form data
const generateCronExpression = (formData: AlarmFormData): string => {
  const { startDate, repeat, repeatType, repeatEvery, daysOfWeek } = formData;
  const minute = startDate.getMinutes();
  const hour = startDate.getHours();
  const day = startDate.getDate();
  const month = startDate.getMonth() + 1;

  if (!repeat) {
    // One-time alarm
    return `${minute} ${hour} ${day} ${month} *`;
  }

  switch (repeatType) {
    case "minutes":
      return `*/${repeatEvery} * * * *`;
    case "hours":
      return `${minute} */${repeatEvery} * * *`;
    case "days":
      return `${minute} ${hour} */${repeatEvery} * *`;
    case "weeks": {
      const days = daysOfWeek.length > 0 ? daysOfWeek.join(",") : "*";
      return `${minute} ${hour} * * ${days}`;
    }
    default:
      return `${minute} ${hour} ${day} ${month} *`;
  }
};

export default function AddAlarmPage() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const [formData, setFormData] = useState<AlarmFormData>(getDefaultFormData());
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const queryClient = useQueryClient();

  const createAlarmMutation = useMutation({
    mutationFn: async (data: AlarmFormData) => {
      // Validate start date
      if (isNaN(data.startDate.getTime())) {
        throw new Error("Invalid start date");
      }

      // Validate end date if provided
      let endDate: string | undefined;
      if (data.ends === "on" && data.endsOnDate) {
        if (isNaN(data.endsOnDate.getTime())) {
          throw new Error("Invalid end date");
        }
        endDate = data.endsOnDate.toISOString();
      }

      const cronExpression = generateCronExpression(data);

      return await trpc.alarm.create.mutate({
        title: data.title,
        description: data.description || undefined,
        isActive: true,
        startDate: data.startDate.toISOString(),
        endDate,
        repeat: data.repeat,
        cronExpression,
        // BLE Protocol fields (consolidated - replaces legacy color, priority, hapticChoice)
        severityLevel: data.severityLevel,
        ledPattern: data.ledPattern,
        ledColor: data.ledColor,
        vibrationPattern: data.vibrationPattern,
        vibrationIntensity: data.vibrationIntensity,
        snoozePeriod: data.snoozePeriod,
        snoozeTimeout: data.snoozeTimeout,
        retriggerDelay: data.retriggerDelay,
        retriggerTimeout: data.retriggerTimeout,
        deviceId,
      });
    },
    onSuccess: () => {
      // Invalidate device data to refetch alarms
      void queryClient.invalidateQueries({
        queryKey: ["device", "getById", { id: deviceId }],
      });

      Alert.alert("Success", "Alarm created successfully!", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to create alarm: ${error.message}`);
    },
  });

  if (!deviceId) {
    Alert.alert("Error", "Device ID is required");
    router.back();
    return null;
  }

  const updateFormData = (updates: Partial<AlarmFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = () => {
    // Validate required fields
    if (!formData.title.trim()) {
      Alert.alert("Error", "Alarm title is required");
      return;
    }

    createAlarmMutation.mutate(formData);
  };

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header title="Add New Alarm" showBackButton={true} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: spacing[6],
          paddingBottom: spacing[20],
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Basic Information Section */}
        <BasicInfoSection
          formData={formData}
          onUpdateFormData={updateFormData}
        />

        {/* Schedule Section */}
        <ScheduleSection
          formData={formData}
          onUpdateFormData={updateFormData}
          showStartTimePicker={showStartTimePicker}
          onToggleStartTimePicker={() =>
            setShowStartTimePicker(!showStartTimePicker)
          }
          showEndDatePicker={showEndDatePicker}
          onToggleEndDatePicker={() => setShowEndDatePicker(!showEndDatePicker)}
        />

        {/* Advanced Settings Section */}
        <AdvancedSection
          formData={formData}
          onUpdateFormData={updateFormData}
        />
      </ScrollView>

      {/* Fixed Save Button */}
      <View
        style={{
          padding: spacing[6],
          paddingTop: spacing[4],
          borderTopWidth: 1,
          borderTopColor: colors.border.light,
          backgroundColor: colors.background.primary,
        }}
      >
        <Pressable
          style={[
            buttons.base,
            buttons.primary,
            createAlarmMutation.isPending && { opacity: 0.5 },
          ]}
          onPress={handleSave}
          disabled={createAlarmMutation.isPending || !formData.title.trim()}
        >
          <Text style={[buttonText.primary]}>
            {createAlarmMutation.isPending ? "Creating..." : "Create Alarm"}
          </Text>
        </Pressable>
      </View>

      {/* Date/Time Pickers */}
      {showStartTimePicker && (
        <DateTimePicker
          value={formData.startDate}
          mode="time"
          display="default"
          onChange={(event, selectedDate) => {
            setShowStartTimePicker(false);
            if (selectedDate) {
              updateFormData({ startDate: selectedDate });
            }
          }}
        />
      )}

      {showEndDatePicker && (
        <DateTimePicker
          value={formData.endsOnDate ?? new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowEndDatePicker(false);
            if (selectedDate) {
              updateFormData({ endsOnDate: selectedDate });
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}
