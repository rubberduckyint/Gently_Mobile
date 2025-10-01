import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import cronstrue from "cronstrue";

import type { RouterOutputs } from "~/utils/api";
import { cards, colors, spacing, typography } from "~/styles";
import {
  calculateNextAlarmOccurrence,
  getAlarmStatusColor,
} from "~/utils/alarmUtils";

type Alarm = NonNullable<RouterOutputs["device"]["getById"]>["alarms"][number];

interface AlarmCardProps {
  alarm: Alarm;
  compact?: boolean;
  onPress?: () => void;
}

export function AlarmCard({ alarm, compact = false, onPress }: AlarmCardProps) {
  // Safely convert dates, providing defaults for invalid values
  const safeStartDate = React.useMemo(() => {
    console.log("AlarmCard processing startDate:", {
      raw: alarm.startDate,
      type: typeof alarm.startDate,
      isDate: alarm.startDate instanceof Date,
    });

    let date: Date;
    if (alarm.startDate instanceof Date) {
      date = alarm.startDate;
    } else {
      // Handle string dates from API
      date = new Date(alarm.startDate);
    }

    if (isNaN(date.getTime())) {
      console.warn(
        "Invalid startDate detected, using current date:",
        alarm.startDate,
      );
      return new Date();
    }

    return date;
  }, [alarm.startDate]);

  const safeEndDate = React.useMemo(() => {
    console.log("AlarmCard processing endDate:", {
      raw: alarm.endDate,
      type: typeof alarm.endDate,
      isDate: alarm.endDate instanceof Date,
    });

    if (!alarm.endDate) return undefined;

    let date: Date;
    if (alarm.endDate instanceof Date) {
      date = alarm.endDate;
    } else {
      // Handle string dates from API
      date = new Date(alarm.endDate);
    }

    if (isNaN(date.getTime())) {
      console.warn("Invalid endDate detected, ignoring:", alarm.endDate);
      return undefined;
    }

    return date;
  }, [alarm.endDate]);

  const scheduleInfo = React.useMemo(() => {
    // Debug logging to trace the source of invalid dates
    console.log("AlarmCard calculating schedule for alarm:", {
      id: alarm.id,
      isActive: alarm.isActive,
      startDate: safeStartDate,
      startDateValid: !isNaN(safeStartDate.getTime()),
      endDate: safeEndDate,
      endDateValid: safeEndDate ? !isNaN(safeEndDate.getTime()) : true,
      repeat: alarm.repeat,
      cronExpression: alarm.cronExpression,
    });

    return calculateNextAlarmOccurrence({
      isActive: alarm.isActive,
      startDate: safeStartDate,
      endDate: safeEndDate ?? null,
      repeat: alarm.repeat,
      cronExpression: alarm.cronExpression,
    });
  }, [
    alarm.id,
    alarm.isActive,
    safeStartDate,
    safeEndDate,
    alarm.repeat,
    alarm.cronExpression,
  ]);

  const getHumanReadableCron = (cronExpression: string) => {
    try {
      return cronstrue.toString(cronExpression);
    } catch (error) {
      console.warn("Failed to parse cron expression:", cronExpression, error);
      return "Invalid schedule";
    }
  };

  const getSeverityConfig = (severityLevel: string) => {
    switch (severityLevel) {
      case "CRITICAL":
        return {
          color: colors.error[500],
          icon: "warning" as const,
          bgColor: colors.error[50],
        };
      case "WARNING":
        return {
          color: colors.warning[500],
          icon: "alert-circle" as const,
          bgColor: colors.warning[50],
        };
      case "INFORMATIONAL":
        return {
          color: colors.success[500],
          icon: "information-circle" as const,
          bgColor: colors.success[50],
        };
      default:
        return {
          color: colors.text.secondary,
          icon: "information-circle" as const,
          bgColor: colors.background.secondary,
        };
    }
  };

  const getSyncStatusConfig = (status: string) => {
    switch (status) {
      case "SYNCED":
        return {
          color: colors.status.synced,
          icon: "checkmark-circle" as const,
          text: "Synced",
        };
      case "SYNCING":
        return {
          color: colors.status.syncing,
          icon: "sync" as const,
          text: "Syncing",
        };
      case "ERROR":
        return {
          color: colors.status.error,
          icon: "close-circle" as const,
          text: "Error",
        };
      default:
        return {
          color: colors.status.pending,
          icon: "time" as const,
          text: "Pending",
        };
    }
  };

  const severityConfig = getSeverityConfig(alarm.severityLevel as string);
  const syncConfig = getSyncStatusConfig(alarm.syncStatus);

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cards.base,
          { marginBottom: spacing[3] },
          pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing[1],
              }}
            >
              <Ionicons
                name={alarm.isActive ? "notifications" : "notifications-off"}
                size={16}
                color={
                  alarm.isActive ? colors.primary[500] : colors.text.secondary
                }
                style={{ marginRight: spacing[2] }}
              />
              <Text
                style={[
                  typography.labelLarge,
                  {
                    color: alarm.isActive
                      ? colors.text.primary
                      : colors.text.secondary,
                  },
                ]}
                numberOfLines={1}
              >
                {alarm.title}
              </Text>
            </View>
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.secondary,
                  fontWeight: "500",
                },
              ]}
              numberOfLines={1}
            >
              {getHumanReadableCron(alarm.cronExpression)}
            </Text>
            <Text
              style={[
                typography.caption,
                {
                  color: getAlarmStatusColor(scheduleInfo),
                  fontWeight: "600",
                  marginTop: spacing[1],
                },
              ]}
              numberOfLines={1}
            >
              {scheduleInfo.timeUntilNext}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing[2],
            }}
          >
            <Ionicons
              name={severityConfig.icon}
              size={16}
              color={severityConfig.color}
            />
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor:
                  alarm.ledColor === "RED"
                    ? "#ff3b30"
                    : alarm.ledColor === "GREEN"
                      ? "#34c759"
                      : alarm.ledColor === "BLUE"
                        ? "#007aff"
                        : alarm.ledColor === "YELLOW"
                          ? "#ffcc02"
                          : alarm.ledColor === "MAGENTA"
                            ? "#af52de"
                            : alarm.ledColor === "CYAN"
                              ? "#00ffff"
                              : "#ffffff", // WHITE
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            />
            <Ionicons
              name={syncConfig.icon}
              size={16}
              color={syncConfig.color}
            />
            {onPress && (
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.text.tertiary}
                style={{ marginLeft: spacing[1] }}
              />
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        cards.base,
        { marginBottom: spacing[4] },
        pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: spacing[3],
        }}
      >
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: spacing[1],
            }}
          >
            <Ionicons
              name={alarm.isActive ? "notifications" : "notifications-off"}
              size={20}
              color={
                alarm.isActive ? colors.primary[500] : colors.text.secondary
              }
              style={{ marginRight: spacing[2] }}
            />
            <Text style={[typography.h6, { color: colors.text.primary }]}>
              {alarm.title}
            </Text>
          </View>
          {alarm.description && (
            <Text
              style={[
                typography.bodySmall,
                { color: colors.text.secondary, marginTop: spacing[1] },
              ]}
            >
              {alarm.description}
            </Text>
          )}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing[3],
            paddingVertical: spacing[2],
            borderRadius: spacing[2],
            backgroundColor: severityConfig.bgColor,
          }}
        >
          <Ionicons
            name={severityConfig.icon}
            size={16}
            color={severityConfig.color}
            style={{ marginRight: spacing[1] }}
          />
          <Text
            style={[
              typography.caption,
              { color: severityConfig.color, fontWeight: "600" },
            ]}
          >
            {alarm.severityLevel}
          </Text>
        </View>

        {onPress && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.text.tertiary}
            style={{ marginLeft: spacing[2] }}
          />
        )}
      </View>

      {/* Schedule */}
      <View
        style={{
          backgroundColor: colors.background.tertiary,
          padding: spacing[3],
          borderRadius: spacing[2],
          marginBottom: spacing[3],
        }}
      >
        <Text
          style={[
            typography.bodySmall,
            { color: colors.text.primary, marginBottom: spacing[1] },
          ]}
        >
          {getHumanReadableCron(alarm.cronExpression)}
        </Text>
        <Text
          style={[
            typography.caption,
            { color: colors.text.tertiary, fontFamily: "monospace" },
          ]}
        >
          {alarm.cronExpression}
        </Text>
      </View>

      {/* Alarm Details */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: spacing[3],
        }}
      >
        <View style={{ flex: 1, alignItems: "center" }}>
          <Ionicons
            name={alarm.isActive ? "checkmark-circle" : "close-circle"}
            size={20}
            color={alarm.isActive ? colors.success[500] : colors.text.secondary}
            style={{ marginBottom: spacing[1] }}
          />
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            Status
          </Text>
          <Text
            style={[
              typography.caption,
              {
                color: alarm.isActive
                  ? colors.success[600]
                  : colors.text.secondary,
                fontWeight: "600",
              },
            ]}
          >
            {alarm.isActive ? "Active" : "Inactive"}
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Ionicons
            name="phone-portrait"
            size={20}
            color={colors.primary[500]}
            style={{ marginBottom: spacing[1] }}
          />
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            Haptic
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.text.primary, fontWeight: "600" },
            ]}
          >
            {alarm.vibrationIntensity}
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: "center" }}>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor:
                alarm.ledColor === "RED"
                  ? "#ff3b30"
                  : alarm.ledColor === "GREEN"
                    ? "#34c759"
                    : alarm.ledColor === "BLUE"
                      ? "#007aff"
                      : alarm.ledColor === "YELLOW"
                        ? "#ffcc02"
                        : alarm.ledColor === "MAGENTA"
                          ? "#af52de"
                          : alarm.ledColor === "CYAN"
                            ? "#00ffff"
                            : "#ffffff", // WHITE
              borderWidth: 1,
              borderColor: colors.border.light,
              marginBottom: spacing[1],
            }}
          />
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            LED
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.text.primary, fontWeight: "600" },
            ]}
          >
            Color
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Ionicons
            name={syncConfig.icon}
            size={20}
            color={syncConfig.color}
            style={{ marginBottom: spacing[1] }}
          />
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            Sync
          </Text>
          <Text
            style={[
              typography.caption,
              {
                color: syncConfig.color,
                fontWeight: "600",
              },
            ]}
          >
            {syncConfig.text}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
