/**
 * AlarmForm Component
 *
 * Unified alarm form that can be used for both adding and editing alarms.
 * Handles all form state and validation internally.
 */

import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { AlarmFormData } from "~/types";
import { buttons, buttonText, colors, spacing } from "~/styles";
import { AdvancedSection } from "./AdvancedSection";
import { BasicInfoSection } from "./BasicInfoSection";
import { NotificationsSection } from "./NotificationsSection";
import { ScheduleSection } from "./ScheduleSection";
import { TemplatesSection } from "./TemplatesSection";

export interface AlarmFormProps {
  initialData: AlarmFormData;
  onSave: (data: AlarmFormData) => void;
  onCancel: () => void;
  saveButtonText?: string;
  isLoading?: boolean;
  showTemplates?: boolean;
  /** Optional banner to show at the top of the form */
  topBanner?: React.ReactNode;
}

export function AlarmForm({
  initialData,
  onSave,
  onCancel,
  saveButtonText = "Save Alarm",
  isLoading = false,
  showTemplates = true,
  topBanner,
}: AlarmFormProps) {
  const [formData, setFormData] = useState<AlarmFormData>(initialData);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // Sync internal state when initialData changes (e.g., when isActive is toggled)
  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const isFormValid = formData.title.trim().length > 0;

  const updateFormData = (updates: Partial<AlarmFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = () => {
    // Validate required fields
    if (!formData.title.trim()) {
      setShowValidationErrors(true);
      Alert.alert("Error", "Alarm title is required");
      return;
    }

    onSave(formData);
  };

  const handleTemplateSelect = (templateData: Partial<AlarmFormData>) => {
    // Merge template data with current form data, using template's startDate if provided
    setFormData((prev) => ({
      ...prev,
      ...templateData,
    }));
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: spacing[3],
          paddingBottom: spacing[8],
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Optional Top Banner */}
        {topBanner}

        {/* Templates Section */}
        {showTemplates && (
          <TemplatesSection onSelectTemplate={handleTemplateSelect} />
        )}

        {/* Basic Information Section */}
        <BasicInfoSection
          formData={formData}
          onUpdateFormData={updateFormData}
          showValidationErrors={showValidationErrors}
        />

        {/* Schedule Section */}
        <ScheduleSection
          formData={formData}
          onUpdateFormData={updateFormData}
          showStartDatePicker={showStartDatePicker}
          onToggleStartDatePicker={() =>
            setShowStartDatePicker(!showStartDatePicker)
          }
          showStartTimePicker={showStartTimePicker}
          onToggleStartTimePicker={() =>
            setShowStartTimePicker(!showStartTimePicker)
          }
          showEndDatePicker={showEndDatePicker}
          onToggleEndDatePicker={() => setShowEndDatePicker(!showEndDatePicker)}
          showEndTimePicker={showEndTimePicker}
          onToggleEndTimePicker={() => setShowEndTimePicker(!showEndTimePicker)}
        />

        {/* Notifications Section */}
        <NotificationsSection
          formData={formData}
          onUpdateFormData={updateFormData}
        />

        {/* Advanced Settings Section */}
        <AdvancedSection
          formData={formData}
          onUpdateFormData={updateFormData}
        />
      </ScrollView>

      {/* Fixed Action Buttons */}
      <View
        style={{
          flexDirection: "row",
          padding: spacing[3],
          paddingTop: spacing[3],
          borderTopWidth: 1,
          borderTopColor: colors.border.light,
          backgroundColor: colors.background.primary,
          gap: spacing[3],
        }}
      >
        {/* Cancel Button */}
        <Pressable
          onPress={onCancel}
          disabled={isLoading}
          style={({ pressed }) => [
            buttons.base,
            buttons.medium,
            buttons.secondary,
            isLoading && buttons.disabled,
            pressed && { opacity: 0.8 },
            { flex: 1 },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing[2],
            }}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={colors.text.primary}
            />
            <Text style={[buttonText.secondary]}>Cancel</Text>
          </View>
        </Pressable>

        {/* Save Button */}
        <Pressable
          onPress={handleSave}
          disabled={!isFormValid || isLoading}
          style={({ pressed }) => [
            buttons.base,
            buttons.medium,
            buttons.primary,
            (!isFormValid || isLoading) && buttons.disabled,
            pressed && { opacity: 0.8 },
            { flex: 1 },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing[2],
            }}
          >
            {isLoading ? (
              <Ionicons
                name="sync"
                size={20}
                color={colors.background.primary}
              />
            ) : (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.background.primary}
              />
            )}
            <Text style={[buttonText.primary]}>
              {isLoading ? "Saving..." : saveButtonText}
            </Text>
          </View>
        </Pressable>
      </View>
    </>
  );
}
