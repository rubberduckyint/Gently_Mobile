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
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  LedColor,
  LedPattern,
  VibrationIntensity,
} from "@gently/db/schema";

import { AlarmPreferencesSection } from "~/components/AlarmPreferencesSection";
import { Header } from "~/components/ui/Header";
import {
  buttons,
  buttonText,
  cards,
  colors,
  containers,
  inputs,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

export default function SettingsPage() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState(session?.user.name ?? "");
  const [_email] = useState(session?.user.email ?? "");
  const [yearOfBirth, setYearOfBirth] = useState("");

  // Fetch user profile to get year of birth
  const { data: userProfile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["userProfile"],
    queryFn: () => trpc.auth.getProfile.query(),
    enabled: !!session?.user,
  });

  // Update local state when user profile loads
  React.useEffect(() => {
    if (userProfile) {
      setYearOfBirth(userProfile.yearOfBirth?.toString() ?? "");
    }
  }, [userProfile]);

  // Fetch user preferences using React Query
  const { data: preferences, isLoading: isLoadingPreferences } = useQuery({
    queryKey: ["userPreferences"],
    queryFn: () => trpc.userPreferences.get.query({}),
    enabled: !!session?.user,
  });

  // Alarm preference states (using shared types)
  const [ledPattern, setLedPattern] = useState<LedPattern>("BLINK_SLOW");
  const [ledColor, setLedColor] = useState<LedColor>("BLUE");
  const [vibrationIntensity, setVibrationIntensity] =
    useState<VibrationIntensity>("MEDIUM");
  const [snoozePeriod, setSnoozePeriod] = useState("5");

  // Update local state when preferences load
  React.useEffect(() => {
    if (preferences) {
      setLedPattern(preferences.defaultLedPattern);
      setLedColor(preferences.defaultLedColor);
      setVibrationIntensity(preferences.defaultVibrationIntensity);
      setSnoozePeriod(preferences.defaultSnoozePeriod.toString());
    }
  }, [preferences]);

  const updatePreferencesMutation = useMutation({
    mutationFn: async (
      data: Partial<{
        defaultLedPattern: LedPattern;
        defaultLedColor: LedColor;
        defaultVibrationIntensity: VibrationIntensity;
        defaultSnoozePeriod: number;
      }>,
    ) => {
      return await trpc.userPreferences.update.mutate(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
      Alert.alert("Success", "Alarm preferences updated successfully!");
    },
    onError: (error: Error) => {
      console.error("❌ Failed to update preferences:", error);
      Alert.alert("Error", error.message || "Failed to update preferences");
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name: string; yearOfBirth?: number }) => {
      return await trpc.auth.update.mutate(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["userProfile"] });
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

    const data: { name: string; yearOfBirth?: number } = {
      name: name.trim(),
    };

    // Add year of birth if provided
    if (yearOfBirth.trim()) {
      const year = parseInt(yearOfBirth);
      if (isNaN(year)) {
        Alert.alert("Error", "Please enter a valid year of birth");
        return;
      }

      const currentYear = new Date().getFullYear();
      if (year < 1900 || year > currentYear) {
        Alert.alert(
          "Error",
          `Please enter a year between 1900 and ${currentYear}`,
        );
        return;
      }

      data.yearOfBirth = year;
    }

    updateProfileMutation.mutate(data);
  };

  const handleSavePreferences = () => {
    const snooze = parseInt(snoozePeriod);

    if (isNaN(snooze)) {
      Alert.alert("Error", "Please enter a valid number for snooze period");
      return;
    }

    if (snooze < 1 || snooze > 60) {
      Alert.alert("Error", "Snooze period must be between 1 and 60 minutes");
      return;
    }

    updatePreferencesMutation.mutate({
      defaultLedPattern: ledPattern,
      defaultLedColor: ledColor,
      defaultVibrationIntensity: vibrationIntensity,
      defaultSnoozePeriod: snooze,
    });
  };

  // Show loading state while preferences are being fetched
  if (isLoadingPreferences || isLoadingProfile) {
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
        <View style={containers.contentCentered}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text
            style={[
              typography.body,
              {
                marginTop: spacing[3],
                color: colors.gray[500],
                textAlign: "center",
              },
            ]}
          >
            Loading preferences...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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
      <ScrollView
        style={containers.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingVertical: spacing[4], gap: spacing[4] }}>
          {/* Profile Card */}
          <View style={cards.base}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing[4],
              }}
            >
              <Ionicons
                name="person-circle-outline"
                size={24}
                color={colors.primary[500]}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={typography.h5}>Profile</Text>
            </View>

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

            <View style={inputs.container}>
              <Text style={inputs.label}>Year of Birth</Text>
              <TextInput
                style={inputs.base}
                value={yearOfBirth}
                onChangeText={setYearOfBirth}
                placeholder="YYYY"
                keyboardType="numeric"
                maxLength={4}
                placeholderTextColor={colors.text.tertiary}
                editable={!updateProfileMutation.isPending}
              />
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.tertiary, marginTop: spacing[1] },
                ]}
              >
                We use this to personalize your experience (optional)
              </Text>
            </View>

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
                <Text style={buttonText.primary}>Save Profile</Text>
              )}
            </Pressable>
          </View>

          {/* Alarm Defaults Card */}
          <View style={cards.base}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing[2],
              }}
            >
              <Ionicons
                name="alarm-outline"
                size={24}
                color={colors.primary[500]}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={typography.h5}>Alarm Defaults</Text>
            </View>
            <Text
              style={[
                typography.caption,
                { color: colors.text.secondary, marginBottom: spacing[4] },
              ]}
            >
              These settings will be used as defaults when creating new alarms
            </Text>

            <AlarmPreferencesSection
              ledPattern={ledPattern}
              setLedPattern={setLedPattern}
              ledColor={ledColor}
              setLedColor={setLedColor}
              vibrationIntensity={vibrationIntensity}
              setVibrationIntensity={setVibrationIntensity}
              snoozePeriod={snoozePeriod}
              setSnoozePeriod={setSnoozePeriod}
              onSave={handleSavePreferences}
              isSaving={updatePreferencesMutation.isPending}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
