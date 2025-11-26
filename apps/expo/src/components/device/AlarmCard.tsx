import React from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import cronstrue from "cronstrue";

import type { RouterOutputs } from "~/utils/api";
import { cards, colors, spacing, typography } from "~/styles";
import { calculateNextAlarmOccurrence } from "~/utils/alarmUtils";

type Alarm = NonNullable<RouterOutputs["device"]["getById"]>["alarms"][number];

interface AlarmCardProps {
  alarm: Alarm;
  onPress?: () => void;
  isExpired?: boolean; // When true, hide "Next:" info since alarm is expired
}

export function AlarmCard({ alarm, onPress, isExpired = false }: AlarmCardProps) {
  // Check if calendarEventAlarm is present and get calendar connection info
  const calendarEventAlarm = (alarm as { calendarEventAlarm?: { calendarConnection?: { accountEmail?: string } } }).calendarEventAlarm;
  const isCalendarSynced = !!calendarEventAlarm;
  const calendarAccountEmail = calendarEventAlarm?.calendarConnection?.accountEmail;
  
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

  const getVibrationIntensityLabel = (intensity: string): string => {
    switch (intensity) {
      case "LOW":
        return "Low";
      case "MEDIUM":
        return "Med";
      case "HIGH":
        return "High";
      case "MAXIMUM":
        return "Max";
      default:
        return intensity.slice(0, 3);
    }
  };

  const getVibrationPatternLabel = (pattern: number): string => {
    // Map pattern numbers to readable labels
    // Based on common patterns: 1-16 are basic, 17-32 are complex, etc.
    if (pattern >= 1 && pattern <= 8) return "Quick";
    if (pattern >= 9 && pattern <= 16) return "Heartbeat";
    if (pattern >= 17 && pattern <= 32) return "Rapid";
    if (pattern >= 33 && pattern <= 63) return "Symphony";
    return `P${pattern}`;
  };

  const getLedPatternIcon = (
    pattern: string,
  ): keyof typeof Ionicons.glyphMap => {
    switch (pattern) {
      case "SOLID":
        return "ellipse";
      case "BLINK_SLOW":
        return "ellipse-outline";
      case "BLINK_FAST":
        return "flash";
      case "PULSE":
        return "heart";
      case "STROBE":
        return "flash-outline";
      default:
        return "ellipse";
    }
  };

  const getLedPatternLabel = (pattern: string): string => {
    switch (pattern) {
      case "SOLID":
        return "Solid";
      case "BLINK_SLOW":
        return "Slow";
      case "BLINK_FAST":
        return "Fast";
      case "PULSE":
        return "Pulse";
      case "STROBE":
        return "Strobe";
      default:
        return pattern;
    }
  };

  const syncConfig = getSyncStatusConfig(alarm.syncStatus);

  return (
    <Animated.View
      entering={FadeInDown.duration(300).springify()}
      exiting={FadeOutUp.duration(200)}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cards.base,
          { marginBottom: spacing[3] },
          pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
        ]}
      >
        {/* Header Row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing[2],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            {/* Active/Inactive Icon */}
            <Ionicons
              name={alarm.isActive ? "notifications" : "notifications-off"}
              size={20}
              color={
                alarm.isActive ? colors.primary[500] : colors.text.secondary
              }
              style={{ marginRight: spacing[2] }}
            />

            {/* Title */}
            <Text
              style={[
                typography.labelLarge,
                {
                  flex: 1,
                  color: alarm.isActive
                    ? colors.text.primary
                    : colors.text.secondary,
                },
              ]}
              numberOfLines={1}
            >
              {alarm.title}
            </Text>

            {/* Calendar Sync Indicator */}
            {isCalendarSynced && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.primary[50],
                  paddingHorizontal: spacing[2],
                  paddingVertical: 2,
                  borderRadius: 4,
                  marginLeft: spacing[2],
                  maxWidth: 120,
                }}
              >
                <Ionicons
                  name="calendar"
                  size={12}
                  color={colors.primary[500]}
                  style={{ marginRight: 2 }}
                />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "600",
                    color: colors.primary[600],
                  }}
                  numberOfLines={1}
                >
                  {calendarAccountEmail 
                    ? calendarAccountEmail.split('@')[0] 
                    : "Synced"}
                </Text>
              </View>
            )}
          </View>

          {/* Chevron */}
          {onPress && (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.text.tertiary}
              style={{ marginLeft: spacing[2] }}
            />
          )}
        </View>

        {/* Time Description */}
        <Text
          style={[
            typography.caption,
            {
              color: colors.text.secondary,
              marginBottom: spacing[1],
              fontSize: 12,
            },
          ]}
          numberOfLines={1}
        >
          {(() => {
            const formatDateWithTime = (date: Date) => {
              const now = new Date();
              const isToday =
                date.getDate() === now.getDate() &&
                date.getMonth() === now.getMonth() &&
                date.getFullYear() === now.getFullYear();
              
              const tomorrow = new Date(now);
              tomorrow.setDate(tomorrow.getDate() + 1);
              const isTomorrow =
                date.getDate() === tomorrow.getDate() &&
                date.getMonth() === tomorrow.getMonth() &&
                date.getFullYear() === tomorrow.getFullYear();

              const timeStr = date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              if (isToday) return `Today at ${timeStr}`;
              if (isTomorrow) return `Tomorrow at ${timeStr}`;

              // Show date for other days
              const dateStr = date.toLocaleDateString([], {
                month: "short",
                day: "numeric",
              });
              return `${dateStr} at ${timeStr}`;
            };

            // For expired alarms, show when it ended/was scheduled
            if (isExpired) {
              if (safeEndDate) {
                return `Ended ${formatDateWithTime(safeEndDate)}`;
              }
              return `Was scheduled for ${formatDateWithTime(safeStartDate)}`;
            }

            if (alarm.repeat) {
              try {
                const cronDescription = cronstrue.toString(alarm.cronExpression);
                // Also show the next occurrence date if available
                if (scheduleInfo.nextOccurrence) {
                  const nextDateStr = formatDateWithTime(scheduleInfo.nextOccurrence);
                  return `${cronDescription} • Next: ${nextDateStr}`;
                }
                return cronDescription;
              } catch {
                return `Repeating • ${formatDateWithTime(safeStartDate)}`;
              }
            } else {
              return `One-time • ${formatDateWithTime(safeStartDate)}`;
            }
          })()}
        </Text>

        {/* Status Badge - Show if disabled */}
        {!alarm.isActive && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: spacing[2],
              paddingVertical: spacing[1],
              paddingHorizontal: spacing[2],
              backgroundColor: colors.gray[100],
              borderRadius: 4,
              alignSelf: "flex-start",
            }}
          >
            <Ionicons
              name="close-circle"
              size={12}
              color={colors.text.secondary}
              style={{ marginRight: spacing[1] }}
            />
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.secondary,
                  fontSize: 10,
                  fontWeight: "600",
                },
              ]}
            >
              DISABLED
            </Text>
          </View>
        )}

        {/* Next Occurrence - only show for non-expired active alarms */}
        {!isExpired && scheduleInfo.timeUntilNext && alarm.isActive && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: spacing[3],
            }}
          >
            <Ionicons
              name="alarm-outline"
              size={12}
              color={colors.primary[500]}
              style={{ marginRight: spacing[1] }}
            />
            <Text
              style={[
                typography.caption,
                {
                  color: colors.primary[600],
                  fontSize: 10,
                  fontWeight: "500",
                },
              ]}
              numberOfLines={1}
            >
              Next: {scheduleInfo.timeUntilNext}
            </Text>
          </View>
        )}

        {/* Icon Row - Settings Display */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            paddingTop: spacing[2],
            borderTopWidth: 1,
            borderTopColor: colors.border.light,
          }}
        >
          {/* LED Group */}
          <View style={{ alignItems: "center", flex: 1.5 }}>
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.tertiary,
                  fontSize: 8,
                  marginBottom: spacing[1],
                  fontWeight: "600",
                },
              ]}
            >
              LED
            </Text>
            <View
              style={{
                flexDirection: "row",
                gap: spacing[2],
                alignItems: "center",
              }}
            >
              {/* LED Color */}
              <View style={{ alignItems: "center" }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
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
                                  : "#ffffff",
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    marginBottom: spacing[1],
                  }}
                />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.tertiary, fontSize: 9 },
                  ]}
                >
                  {alarm.ledColor.slice(0, 3)}
                </Text>
              </View>

              {/* LED Pattern */}
              <View style={{ alignItems: "center" }}>
                <Ionicons
                  name={getLedPatternIcon(alarm.ledPattern)}
                  size={24}
                  color={colors.text.tertiary}
                  style={{ marginBottom: spacing[1] }}
                />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.tertiary, fontSize: 9 },
                  ]}
                >
                  {getLedPatternLabel(alarm.ledPattern)}
                </Text>
              </View>
            </View>
          </View>

          {/* Vibration Group */}
          <View style={{ alignItems: "center", flex: 1.5 }}>
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.tertiary,
                  fontSize: 8,
                  marginBottom: spacing[1],
                  fontWeight: "600",
                },
              ]}
            >
              VIBRATION
            </Text>
            <View
              style={{
                flexDirection: "row",
                gap: spacing[2],
                alignItems: "center",
              }}
            >
              {/* Vibration Intensity */}
              <View style={{ alignItems: "center" }}>
                <Ionicons
                  name="radio-button-on"
                  size={24}
                  color={colors.text.tertiary}
                  style={{ marginBottom: spacing[1] }}
                />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.tertiary, fontSize: 9 },
                  ]}
                >
                  {getVibrationIntensityLabel(alarm.vibrationIntensity)}
                </Text>
              </View>

              {/* Vibration Pattern */}
              <View style={{ alignItems: "center" }}>
                <Ionicons
                  name="pulse"
                  size={24}
                  color={colors.text.tertiary}
                  style={{ marginBottom: spacing[1] }}
                />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.tertiary, fontSize: 9 },
                  ]}
                >
                  {getVibrationPatternLabel(alarm.vibrationPattern)}
                </Text>
              </View>
            </View>
          </View>

          {/* Snooze */}
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.tertiary,
                  fontSize: 8,
                  marginBottom: spacing[1],
                  fontWeight: "600",
                },
              ]}
            >
              SNOOZE
            </Text>
            <Ionicons
              name="time"
              size={24}
              color={colors.text.tertiary}
              style={{ marginBottom: spacing[1] }}
            />
            <Text
              style={[
                typography.caption,
                { color: colors.text.tertiary, fontSize: 9 },
              ]}
            >
              {alarm.snoozePeriod}m
            </Text>
          </View>

          {/* Sync Status */}
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.tertiary,
                  fontSize: 8,
                  marginBottom: spacing[1],
                  fontWeight: "600",
                },
              ]}
            >
              SYNC
            </Text>
            <Ionicons
              name={syncConfig.icon}
              size={24}
              color={syncConfig.color}
              style={{ marginBottom: spacing[1] }}
            />
            <Text
              style={[
                typography.caption,
                { color: syncConfig.color, fontSize: 9, fontWeight: "600" },
              ]}
            >
              {syncConfig.text}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
