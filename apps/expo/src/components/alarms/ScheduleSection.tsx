/**
 * ScheduleSection Component
 *
 * Reusable form section for alarm scheduling (time, repeat settings).
 * Used by both add and edit alarm forms.
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider";

import type { AlarmFormData } from "./BasicInfoSection";
import { cards, colors, spacing, typography } from "~/styles";

interface ScheduleSectionProps {
  formData: AlarmFormData;
  onUpdateFormData: (updates: Partial<AlarmFormData>) => void;
  showStartTimePicker: boolean;
  onToggleStartTimePicker: () => void;
  showEndDatePicker: boolean;
  onToggleEndDatePicker: () => void;
  showStartDatePicker: boolean;
  onToggleStartDatePicker: () => void;
  showEndTimePicker: boolean;
  onToggleEndTimePicker: () => void;
}

export function ScheduleSection({
  formData,
  onUpdateFormData,
  showStartTimePicker,
  onToggleStartTimePicker,
  showEndDatePicker,
  onToggleEndDatePicker,
  showStartDatePicker,
  onToggleStartDatePicker,
  showEndTimePicker,
  onToggleEndTimePicker,
}: ScheduleSectionProps) {
  // Local state for temporary picker values (iOS only)
  const [tempStartDate, setTempStartDate] = useState(formData.startDate);
  const [tempEndDate, setTempEndDate] = useState(
    formData.endsOnDate ?? new Date(),
  );

  // Update temp values when form data changes
  useEffect(() => {
    setTempStartDate(formData.startDate);
  }, [formData.startDate]);

  useEffect(() => {
    setTempEndDate(formData.endsOnDate ?? new Date());
  }, [formData.endsOnDate]);
  const handleDayPress = (day: string) => {
    const currentDays = formData.daysOfWeek;
    if (currentDays.includes(day)) {
      onUpdateFormData({
        daysOfWeek: currentDays.filter((d) => d !== day),
      });
    } else {
      onUpdateFormData({
        daysOfWeek: [...currentDays, day],
      });
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString();
  };

  return (
    <>
      <View style={[cards.base, { marginBottom: spacing[4] }]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing[2],
            marginBottom: spacing[2],
          }}
        >
          <Ionicons name="calendar" size={20} color={colors.primary[500]} />
          <Text style={[typography.h4]}>Schedule</Text>
        </View>
        <Text
          style={[
            typography.caption,
            {
              color: colors.text.secondary,
              marginBottom: spacing[5],
              lineHeight: 18,
            },
          ]}
        >
          Set when your alarm should trigger and how often it should repeat.
        </Text>

        {/* Start Date & Time - on the same line */}
        <View style={{ marginBottom: spacing[4] }}>
          <Text style={[typography.label, { marginBottom: spacing[2] }]}>
            Start Date & Time *
          </Text>
          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            {/* Start Date */}
            <Pressable
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border.medium,
                backgroundColor: colors.background.secondary,
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[3],
                borderRadius: 8,
                justifyContent: "center",
              }}
              onPress={onToggleStartDatePicker}
            >
              <Text
                style={[typography.bodySmall, { color: colors.text.primary }]}
              >
                {formatDate(formData.startDate)}
              </Text>
            </Pressable>

            {/* Start Time */}
            <Pressable
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border.medium,
                backgroundColor: colors.background.secondary,
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[3],
                borderRadius: 8,
                justifyContent: "center",
              }}
              onPress={onToggleStartTimePicker}
            >
              <Text
                style={[typography.bodySmall, { color: colors.text.primary }]}
              >
                {formatTime(formData.startDate)}
              </Text>
            </Pressable>
          </View>

          {/* Time Picker Modal Overlay - full screen grayed background */}
          {showStartTimePicker && Platform.OS === "ios" && (
            <Modal
              transparent={true}
              visible={showStartTimePicker}
              animationType="fade"
              onRequestClose={onToggleStartTimePicker}
            >
              <Pressable
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  justifyContent: "center",
                  alignItems: "center",
                  paddingHorizontal: spacing[4],
                }}
                onPress={() => {
                  // Cancel - restore original value and close when tapping background
                  setTempStartDate(formData.startDate);
                  onToggleStartTimePicker();
                }}
              >
                <Pressable
                  style={{
                    backgroundColor: colors.background.primary,
                    borderRadius: 16,
                    padding: spacing[4],
                    width: "100%",
                    maxWidth: 400,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 12,
                    elevation: 8,
                  }}
                  onPress={(e) => e.stopPropagation()} // Prevent closing when tapping the picker
                >
                  <Text
                    style={[
                      typography.h3,
                      {
                        color: colors.text.primary,
                        marginBottom: spacing[4],
                        textAlign: "center",
                      },
                    ]}
                  >
                    Select Time
                  </Text>
                  <DateTimePicker
                    value={tempStartDate}
                    mode="time"
                    display="spinner"
                    onChange={(event, selectedDate) => {
                      if (selectedDate) {
                        setTempStartDate(selectedDate);
                      }
                    }}
                    style={{
                      backgroundColor: colors.background.primary,
                      height: 200,
                    }}
                    textColor={colors.text.primary}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: spacing[3],
                      paddingTop: spacing[4],
                      borderTopWidth: 1,
                      borderTopColor: colors.border.light,
                      marginTop: spacing[4],
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        // Cancel - restore original value and close
                        setTempStartDate(formData.startDate);
                        onToggleStartTimePicker();
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: spacing[3],
                        backgroundColor: colors.background.secondary,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border.medium,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={[
                          typography.body,
                          { color: colors.text.primary },
                        ]}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        // Save temporary picker value to form and close
                        onUpdateFormData({ startDate: tempStartDate });
                        onToggleStartTimePicker();
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: spacing[3],
                        backgroundColor: colors.primary[500],
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={[
                          typography.body,
                          { color: colors.text.inverse },
                        ]}
                      >
                        Done
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </Pressable>
            </Modal>
          )}

          {/* Android Time Picker (uses native modal) */}
          {showStartTimePicker && Platform.OS === "android" && (
            <View style={{ marginTop: spacing[3] }}>
              <DateTimePicker
                value={formData.startDate}
                mode="time"
                display="default"
                onChange={(event, selectedDate) => {
                  onToggleStartTimePicker();
                  if (selectedDate) {
                    onUpdateFormData({ startDate: selectedDate });
                  }
                }}
                textColor={colors.text.primary}
              />
            </View>
          )}
        </View>

        {/* Repeat Toggle */}
        <View style={{ marginBottom: spacing[4] }}>
          <Text style={[typography.label, { marginBottom: spacing[2] }]}>
            Repeat
          </Text>
          <Text
            style={[
              typography.caption,
              {
                color: colors.text.secondary,
                marginBottom: spacing[3],
                lineHeight: 18,
              },
            ]}
          >
            Should this alarm trigger multiple times on a schedule?
          </Text>
          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <Pressable
              onPress={() => onUpdateFormData({ repeat: false })}
              style={{
                flex: 1,
                paddingVertical: spacing[2],
                paddingHorizontal: spacing[4],
                borderRadius: 8,
                backgroundColor: !formData.repeat
                  ? colors.primary[500]
                  : colors.background.secondary,
                borderWidth: 1,
                borderColor: !formData.repeat
                  ? colors.primary[500]
                  : colors.border.light,
                alignItems: "center",
              }}
            >
              <Text
                style={[
                  typography.body,
                  {
                    color: !formData.repeat
                      ? colors.background.primary
                      : colors.text.primary,
                    fontWeight: !formData.repeat ? "600" : "400",
                  },
                ]}
              >
                No
              </Text>
            </Pressable>

            <Pressable
              onPress={() => onUpdateFormData({ repeat: true })}
              style={{
                flex: 1,
                paddingVertical: spacing[2],
                paddingHorizontal: spacing[4],
                borderRadius: 8,
                backgroundColor: formData.repeat
                  ? colors.primary[500]
                  : colors.background.secondary,
                borderWidth: 1,
                borderColor: formData.repeat
                  ? colors.primary[500]
                  : colors.border.light,
                alignItems: "center",
              }}
            >
              <Text
                style={[
                  typography.body,
                  {
                    color: formData.repeat
                      ? colors.background.primary
                      : colors.text.primary,
                    fontWeight: formData.repeat ? "600" : "400",
                  },
                ]}
              >
                Yes
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Repeat Options - Only show if repeat is enabled */}
        {formData.repeat && (
          <>
            {/* Repeat Type */}
            <View style={{ marginBottom: spacing[4] }}>
              <Text style={[typography.label, { marginBottom: spacing[2] }]}>
                Repeat Every
              </Text>
              <Text
                style={[
                  typography.caption,
                  {
                    color: colors.text.secondary,
                    marginBottom: spacing[3],
                    lineHeight: 18,
                  },
                ]}
              >
                How often should the alarm trigger? (e.g., every 2 hours, every
                3 days)
              </Text>

              {/* Slider Control with Value Display */}
              <View style={{ marginBottom: spacing[3] }}>
                <Text
                  style={[
                    typography.h3,
                    {
                      marginBottom: spacing[3],
                      fontWeight: "700",
                      textAlign: "center",
                      color: colors.primary[500],
                    },
                  ]}
                >
                  {formData.repeatEvery}
                </Text>
                <Slider
                  style={{ width: "100%", height: 40 }}
                  minimumValue={1}
                  maximumValue={60}
                  step={1}
                  value={formData.repeatEvery}
                  onValueChange={(value) =>
                    onUpdateFormData({ repeatEvery: Math.round(value) })
                  }
                  minimumTrackTintColor={colors.primary[500]}
                  maximumTrackTintColor={colors.border.light}
                  thumbTintColor={colors.primary[500]}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: spacing[1],
                  }}
                >
                  <Text
                    style={[typography.caption, { color: colors.text.tertiary }]}
                  >
                    1
                  </Text>
                  <Text
                    style={[typography.caption, { color: colors.text.tertiary }]}
                  >
                    60
                  </Text>
                </View>
              </View>

              {/* Repeat Type Options - Full Width Buttons Below */}
              <View
                style={{
                  flexDirection: "row",
                  gap: spacing[2],
                }}
              >
                {(["minutes", "hours", "days", "weeks"] as const).map(
                  (type) => {
                    const isSelected = formData.repeatType === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => {
                          const updates: Partial<typeof formData> = {
                            repeatType: type,
                          };
                          // Clear days of week if switching away from weeks
                          if (
                            formData.repeatType === "weeks" &&
                            type !== "weeks"
                          ) {
                            updates.daysOfWeek = [];
                          }
                          onUpdateFormData(updates);
                        }}
                        style={[
                          {
                            paddingVertical: spacing[3],
                            borderRadius: 8,
                            borderWidth: 1,
                            flex: 1,
                            alignItems: "center",
                            justifyContent: "center",
                          },
                          isSelected
                            ? {
                                backgroundColor: colors.primary[500],
                                borderColor: colors.primary[500],
                              }
                            : {
                                backgroundColor: colors.background.secondary,
                                borderColor: colors.border.medium,
                              },
                        ]}
                      >
                        <Text
                          style={[
                            typography.bodySmall,
                            {
                              color: isSelected
                                ? colors.text.inverse
                                : colors.text.primary,
                              fontWeight: isSelected ? "600" : "400",
                            },
                          ]}
                        >
                          {type}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </View>

            {/* Days of Week - Only show for weekly repeat */}
            {formData.repeatType === "weeks" && (
              <View style={{ marginBottom: spacing[4] }}>
                <Text style={[typography.label, { marginBottom: spacing[2] }]}>
                  Days of Week
                </Text>
                <Text
                  style={[
                    typography.caption,
                    {
                      color: colors.text.secondary,
                      marginBottom: spacing[3],
                      lineHeight: 18,
                    },
                  ]}
                >
                  Select which days the alarm should trigger.
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: spacing[1],
                  }}
                >
                  {["0", "1", "2", "3", "4", "5", "6"].map((day) => {
                    const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
                    const isSelected = formData.daysOfWeek.includes(day);
                    return (
                      <Pressable
                        key={day}
                        onPress={() => handleDayPress(day)}
                        style={[
                          {
                            flex: 1,
                            aspectRatio: 1,
                            paddingVertical: spacing[2],
                            borderRadius: 8,
                            borderWidth: 1,
                            alignItems: "center",
                            justifyContent: "center",
                          },
                          isSelected
                            ? {
                                backgroundColor: colors.primary[500],
                                borderColor: colors.primary[500],
                              }
                            : {
                                backgroundColor: colors.background.primary,
                                borderColor: colors.border.light,
                              },
                        ]}
                      >
                        <Text
                          style={[
                            typography.body,
                            {
                              color: isSelected
                                ? colors.text.inverse
                                : colors.text.primary,
                              fontWeight: "600",
                            },
                          ]}
                        >
                          {dayNames[parseInt(day)]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* End Condition */}
            <View>
              <Text style={[typography.label, { marginBottom: spacing[2] }]}>
                Ends
              </Text>
              <Text
                style={[
                  typography.caption,
                  {
                    color: colors.text.secondary,
                    marginBottom: spacing[3],
                    lineHeight: 18,
                  },
                ]}
              >
                Choose when the repeating alarm should stop triggering.
              </Text>

              {/* Three Button Radio Options */}
              <View
                style={{
                  flexDirection: "row",
                  gap: spacing[2],
                  marginBottom: spacing[3],
                }}
              >
                {(["never", "on", "after"] as const).map((option) => {
                  const isSelected = formData.ends === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => onUpdateFormData({ ends: option })}
                      style={[
                        {
                          paddingVertical: spacing[3],
                          borderRadius: 8,
                          borderWidth: 1,
                          flex: 1,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                        isSelected
                          ? {
                              backgroundColor: colors.primary[500],
                              borderColor: colors.primary[500],
                            }
                          : {
                              backgroundColor: colors.background.secondary,
                              borderColor: colors.border.medium,
                            },
                      ]}
                    >
                      <Text
                        style={[
                          typography.bodySmall,
                          {
                            color: isSelected
                              ? colors.text.inverse
                              : colors.text.primary,
                            fontWeight: isSelected ? "600" : "400",
                          },
                        ]}
                      >
                        {option === "never"
                          ? "Never"
                          : option === "on"
                            ? "On Date"
                            : "After"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* End Date Picker - Date and Time on same line */}
              {formData.ends === "on" && (
                <View
                  style={{
                    flexDirection: "row",
                    gap: spacing[2],
                  }}
                >
                  {/* End Date */}
                  <Pressable
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: colors.border.medium,
                      backgroundColor: colors.background.secondary,
                      paddingHorizontal: spacing[3],
                      paddingVertical: spacing[3],
                      borderRadius: 8,
                      justifyContent: "center",
                    }}
                    onPress={onToggleEndDatePicker}
                  >
                    <Text
                      style={[
                        typography.bodySmall,
                        { color: colors.text.primary },
                      ]}
                    >
                      {formData.endsOnDate
                        ? formatDate(formData.endsOnDate)
                        : "Select date"}
                    </Text>
                  </Pressable>

                  {/* End Time */}
                  <Pressable
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: colors.border.medium,
                      backgroundColor: colors.background.secondary,
                      paddingHorizontal: spacing[3],
                      paddingVertical: spacing[3],
                      borderRadius: 8,
                      justifyContent: "center",
                    }}
                    onPress={onToggleEndTimePicker}
                  >
                    <Text
                      style={[
                        typography.bodySmall,
                        { color: colors.text.primary },
                      ]}
                    >
                      {formData.endsOnDate
                        ? formatTime(formData.endsOnDate)
                        : "Select time"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* End After - Plus/Minus Controls */}
              {formData.ends === "after" && (
                <View>
                  <Text
                    style={[
                      typography.body,
                      {
                        marginBottom: spacing[2],
                        fontWeight: "600",
                        textAlign: "center",
                      },
                    ]}
                  >
                    {formData.endsAfter ?? 1} occurrences
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing[3],
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        onUpdateFormData({
                          endsAfter: Math.max(1, (formData.endsAfter ?? 1) - 1),
                        })
                      }
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: colors.background.primary,
                        borderWidth: 1,
                        borderColor: colors.border.medium,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name="remove"
                        size={24}
                        color={colors.text.primary}
                      />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          height: 8,
                          backgroundColor: colors.border.light,
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            height: 8,
                            width: `${((formData.endsAfter ?? 1) / 100) * 100}%`,
                            backgroundColor: colors.primary[500],
                            borderRadius: 4,
                          }}
                        />
                      </View>
                    </View>
                    <Pressable
                      onPress={() =>
                        onUpdateFormData({
                          endsAfter: Math.min(
                            100,
                            (formData.endsAfter ?? 1) + 1,
                          ),
                        })
                      }
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: colors.background.primary,
                        borderWidth: 1,
                        borderColor: colors.border.medium,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name="add"
                        size={24}
                        color={colors.text.primary}
                      />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </>
        )}
      </View>

      {/* Date Pickers */}
      {/* Start Date Picker */}
      {showStartDatePicker && (
        <Modal
          transparent={true}
          visible={showStartDatePicker}
          animationType="fade"
          onRequestClose={onToggleStartDatePicker}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: spacing[4],
            }}
            onPress={() => {
              // Cancel - restore original value and close when tapping background
              setTempStartDate(formData.startDate);
              onToggleStartDatePicker();
            }}
          >
            <Pressable
              style={{
                backgroundColor: colors.background.primary,
                borderRadius: 12,
                padding: spacing[4],
                width: "100%",
                maxWidth: 400,
              }}
              onPress={(e) => e.stopPropagation()}
            >
              <DateTimePicker
                value={tempStartDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === "android") {
                    // Android: close immediately and update
                    onToggleStartDatePicker();
                    if (selectedDate) {
                      onUpdateFormData({ startDate: selectedDate });
                    }
                  } else if (selectedDate) {
                    // iOS: update temporary value but don't close
                    setTempStartDate(selectedDate);
                  }
                }}
                textColor={colors.text.primary}
              />
              {Platform.OS === "ios" && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: spacing[4],
                    gap: spacing[3],
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      // Cancel - restore original value and close
                      setTempStartDate(formData.startDate);
                      onToggleStartDatePicker();
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: spacing[3],
                      backgroundColor: colors.background.secondary,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border.medium,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={[typography.body, { color: colors.text.primary }]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      // Save temporary picker value to form and close
                      onUpdateFormData({ startDate: tempStartDate });
                      onToggleStartDatePicker();
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: spacing[3],
                      backgroundColor: colors.primary[500],
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={[typography.body, { color: colors.text.inverse }]}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* End Date Picker */}
      {showEndDatePicker && (
        <Modal
          transparent={true}
          visible={showEndDatePicker}
          animationType="fade"
          onRequestClose={onToggleEndDatePicker}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: spacing[4],
            }}
            onPress={() => {
              // Cancel - restore original value and close when tapping background
              setTempEndDate(formData.endsOnDate ?? new Date());
              onToggleEndDatePicker();
            }}
          >
            <Pressable
              style={{
                backgroundColor: colors.background.primary,
                borderRadius: 12,
                padding: spacing[4],
                width: "100%",
                maxWidth: 400,
              }}
              onPress={(e) => e.stopPropagation()}
            >
              <DateTimePicker
                value={tempEndDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === "android") {
                    // Android: close immediately and update
                    onToggleEndDatePicker();
                    if (selectedDate) {
                      onUpdateFormData({ endsOnDate: selectedDate });
                    }
                  } else if (selectedDate) {
                    // iOS: update temporary value but don't close
                    setTempEndDate(selectedDate);
                  }
                }}
                textColor={colors.text.primary}
              />
              {Platform.OS === "ios" && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: spacing[4],
                    gap: spacing[3],
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      // Cancel - restore original value and close
                      setTempEndDate(formData.endsOnDate ?? new Date());
                      onToggleEndDatePicker();
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: spacing[3],
                      backgroundColor: colors.background.secondary,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border.medium,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={[typography.body, { color: colors.text.primary }]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      // Save temporary picker value to form and close
                      onUpdateFormData({ endsOnDate: tempEndDate });
                      onToggleEndDatePicker();
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: spacing[3],
                      backgroundColor: colors.primary[500],
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={[typography.body, { color: colors.text.inverse }]}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* End Time Picker */}
      {showEndTimePicker && Platform.OS === "ios" && (
        <Modal
          transparent={true}
          visible={showEndTimePicker}
          animationType="fade"
          onRequestClose={onToggleEndTimePicker}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: spacing[4],
            }}
            onPress={() => {
              // Cancel - restore original value and close when tapping background
              setTempEndDate(formData.endsOnDate ?? new Date());
              onToggleEndTimePicker();
            }}
          >
            <Pressable
              style={{
                backgroundColor: colors.background.primary,
                borderRadius: 12,
                padding: spacing[4],
                width: "100%",
                maxWidth: 400,
              }}
              onPress={(e) => e.stopPropagation()}
            >
              <DateTimePicker
                value={tempEndDate}
                mode="time"
                display="spinner"
                onChange={(event, selectedDate) => {
                  if (selectedDate) {
                    setTempEndDate(selectedDate);
                  }
                }}
                textColor={colors.text.primary}
              />
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: spacing[4],
                  gap: spacing[3],
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    // Cancel - restore original value and close
                    setTempEndDate(formData.endsOnDate ?? new Date());
                    onToggleEndTimePicker();
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: spacing[3],
                    backgroundColor: colors.background.secondary,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border.medium,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={[typography.body, { color: colors.text.primary }]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    // Save temporary picker value to form and close
                    onUpdateFormData({ endsOnDate: tempEndDate });
                    onToggleEndTimePicker();
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: spacing[3],
                    backgroundColor: colors.primary[500],
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={[typography.body, { color: colors.text.inverse }]}
                  >
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Android End Time Picker (uses native modal) */}
      {showEndTimePicker && Platform.OS === "android" && (
        <View style={{ marginTop: spacing[3] }}>
          <DateTimePicker
            value={formData.endsOnDate ?? new Date()}
            mode="time"
            display="default"
            onChange={(event, selectedDate) => {
              onToggleEndTimePicker();
              if (selectedDate) {
                onUpdateFormData({ endsOnDate: selectedDate });
              }
            }}
            textColor={colors.text.primary}
          />
        </View>
      )}
    </>
  );
}
