/**
 * Add Alarm Page
 *
 * Simplified page for creating a new alarm using the unified AlarmForm component.
 */

import React from "react";
import { Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { AlarmFormData } from "~/components/alarms";
import { AlarmForm } from "~/components/alarms";
import { Header } from "~/components/ui/Header";
import { containers } from "~/styles";
import { trpc } from "~/utils/api";
import { mapVibrationPatternToLegacyNumber } from "~/utils/bleAlarmUtils";

const getDefaultFormData = (): AlarmFormData => {
  const now = new Date();
  const defaultStart = new Date(now.getTime() + 300000); // 5 minutes from now

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
    // BLE Protocol defaults
    severityLevel: "INFORMATIONAL",
    ledPattern: "BLINK_SLOW",
    ledColor: "BLUE",
    vibrationPattern: "QUICK",
    vibrationIntensity: "MEDIUM",
    snoozePeriod: 5,
    snoozeTimeout: 120,
    retriggerDelay: 5, // Same as snooze period
    retriggerTimeout: 120,
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
  const queryClient = useQueryClient();

  const createAlarmMutation = useMutation({
    mutationFn: async (data: AlarmFormData) => {
      if (isNaN(data.startDate.getTime())) {
        throw new Error("Invalid start date");
      }

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
        severityLevel: data.severityLevel,
        ledPattern: data.ledPattern,
        ledColor: data.ledColor,
        vibrationPattern: mapVibrationPatternToLegacyNumber(
          data.vibrationPattern,
        ),
        vibrationIntensity: data.vibrationIntensity,
        snoozePeriod: data.snoozePeriod,
        snoozeTimeout: data.snoozeTimeout,
        retriggerDelay: data.retriggerDelay,
        retriggerTimeout: data.retriggerTimeout,
        deviceId,
      });
    },
    onSuccess: () => {
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
      console.error("❌ Failed to create alarm:", error);
      Alert.alert("Error", `Failed to create alarm: ${error.message}`);
    },
  });

  if (!deviceId) {
    Alert.alert("Error", "Device ID is required");
    router.back();
    return null;
  }

  const handleSave = (data: AlarmFormData) => {
    if (!data.title.trim()) {
      Alert.alert("Error", "Alarm title is required");
      return;
    }
    createAlarmMutation.mutate(data);
  };

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header title="Add New Alarm" showBackButton={true} />
      <AlarmForm
        initialData={getDefaultFormData()}
        onSave={handleSave}
        onCancel={() => router.back()}
        isLoading={createAlarmMutation.isPending}
        saveButtonText="Create Alarm"
      />
    </SafeAreaView>
  );
}
