/**
 * Edit Alarm Page
 *
 * Simplified page for editing an existing alarm using the unified AlarmForm component.
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AlarmFormData } from "~/components/alarms";
import { AlarmForm } from "~/components/alarms";
import { useBLE } from "~/contexts/BLEContext";
import { colors, containers, spacing, typography } from "~/styles";
import { trpc } from "~/utils/api";
import {
  mapLegacyVibrationPatternToEnum,
  mapVibrationPatternToLegacyNumber,
} from "~/utils/bleAlarmUtils";

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

// Parse cron expression to extract repeat settings
const parseCronExpression = (
  cronExpression: string,
): {
  repeatType: "minutes" | "hours" | "days" | "weeks";
  repeatEvery: number;
  daysOfWeek: string[];
} => {
  const parts = cronExpression.split(" ");
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  // Check for weekly pattern (specific days of week)
  if (dayOfWeek && dayOfWeek !== "*") {
    return {
      repeatType: "weeks",
      repeatEvery: 1,
      daysOfWeek: dayOfWeek.split(","),
    };
  }

  // Check for daily pattern
  if (dayOfMonth?.includes("/")) {
    const regex = /\*\/(\d+)/;
    const match = regex.exec(dayOfMonth);
    return {
      repeatType: "days",
      repeatEvery: match?.[1] ? parseInt(match[1], 10) : 1,
      daysOfWeek: [],
    };
  }

  // Check for hourly pattern
  if (hour?.includes("/")) {
    const regex = /\*\/(\d+)/;
    const match = regex.exec(hour);
    return {
      repeatType: "hours",
      repeatEvery: match?.[1] ? parseInt(match[1], 10) : 1,
      daysOfWeek: [],
    };
  }

  // Check for minute pattern
  if (minute?.includes("/")) {
    const regex = /\*\/(\d+)/;
    const match = regex.exec(minute);
    return {
      repeatType: "minutes",
      repeatEvery: match?.[1] ? parseInt(match[1], 10) : 1,
      daysOfWeek: [],
    };
  }

  // Default to daily
  return {
    repeatType: "days",
    repeatEvery: 1,
    daysOfWeek: [],
  };
};

export default function EditAlarmPage() {
  const { deviceId, alarmId } = useLocalSearchParams<{
    deviceId: string;
    alarmId: string;
  }>();
  const [formData, setFormData] = useState<AlarmFormData | null>(null);
  const initializedRef = useRef(false);
  const queryClient = useQueryClient();
  const { connectionState } = useBLE();

  const {
    data: alarm,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["alarm", "getById", { id: alarmId }],
    queryFn: async () => {
      return await trpc.alarm.getById.query({ id: alarmId });
    },
    enabled: !!alarmId,
  });

  // Convert alarm data to form data structure
  const convertAlarmToFormData = (alarm: {
    title: string;
    description?: string | null;
    startDate: string | Date;
    endDate?: string | Date | null;
    repeat: boolean;
    cronExpression: string;
    isActive?: boolean;
    severityLevel: "CRITICAL" | "WARNING" | "INFORMATIONAL";
    ledPattern: "OFF" | "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE";
    ledColor:
      | "RED"
      | "GREEN"
      | "BLUE"
      | "YELLOW"
      | "MAGENTA"
      | "CYAN"
      | "WHITE";
    vibrationPattern: number;
    vibrationIntensity: "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
    snoozePeriod: number;
    snoozeTimeout: number;
    retriggerDelay: number;
    retriggerTimeout: number;
  }): AlarmFormData => {
    let startDate: Date;
    try {
      startDate = new Date(alarm.startDate);
      if (isNaN(startDate.getTime())) {
        console.warn("Invalid start date received:", alarm.startDate);
        startDate = new Date();
      }
    } catch (error) {
      console.error("Error parsing start date:", error, alarm.startDate);
      startDate = new Date();
    }

    let endsOnDate: Date | undefined;
    if (alarm.endDate) {
      try {
        endsOnDate = new Date(alarm.endDate);
        if (isNaN(endsOnDate.getTime())) {
          console.warn("Invalid end date received:", alarm.endDate);
          endsOnDate = undefined;
        }
      } catch (error) {
        console.error("Error parsing end date:", error, alarm.endDate);
        endsOnDate = undefined;
      }
    }

    // Parse cron expression to get repeat settings
    const { repeatType, repeatEvery, daysOfWeek } = alarm.repeat
      ? parseCronExpression(alarm.cronExpression)
      : { repeatType: "days" as const, repeatEvery: 1, daysOfWeek: [] };

    return {
      title: alarm.title,
      description: alarm.description ?? "",
      startDate,
      repeat: alarm.repeat,
      repeatType,
      repeatEvery,
      daysOfWeek,
      ends: endsOnDate ? "on" : "never",
      endsOnDate,
      endsAfter: undefined,
      isActive: alarm.isActive ?? true,
      severityLevel: alarm.severityLevel,
      ledPattern: alarm.ledPattern,
      ledColor: alarm.ledColor,
      vibrationPattern: mapLegacyVibrationPatternToEnum(alarm.vibrationPattern),
      vibrationIntensity: alarm.vibrationIntensity,
      snoozePeriod: alarm.snoozePeriod,
      snoozeTimeout: alarm.snoozeTimeout,
      retriggerDelay: alarm.retriggerDelay,
      retriggerTimeout: alarm.retriggerTimeout,
    };
  };

  // Convert alarm data to form data when alarm is loaded
  useEffect(() => {
    if (alarm && !initializedRef.current) {
      const convertedFormData = convertAlarmToFormData(alarm);
      setFormData(convertedFormData);
      initializedRef.current = true;
    }
  }, [alarm]);

  const updateAlarmMutation = useMutation({
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

      if (!alarmId) {
        throw new Error("Alarm ID is required");
      }

      const result = await trpc.alarm.update.mutate({
        id: alarmId,
        title: data.title,
        description: data.description || undefined,
        isActive: data.isActive ?? true,
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
      });

      // Mark as NOT_SYNCED to ensure sync happens even when disabled
      await trpc.alarm.update.mutate({
        id: alarmId,
        syncStatus: "NOT_SYNCED" as const,
      });

      return result;
    },
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: ["alarm", "getById", { id: alarmId }],
      });
      void queryClient.invalidateQueries({
        queryKey: ["device", "getById", { id: deviceId }],
      });

      // Check if device is connected
      if (connectionState === "connected") {
        Alert.alert("Success", "Alarm updated and will sync automatically!", [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]);
      } else {
        Alert.alert(
          "Alarm Updated",
          "Your alarm has been updated successfully. Connect to your Gently bracelet to sync the changes.",
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
      console.error("❌ Failed to update alarm:", error);
      Alert.alert("Error", `Failed to update alarm: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!alarmId) {
        throw new Error("Alarm ID is required");
      }
      return await trpc.alarm.delete.mutate({ id: alarmId });
    },
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: ["alarm", "getById", { id: alarmId }],
      });
      void queryClient.invalidateQueries({
        queryKey: ["device", "getById", { id: deviceId }],
      });
      router.back();
    },
    onError: (error) => {
      console.error("❌ Failed to delete alarm:", error);
      Alert.alert("Error", `Failed to delete alarm: ${error.message}`);
    },
  });

  if (!deviceId || !alarmId) {
    Alert.alert("Error", "Device ID and Alarm ID are required");
    router.back();
    return null;
  }

  const handleSave = (data: AlarmFormData) => {
    if (!data.title.trim()) {
      Alert.alert("Error", "Alarm title is required");
      return;
    }
    updateAlarmMutation.mutate(data);
  };

  const handleDeleteAlarm = () => {
    Alert.alert(
      "Delete Alarm",
      "Are you sure you want to delete this alarm? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  };

  if (isLoading || !formData) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing[6],
            paddingVertical: spacing[4],
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{ padding: spacing[2] }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Edit Alarm
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <View style={containers.contentCentered}>
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: spacing[8],
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.primary[100],
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing[4],
              }}
            >
              <ActivityIndicator size="large" color={colors.primary[500]} />
            </View>
            <Text
              style={[
                typography.h3,
                {
                  color: colors.text.primary,
                  marginBottom: spacing[2],
                  textAlign: "center",
                },
              ]}
            >
              Loading Alarm
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, textAlign: "center" },
              ]}
            >
              Please wait...
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !alarm) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing[6],
            paddingVertical: spacing[4],
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{ padding: spacing[2] }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Edit Alarm
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <View
          style={[
            containers.contentCentered,
            { alignItems: "center", paddingHorizontal: spacing[8] },
          ]}
        >
          <Text
            style={[
              typography.h5,
              {
                color: colors.error[600],
                marginBottom: spacing[2],
                textAlign: "center",
              },
            ]}
          >
            Failed to load alarm
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, textAlign: "center" },
            ]}
          >
            {error?.message ?? "Unknown error occurred"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.safeArea}>
      <View
        style={{
          paddingHorizontal: spacing[6],
          paddingVertical: spacing[4],
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          backgroundColor: colors.background.primary,
        }}
      >
        {/* Header Row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: spacing[3],
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              padding: spacing[2],
              marginLeft: -spacing[2],
            })}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </Pressable>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text
              style={[
                typography.h3,
                {
                  color: colors.text.primary,
                  textAlign: "center",
                },
              ]}
            >
              Edit Alarm
            </Text>
          </View>

          <Pressable
            onPress={handleDeleteAlarm}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              padding: spacing[2],
              marginRight: -spacing[2],
            })}
          >
            <Ionicons name="trash-outline" size={24} color={colors.error[500]} />
          </Pressable>
        </View>

        {/* Enable/Disable Toggle */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: colors.background.secondary,
            padding: spacing[3],
            borderRadius: 8,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={[
                typography.label,
                { color: colors.text.primary, marginBottom: 2 },
              ]}
            >
              {formData.isActive ? "Alarm Enabled" : "Alarm Disabled"}
            </Text>
            <Text style={[typography.caption, { color: colors.text.secondary }]}>
              {formData.isActive
                ? "This alarm is active and will trigger"
                : "This alarm is paused and won't trigger"}
            </Text>
          </View>
          <Switch
            value={formData.isActive ?? true}
            onValueChange={(value) => {
              setFormData((prev) => ({ ...prev, isActive: value }));
            }}
            trackColor={{
              false: colors.gray[300],
              true: colors.primary[500],
            }}
            thumbColor={colors.background.primary}
            ios_backgroundColor={colors.gray[300]}
          />
        </View>
      </View>

      <AlarmForm
        initialData={formData}
        onSave={handleSave}
        onCancel={() => router.back()}
        isLoading={updateAlarmMutation.isPending}
        saveButtonText="Update Alarm"
        showTemplates={false}
      />
    </SafeAreaView>
  );
}
