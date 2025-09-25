/**
 * Edit Alarm Page
 *
 * Multi-step form for editing an existing alarm within a device context.
 * Steps:
 * 1. Basic Info - title, description, color
 * 2. Schedule - start time, repeat settings
 * 3. Advanced - priority, haptic feedback
 * 4. Review - confirm all settings before update
 *
 * Reuses the same form components as the Add Alarm page but pre-populates
 * with existing alarm data and uses update mutation instead of create.
 * Now has access to both deviceId and alarmId for better data context.
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  AdvancedStep,
  BasicInfoStep,
  ReviewStep,
  ScheduleStep,
} from "~/components/alarms";
import { buttons, colors, containers, spacing, typography } from "~/styles";
import { trpc } from "~/utils/api";

type AlarmStep = "basic" | "schedule" | "advanced" | "review";

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
  color: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  hapticChoice: "STANDARD" | "STRONG" | "SOFT" | "DOUBLE" | "PULSE" | "WAVE";
}

export default function EditAlarmPage() {
  const { deviceId, alarmId } = useLocalSearchParams<{
    deviceId: string;
    alarmId: string;
  }>();
  const [step, setStep] = useState<AlarmStep>("basic");
  const [formData, setFormData] = useState<AlarmFormData | null>(null);
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
        color: data.color,
        priority: data.priority,
        hapticChoice: data.hapticChoice,
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
    color: string;
    priority: "LOW" | "MEDIUM" | "HIGH";
    hapticChoice: "STANDARD" | "STRONG" | "SOFT" | "DOUBLE" | "PULSE" | "WAVE";
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
      ends: "never",
      endsOnDate,
      endsAfter: undefined,
      color: alarm.color,
      priority: alarm.priority,
      hapticChoice: alarm.hapticChoice,
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
    if (formData) {
      setFormData((prev) => (prev ? { ...prev, ...updates } : null));
    }
  };

  const handleNext = () => {
    const steps: AlarmStep[] = ["basic", "schedule", "advanced", "review"];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      const nextStep = steps[currentIndex + 1];
      if (nextStep) {
        setStep(nextStep);
      }
    }
  };

  const handlePrevious = () => {
    const steps: AlarmStep[] = ["basic", "schedule", "advanced", "review"];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      const prevStep = steps[currentIndex - 1];
      if (prevStep) {
        setStep(prevStep);
      }
    } else {
      router.back();
    }
  };

  const handleFinish = () => {
    if (!formData) return;

    // Validate required fields
    if (!formData.title.trim()) {
      Alert.alert("Error", "Alarm title is required");
      setStep("basic");
      return;
    }

    updateAlarmMutation.mutate(formData);
  };

  const handleDeleteAlarm = () => {
    Alert.alert(
      "Delete Alarm",
      "Are you sure you want to delete this alarm? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  };

  const getStepTitle = () => {
    switch (step) {
      case "basic":
        return "Basic Information";
      case "schedule":
        return "Schedule";
      case "advanced":
        return "Advanced Settings";
      case "review":
        return "Review";
      default:
        return "Edit Alarm";
    }
  };

  const getStepNumber = () => {
    const steps = ["basic", "schedule", "advanced", "review"];
    return steps.indexOf(step) + 1;
  };

  const renderStep = () => {
    if (!formData) return null;

    switch (step) {
      case "basic":
        return (
          <BasicInfoStep
            formData={formData}
            onUpdate={updateFormData}
            onNext={handleNext}
            onCancel={handlePrevious}
          />
        );
      case "schedule":
        return (
          <ScheduleStep
            formData={formData}
            onUpdate={updateFormData}
            onNext={handleNext}
            onPrevious={handlePrevious}
          />
        );
      case "advanced":
        return (
          <AdvancedStep
            formData={formData}
            onUpdate={updateFormData}
            onNext={handleNext}
            onPrevious={handlePrevious}
          />
        );
      case "review":
        return (
          <ReviewStep
            formData={formData}
            onFinish={handleFinish}
            onPrevious={handlePrevious}
            isLoading={updateAlarmMutation.isPending}
          />
        );
      default:
        return null;
    }
  };

  if (isLoading || !formData) {
    return (
      <SafeAreaView style={containers.safeArea}>
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
              {
                color: colors.gray[500],
                textAlign: "center",
                marginBottom: spacing[6],
              },
            ]}
          >
            {error?.message ?? "Alarm not found"}
          </Text>
          <Pressable
            style={[buttons.base, buttons.primary]}
            onPress={() => router.back()}
          >
            <Text
              style={[typography.labelLarge, { color: colors.text.inverse }]}
            >
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.safeArea}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3],
          backgroundColor: colors.background.primary,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
        }}
      >
        {/* Left side - Back button */}
        <View style={{ width: 40 }}>
          <Pressable
            onPress={handlePrevious}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              padding: spacing[2],
              marginLeft: -spacing[2],
            })}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </Pressable>
        </View>

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
          <Text
            style={[
              typography.bodySmall,
              { color: colors.text.secondary, textAlign: "center" },
            ]}
          >
            Step {getStepNumber()} of 4: {getStepTitle()}
          </Text>
        </View>

        {/* Right side - Delete button */}
        <View style={{ width: 40, alignItems: "flex-end" }}>
          <Pressable
            onPress={handleDeleteAlarm}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              padding: spacing[2],
              marginRight: -spacing[2],
            })}
            accessibilityLabel="Delete alarm"
          >
            <Ionicons
              name="trash-outline"
              size={24}
              color={colors.error[500]}
            />
          </Pressable>
        </View>
      </View>

      {renderStep()}
    </SafeAreaView>
  );
}
