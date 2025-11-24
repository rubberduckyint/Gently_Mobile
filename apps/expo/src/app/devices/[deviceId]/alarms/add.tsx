/**
 * Add Alarm Page
 *
 * Simplified page for creating a new alarm using the unified AlarmForm component.
 */

import React from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AlarmFormData } from "~/components/alarms";
import { AlarmForm } from "~/components/alarms";
import { Header } from "~/components/ui/Header";
import { useBLE } from "~/contexts/BLEContext";
import { colors, containers, spacing, typography } from "~/styles";
import { trpc } from "~/utils/api";
import { mapVibrationPatternToLegacyNumber } from "~/utils/bleAlarmUtils";

const getDefaultFormData = (userPreferences?: {
  defaultSeverityLevel: "CRITICAL" | "WARNING" | "INFORMATIONAL";
  defaultLedPattern: "OFF" | "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE";
  defaultLedColor:
    | "RED"
    | "GREEN"
    | "BLUE"
    | "YELLOW"
    | "MAGENTA"
    | "CYAN"
    | "WHITE";
  defaultVibrationPattern: number;
  defaultVibrationIntensity: "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
  defaultSnoozePeriod: number;
  defaultSnoozeTimeout: number;
  defaultRetriggerDelay: number;
  defaultRetriggerTimeout: number;
}): AlarmFormData => {
  const now = new Date();
  const defaultStart = new Date(now.getTime() + 300000); // 5 minutes from now

  // Map vibration pattern number to enum
  // Based on BLE protocol: 1-8=QUICK, 9-16=HEARTBEAT, 17-32=RAPID, 33-63=SYMPHONY
  const getVibrationPatternEnum = (
    pattern: number,
  ): AlarmFormData["vibrationPattern"] => {
    if (pattern >= 1 && pattern <= 8) return "QUICK";
    if (pattern >= 9 && pattern <= 16) return "HEARTBEAT";
    if (pattern >= 17 && pattern <= 32) return "RAPID";
    if (pattern >= 33 && pattern <= 63) return "SYMPHONY";
    return "QUICK"; // Default
  };

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
    // Use user preferences if available, otherwise use defaults
    severityLevel: userPreferences?.defaultSeverityLevel ?? "INFORMATIONAL",
    ledPattern: userPreferences?.defaultLedPattern ?? "BLINK_SLOW",
    ledColor: userPreferences?.defaultLedColor ?? "BLUE",
    vibrationPattern: getVibrationPatternEnum(
      userPreferences?.defaultVibrationPattern ?? 1,
    ),
    vibrationIntensity: userPreferences?.defaultVibrationIntensity ?? "MEDIUM",
    snoozePeriod: userPreferences?.defaultSnoozePeriod ?? 5,
    snoozeTimeout: userPreferences?.defaultSnoozeTimeout ?? 15,
    retriggerDelay: userPreferences?.defaultRetriggerDelay ?? 1,
    retriggerTimeout: userPreferences?.defaultRetriggerTimeout ?? 5,
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
  const { connectionState } = useBLE();

  // Fetch user preferences
  const { data: userPreferences, isLoading: isLoadingPreferences } = useQuery({
    queryKey: ["userPreferences", "get"],
    queryFn: async () => {
      return await trpc.userPreferences.get.query({});
    },
  });

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

      // Check if device is connected
      if (connectionState === "connected") {
        Alert.alert("Success", "Alarm created and will sync automatically!", [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]);
      } else {
        Alert.alert(
          "Alarm Created",
          "Your alarm has been created successfully. Connect to your Gently bracelet to sync it to your device.",
          [
            {
              text: "OK",
              onPress: () => router.back(),
            },
          ],
        );
      }
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

  if (isLoadingPreferences) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="Add New Alarm" showBackButton={true} />
        <View style={[containers.contentCentered]}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text
            style={[
              typography.body,
              {
                marginTop: spacing[3],
                color: colors.gray[500],
                textAlign: "center",
              },
            ]}
          >
            Loading preferences...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header title="Add New Alarm" showBackButton={true} />
      <AlarmForm
        initialData={getDefaultFormData(userPreferences)}
        onSave={handleSave}
        onCancel={() => router.back()}
        isLoading={createAlarmMutation.isPending}
        saveButtonText="Create Alarm"
      />
    </SafeAreaView>
  );
}
