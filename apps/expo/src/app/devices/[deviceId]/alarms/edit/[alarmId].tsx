/**
 * Edit Alarm Page
 *
 * Single-page form for editing an existing alarm for a specific device.
 * All settings are displayed on one scrollable page for better UX.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AlarmFormData } from "~/components/alarms";
import {
  AdvancedSection,
  BasicInfoSection,
  ScheduleSection,
} from "~/components/alarms";
import { Header } from "~/components/ui/Header";
import {
  buttons,
  buttonText,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";

export default function EditAlarmPage() {
  const { deviceId, alarmId } = useLocalSearchParams<{
    deviceId: string;
    alarmId: string;
  }>();
  const [formData, setFormData] = useState<AlarmFormData | null>(null);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const queryClient = useQueryClient();

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

  // Convert alarm data to form data when alarm is loaded
  useEffect(() => {
    if (alarm && !formData) {
      const convertedFormData = convertAlarmToFormData(alarm);
      setFormData(convertedFormData);
    }
  }, [alarm, formData]);

  const updateAlarmMutation = useMutation({
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

      if (!alarmId) {
        throw new Error("Alarm ID is required");
      }

      return await trpc.alarm.update.mutate({
        id: alarmId,
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
      });
    },
    onSuccess: () => {
      // Remove the specific alarm query from cache
      queryClient.removeQueries({
        queryKey: ["alarm", "getById", { id: alarmId }],
      });
      // Invalidate device queries to refresh alarm lists
      void queryClient.invalidateQueries({
        queryKey: ["device", "getById", { id: deviceId }],
      });

      Alert.alert("Success", "Alarm updated successfully!", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    },
    onError: (error) => {
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
      // Remove the specific alarm query from cache
      queryClient.removeQueries({
        queryKey: ["alarm", "getById", { id: alarmId }],
      });
      // Invalidate device queries to refresh alarm lists
      void queryClient.invalidateQueries({
        queryKey: ["device", "getById", { id: deviceId }],
      });
      router.back();
    },
  });

  // Convert alarm data to form data structure
  const convertAlarmToFormData = (alarm: {
    title: string;
    description?: string | null;
    startDate: string | Date;
    endDate?: string | Date | null;
    repeat: boolean;
    // BLE Protocol fields (consolidated schema)
    severityLevel: "CRITICAL" | "WARNING" | "INFORMATIONAL";
    ledPattern: "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE";
    ledColor:
      | "RED"
      | "GREEN"
      | "BLUE"
      | "YELLOW"
      | "MAGENTA"
      | "CYAN"
      | "WHITE";
    vibrationPattern: number;
    vibrationIntensity: "LOW" | "MEDIUM" | "HIGH";
    snoozePeriod: number;
    snoozeTimeout: number;
    retriggerDelay: number;
    retriggerTimeout: number;
  }): AlarmFormData => {
    // Safely parse the start date with validation
    let startDate: Date;
    try {
      startDate = new Date(alarm.startDate);
      // Check if the date is valid
      if (isNaN(startDate.getTime())) {
        console.warn("Invalid start date received:", alarm.startDate);
        startDate = new Date(); // Fallback to current date
      }
    } catch (error) {
      console.error("Error parsing start date:", error, alarm.startDate);
      startDate = new Date(); // Fallback to current date
    }

    // Safely parse the end date with validation
    let endsOnDate: Date | undefined;
    if (alarm.endDate) {
      try {
        endsOnDate = new Date(alarm.endDate);
        // Check if the date is valid
        if (isNaN(endsOnDate.getTime())) {
          console.warn("Invalid end date received:", alarm.endDate);
          endsOnDate = undefined;
        }
      } catch (error) {
        console.error("Error parsing end date:", error, alarm.endDate);
        endsOnDate = undefined;
      }
    }

    return {
      title: alarm.title,
      description: alarm.description ?? "",
      startDate,
      repeat: alarm.repeat,
      repeatType: "days", // Default - could be parsed from cron if needed
      repeatEvery: 1,
      daysOfWeek: [],
      ends: endsOnDate ? "on" : "never",
      endsOnDate,
      endsAfter: undefined,
      // BLE Protocol fields (consolidated schema)
      severityLevel: alarm.severityLevel,
      ledPattern: alarm.ledPattern,
      ledColor: alarm.ledColor,
      vibrationPattern: alarm.vibrationPattern,
      vibrationIntensity: alarm.vibrationIntensity,
      snoozePeriod: alarm.snoozePeriod,
      snoozeTimeout: alarm.snoozeTimeout,
      retriggerDelay: alarm.retriggerDelay,
      retriggerTimeout: alarm.retriggerTimeout,
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

  if (!deviceId || !alarmId) {
    Alert.alert("Error", "Device ID and Alarm ID are required");
    router.back();
    return null;
  }

  const updateFormData = (updates: Partial<AlarmFormData>) => {
    setFormData((prev: AlarmFormData | null) =>
      prev ? { ...prev, ...updates } : null,
    );
  };

  const handleSave = () => {
    if (!formData) return;

    // Validate required fields
    if (!formData.title.trim()) {
      Alert.alert("Error", "Alarm title is required");
      return;
    }

    updateAlarmMutation.mutate(formData);
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
        <Header title="Edit Alarm" showBackButton={true} />
        <View style={containers.contentCentered}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text
            style={[
              typography.body,
              { marginTop: spacing[3], color: colors.gray[500] },
            ]}
          >
            Loading alarm...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !alarm) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="Edit Alarm" showBackButton={true} />
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
      {/* Custom header with delete button */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing[6],
          paddingVertical: spacing[4],
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          backgroundColor: colors.background.primary,
        }}
      >
        {/* Left side - Back button */}
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

        {/* Center - Title */}
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

        {/* Right side - Delete button */}
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
            updateAlarmMutation.isPending && { opacity: 0.5 },
          ]}
          onPress={handleSave}
          disabled={updateAlarmMutation.isPending || !formData.title.trim()}
        >
          <Text style={[buttonText.primary]}>
            {updateAlarmMutation.isPending ? "Updating..." : "Update Alarm"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
