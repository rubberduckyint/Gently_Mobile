import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React from "react";
import { Alert, Modal, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";

import { buttons, cards, colors, spacing, typography } from "~/styles";
import { trpc } from "~/utils/api";

interface QuickReminderModalProps {
  visible: boolean;
  deviceId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function QuickReminderModal({
  visible,
  deviceId,
  onClose,
  onSuccess,
}: QuickReminderModalProps) {
  const [selectedReminderTime, setSelectedReminderTime] =
    React.useState<Date | null>(null);
  const [showDateTimePicker, setShowDateTimePicker] = React.useState(false);
  const [pickerMode, setPickerMode] = React.useState<"date" | "time">("date");
  const [isCreating, setIsCreating] = React.useState(false);

  const handleCreateReminder = async () => {
    if (!selectedReminderTime) {
      Alert.alert("Error", "Please select a time for the reminder");
      return;
    }

    setIsCreating(true);
    try {
      const minute = selectedReminderTime.getMinutes();
      const hour = selectedReminderTime.getHours();
      const day = selectedReminderTime.getDate();
      const month = selectedReminderTime.getMonth() + 1;
      const cronExpression = `${minute} ${hour} ${day} ${month} *`;

      await trpc.alarm.create.mutate({
        title: "Quick Reminder",
        deviceId,
        isActive: true,
        startDate: selectedReminderTime.toISOString(),
        endDate: selectedReminderTime.toISOString(),
        cronExpression,
        severityLevel: "INFORMATIONAL",
        ledPattern: "BLINK_SLOW",
        ledColor: "BLUE",
        vibrationPattern: 1, // Quick pulse pattern
        vibrationIntensity: "MEDIUM",
        snoozePeriod: 5,
        snoozeTimeout: 120,
        retriggerDelay: 5,
        retriggerTimeout: 120,
      });

      Alert.alert(
        "Success",
        `Reminder created for ${selectedReminderTime.toLocaleString()}`,
      );
      setSelectedReminderTime(null);
      onClose();
      onSuccess?.();
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to create reminder",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleDateTimeChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (Platform.OS === "android") {
      setShowDateTimePicker(false);
    }

    if (event.type === "set" && selectedDate) {
      if (pickerMode === "date") {
        // After selecting date, show time picker
        setSelectedReminderTime(selectedDate);
        setPickerMode("time");
        if (Platform.OS === "android") {
          setShowDateTimePicker(true);
        }
      } else {
        // After selecting time, close picker
        setSelectedReminderTime(selectedDate);
        setShowDateTimePicker(false);
        setPickerMode("date");
      }
    } else if (event.type === "dismissed") {
      setShowDateTimePicker(false);
      setPickerMode("date");
    }
  };

  const handlePickerDone = () => {
    if (pickerMode === "date") {
      setPickerMode("time");
    } else {
      setShowDateTimePicker(false);
      setPickerMode("date");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={[
            cards.base,
            {
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              padding: spacing[6],
              paddingBottom: spacing[8],
            },
          ]}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: spacing[2],
            }}
          >
            <Text style={[typography.h4, { color: colors.text.primary }]}>
              Quick Reminder
            </Text>
            <Pressable
              onPress={onClose}
              style={{
                padding: spacing[1],
              }}
            >
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </Pressable>
          </View>

          <Text
            style={[
              typography.body,
              {
                color: colors.text.secondary,
                marginBottom: spacing[5],
              },
            ]}
          >
            Create a one-time reminder that will alert you at the selected time
          </Text>

          {/* Quick Time Options */}
          <View style={{ marginBottom: spacing[5] }}>
            <Text
              style={[
                typography.label,
                { marginBottom: spacing[3], color: colors.text.primary },
              ]}
            >
              Quick Options
            </Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing[2],
              }}
            >
              {[
                { label: "15 min", minutes: 15 },
                { label: "30 min", minutes: 30 },
                { label: "45 min", minutes: 45 },
                { label: "1 hour", minutes: 60 },
              ].map((option) => (
                <Pressable
                  key={option.minutes}
                  style={[
                    buttons.base,
                    buttons.secondary,
                    {
                      flex: 1,
                      minWidth: "45%",
                      paddingVertical: spacing[3],
                    },
                  ]}
                  onPress={() => {
                    const reminderTime = new Date(
                      Date.now() + option.minutes * 60000,
                    );
                    setSelectedReminderTime(reminderTime);
                  }}
                >
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={colors.primary[600]}
                    style={{ marginRight: spacing[1] }}
                  />
                  <Text
                    style={[typography.label, { color: colors.primary[600] }]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Custom Date/Time Picker */}
          <View style={{ marginBottom: spacing[5] }}>
            <Text
              style={[
                typography.label,
                { marginBottom: spacing[3], color: colors.text.primary },
              ]}
            >
              Or Pick Custom Time
            </Text>
            <Pressable
              style={[
                buttons.base,
                buttons.secondary,
                {
                  paddingVertical: spacing[3],
                  paddingHorizontal: spacing[4],
                },
              ]}
              onPress={() => {
                setPickerMode("date");
                setShowDateTimePicker(true);
              }}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={colors.primary[600]}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={[typography.label, { color: colors.primary[600] }]}>
                {selectedReminderTime
                  ? selectedReminderTime.toLocaleString()
                  : "Select Date & Time"}
              </Text>
            </Pressable>
          </View>

          {/* Date/Time Picker Modal */}
          {showDateTimePicker && (
            <Modal
              visible={showDateTimePicker}
              transparent={true}
              animationType="fade"
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  justifyContent: "center",
                  alignItems: "center",
                  paddingHorizontal: spacing[4],
                }}
              >
                <View
                  style={[
                    cards.base,
                    {
                      width: "100%",
                      maxWidth: 400,
                      padding: spacing[4],
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.h5,
                      {
                        color: colors.text.primary,
                        marginBottom: spacing[4],
                        textAlign: "center",
                      },
                    ]}
                  >
                    {pickerMode === "date" ? "Select Date" : "Select Time"}
                  </Text>
                  <DateTimePicker
                    value={selectedReminderTime ?? new Date()}
                    mode={pickerMode}
                    display="spinner"
                    onChange={handleDateTimeChange}
                    minimumDate={new Date()}
                    style={{
                      backgroundColor: colors.background.primary,
                      height: 200,
                    }}
                    textColor={colors.text.primary}
                  />
                  {Platform.OS === "ios" && (
                    <View
                      style={{
                        flexDirection: "row",
                        gap: spacing[2],
                        marginTop: spacing[4],
                      }}
                    >
                      <Pressable
                        style={[
                          buttons.base,
                          buttons.secondary,
                          { flex: 1, alignItems: "center" },
                        ]}
                        onPress={() => {
                          setShowDateTimePicker(false);
                          setPickerMode("date");
                        }}
                      >
                        <Text
                          style={[
                            typography.labelLarge,
                            { color: colors.primary[600] },
                          ]}
                        >
                          Cancel
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          buttons.base,
                          buttons.primary,
                          { flex: 1, alignItems: "center" },
                        ]}
                        onPress={handlePickerDone}
                      >
                        <Text
                          style={[
                            typography.labelLarge,
                            { color: colors.text.inverse },
                          ]}
                        >
                          {pickerMode === "date" ? "Next" : "Done"}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            </Modal>
          )}

          {/* Selected Time Display */}
          {selectedReminderTime && (
            <View
              style={{
                backgroundColor: colors.primary[50],
                padding: spacing[3],
                borderRadius: 12,
                marginBottom: spacing[5],
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.primary[600]}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={[typography.label, { color: colors.primary[700] }]}>
                Reminder set for {selectedReminderTime.toLocaleString()}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={{ gap: spacing[2] }}>
            <Pressable
              style={[
                buttons.base,
                buttons.primary,
                {
                  alignItems: "center",
                  opacity: selectedReminderTime ? 1 : 0.5,
                },
              ]}
              onPress={handleCreateReminder}
              disabled={!selectedReminderTime || isCreating}
            >
              <Text style={[typography.labelLarge, { color: "#ffffff" }]}>
                {isCreating ? "Creating..." : "Create Reminder"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                buttons.base,
                buttons.secondary,
                { alignItems: "center" },
              ]}
              onPress={onClose}
            >
              <Text
                style={[typography.labelLarge, { color: colors.primary[600] }]}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
