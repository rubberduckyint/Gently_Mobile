/**
 * Add Alarm Page
 *
 * Multi-step form for creating a new alarm for a specific device.
 * Steps:
 * 1. Basic Info - title, description, color
 * 2. Schedule - start time, repeat settings
 * 3. Advanced - priority, haptic feedback
 * 4. Review - confirm all settings before creation
 *
 * Modeled after the Next.js AlarmEditForm but adapted for React Native
 * with proper navigation and mobile-friendly form controls.
 */

import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  buttons,
  buttonText,
  colors,
  containers,
  flex,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";
import {
  AdvancedStep,
  BasicInfoStep,
  ReviewStep,
  ScheduleStep,
} from "~/components/alarms";

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
    color: "#007AFF",
    priority: "MEDIUM",
    hapticChoice: "STANDARD",
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
  const [step, setStep] = useState<AlarmStep>("basic");
  const [formData, setFormData] = useState<AlarmFormData>(getDefaultFormData());
  const queryClient = useQueryClient();

  const createAlarmMutation = useMutation({
    mutationFn: async (data: AlarmFormData) => {
      const cronExpression = generateCronExpression(data);
      const endDate =
        data.ends === "on" && data.endsOnDate
          ? data.endsOnDate.toISOString()
          : undefined;

      return await trpc.alarm.create.mutate({
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
        deviceId,
      });
    },
    onSuccess: () => {
      // Invalidate device data to refetch alarms
      void queryClient.invalidateQueries({
        queryKey: ["device.getById", { id: deviceId }],
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
    // Validate required fields
    if (!formData.title.trim()) {
      Alert.alert("Error", "Alarm title is required");
      setStep("basic");
      return;
    }

    createAlarmMutation.mutate(formData);
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
        return "Add Alarm";
    }
  };

  const getStepNumber = () => {
    const steps = ["basic", "schedule", "advanced", "review"];
    return steps.indexOf(step) + 1;
  };

  const renderStep = () => {
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
            isLoading={createAlarmMutation.isPending}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={containers.safeArea}>
      {/* Header */}
      <View
        style={[
          flex.row,
          flex.itemsCenter,
          flex.justifyBetween,
          {
            paddingHorizontal: spacing[6],
            paddingVertical: spacing[4],
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
          },
        ]}
      >
        <View style={[flex.row, flex.itemsCenter]}>
          <Pressable
            style={[buttons.base, buttons.small, { marginRight: spacing[3] }]}
            onPress={handlePrevious}
          >
            <Text style={[buttonText.primary, buttonText.small]}>← Back</Text>
          </Pressable>
          <View>
            <Text style={typography.h3}>Add New Alarm</Text>
            <Text
              style={[typography.bodySmall, { color: colors.text.secondary }]}
            >
              Step {getStepNumber()} of 4: {getStepTitle()}
            </Text>
          </View>
        </View>
      </View>

      {renderStep()}
    </SafeAreaView>
  );
}
