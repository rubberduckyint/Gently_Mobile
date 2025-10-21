/**
 * Settings Screen
 *
 * Allows users to update their profile information and alarm preferences
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { AlarmPreferencesSection } from "~/components/AlarmPreferencesSection";
import { Header } from "~/components/ui/Header";
import {
  buttons,
  buttonText,
  colors,
  containers,
  inputs,
  spacing,
  typography,
} from "~/styles";
import { authClient } from "~/utils/auth";
import { trpc } from "~/utils/api";

export default function SettingsPage() {
  const { data: session } = authClient.useSession();
  const [name, setName] = useState(session?.user.name ?? "");
  const [_email] = useState(session?.user.email ?? "");

  // Fetch user preferences
  const { data: preferences, refetch: refetchPreferences } =
    trpc.userPreferences.get.useQuery();

  // Alarm preference states
  const [severityLevel, setSeverityLevel] = useState<
    "INFORMATIONAL" | "WARNING" | "CRITICAL"
  >("INFORMATIONAL");
  const [ledPattern, setLedPattern] = useState<
    "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE"
  >("BLINK_SLOW");
  const [ledColor, setLedColor] = useState<
    "RED" | "GREEN" | "BLUE" | "YELLOW" | "MAGENTA" | "CYAN" | "WHITE"
  >("BLUE");
  const [vibrationIntensity, setVibrationIntensity] = useState<
    "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM"
  >("MEDIUM");
  const [snoozePeriod, setSnoozePeriod] = useState("5");
  const [snoozeTimeout, setSnoozeTimeout] = useState("15");
  const [retriggerDelay, setRetriggerDelay] = useState("1");
  const [retriggerTimeout, setRetriggerTimeout] = useState("5");

  // Update local state when preferences load
  React.useEffect(() => {
    if (preferences) {
      setSeverityLevel(preferences.defaultSeverityLevel);
      setLedPattern(preferences.defaultLedPattern);
      setLedColor(preferences.defaultLedColor);
      setVibrationIntensity(preferences.defaultVibrationIntensity);
      setSnoozePeriod(preferences.defaultSnoozePeriod.toString());
      setSnoozeTimeout(preferences.defaultSnoozeTimeout.toString());
      setRetriggerDelay(preferences.defaultRetriggerDelay.toString());
      setRetriggerTimeout(preferences.defaultRetriggerTimeout.toString());
    }
  }, [preferences]);

  const updatePreferencesMutation = trpc.userPreferences.update.useMutation({
    onSuccess: () => {
      void refetchPreferences();
      Alert.alert("Success", "Alarm preferences updated successfully!");
    },
    onError: (error: Error) => {
      console.error("❌ Failed to update preferences:", error);
      Alert.alert("Error", error.message || "Failed to update preferences");
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (_data: { name: string }) => {
      // Implement the actual update profile API call here
      // This is a placeholder for the actual implementation
      return await new Promise((resolve) => {
        setTimeout(() => resolve({ success: true }), 1000);
      });
    },
    onSuccess: () => {
      Alert.alert("Success", "Profile updated successfully!");
    },
    onError: (error: Error) => {
      console.error("❌ Failed to update profile:", error);
      Alert.alert("Error", error.message || "Failed to update profile");
    },
  });

  const handleSaveProfile = () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter your name");
      return;
    }

    updateProfileMutation.mutate({ name: name.trim() });
  };

  const handleSavePreferences = () => {
    const snooze = parseInt(snoozePeriod);
    const snoozeT = parseInt(snoozeTimeout);
    const retrigger = parseInt(retriggerDelay);
    const retriggerT = parseInt(retriggerTimeout);

    if (
      isNaN(snooze) ||
      isNaN(snoozeT) ||
      isNaN(retrigger) ||
      isNaN(retriggerT)
    ) {
      Alert.alert("Error", "Please enter valid numbers for all time values");
      return;
    }

    if (
      snooze < 0 ||
      snooze > 255 ||
      snoozeT < 0 ||
      snoozeT > 255 ||
      retrigger < 0 ||
      retrigger > 255 ||
      retriggerT < 0 ||
      retriggerT > 255
    ) {
      Alert.alert(
        "Error",
        "All time values must be between 0 and 255 minutes",
      );
      return;
    }

    updatePreferencesMutation.mutate({
      defaultSeverityLevel: severityLevel,
      defaultLedPattern: ledPattern,
      defaultLedColor: ledColor,
      defaultVibrationPattern: 1, // Fixed for now
      defaultVibrationIntensity: vibrationIntensity,
      defaultSnoozePeriod: snooze,
      defaultSnoozeTimeout: snoozeT,
      defaultRetriggerDelay: retrigger,
      defaultRetriggerTimeout: retriggerT,
    });
  };

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header
        title="Settings"
        showBackButton={true}
        rightButton={{
          icon: "home",
          onPress: () => router.push("/dashboard"),
          accessibilityLabel: "Go to dashboard",
        }}
      />
      <ScrollView style={containers.content}>
        <View style={{ paddingVertical: spacing[6] }}>
          {/* Name Field */}
          <View style={inputs.container}>
            <Text style={inputs.label}>Full Name</Text>
            <TextInput
              style={inputs.base}
              value={name}
              onChangeText={setName}
              placeholder="Enter your full name"
              placeholderTextColor={colors.text.tertiary}
              editable={!updateProfileMutation.isPending}
            />
          </View>

          {/* Email Field (Read-only) */}
          <View style={inputs.container}>
            <Text style={inputs.label}>Email Address</Text>
            <TextInput
              style={[inputs.base, { backgroundColor: colors.gray[100] }]}
              value={_email}
              placeholder="Email address"
              placeholderTextColor={colors.text.tertiary}
              editable={false}
            />
            <Text
              style={[
                typography.caption,
                { color: colors.text.tertiary, marginTop: spacing[1] },
              ]}
            >
              Email cannot be changed from this screen
            </Text>
          </View>

          {/* Save Button */}
          <Pressable
            style={[
              buttons.base,
              buttons.large,
              buttons.primary,
              updateProfileMutation.isPending && buttons.disabled,
            ]}
            onPress={handleSaveProfile}
            disabled={updateProfileMutation.isPending}
          >
            {updateProfileMutation.isPending ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <Text style={buttonText.primary}>Save Changes</Text>
            )}
          </Pressable>

          {/* Alarm Preferences Section */}
          <AlarmPreferencesSection
            severityLevel={severityLevel}
            setSeverityLevel={setSeverityLevel}
            ledPattern={ledPattern}
            setLedPattern={setLedPattern}
            ledColor={ledColor}
            setLedColor={setLedColor}
            vibrationIntensity={vibrationIntensity}
            setVibrationIntensity={setVibrationIntensity}
            snoozePeriod={snoozePeriod}
            setSnoozePeriod={setSnoozePeriod}
            snoozeTimeout={snoozeTimeout}
            setSnoozeTimeout={setSnoozeTimeout}
            retriggerDelay={retriggerDelay}
            setRetriggerDelay={setRetriggerDelay}
            retriggerTimeout={retriggerTimeout}
            setRetriggerTimeout={setRetriggerTimeout}
            onSave={handleSavePreferences}
            isSaving={updatePreferencesMutation.isPending ?? false}
          />

          {/* Account Section */}
          <View
            style={{
              marginTop: spacing[10],
              paddingTop: spacing[6],
              borderTopWidth: 1,
              borderTopColor: colors.border.light,
            }}
          >
            <Text style={[typography.h5, { marginBottom: spacing[4] }]}>
              Account Information
            </Text>

            <View
              style={{
                backgroundColor: colors.gray[50],
                padding: spacing[4],
                borderRadius: 8,
                marginBottom: spacing[4],
              }}
            >
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Account Status
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.success[600], marginTop: spacing[1] },
                ]}
              >
                ✓ Verified Account
              </Text>
            </View>

            <View
              style={{
                backgroundColor: colors.gray[50],
                padding: spacing[4],
                borderRadius: 8,
              }}
            >
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Member Since
              </Text>
              <Text style={[typography.body, { marginTop: spacing[1] }]}>
                {session?.user.createdAt
                  ? new Date(session.user.createdAt).toLocaleDateString()
                  : "Unknown"}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
