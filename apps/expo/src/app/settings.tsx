/**
 * Settings Screen
 *
 * Allows users to update their profile information, alarm preferences, and notification settings.
 * Organized with tabs for better navigation.
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { LedColor, LedPattern, VibrationIntensity } from "~/types";
import { AlarmPreferencesSection } from "~/components/AlarmPreferencesSection";
import { Header } from "~/components/ui/Header";
import {
  trackAlarmPreferencesChanged,
  trackSettingsUpdated,
} from "~/services/analytics";
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

type SettingsTab = "profile" | "alarms" | "notifications";

interface TabButtonProps {
  tab: SettingsTab;
  activeTab: SettingsTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

function TabButton({ tab, activeTab, label, icon, onPress }: TabButtonProps) {
  const isActive = tab === activeTab;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: "column",
        alignItems: "center",
        paddingVertical: spacing[2],
        paddingHorizontal: spacing[1],
        borderBottomWidth: 2,
        borderBottomColor: isActive ? colors.primary[500] : "transparent",
        backgroundColor: isActive ? colors.primary[50] : "transparent",
      }}
    >
      <Ionicons
        name={icon}
        size={20}
        color={isActive ? colors.primary[500] : colors.text.secondary}
      />
      <Text
        style={[
          typography.caption,
          {
            marginTop: 2,
            color: isActive ? colors.primary[600] : colors.text.secondary,
            fontWeight: isActive ? "600" : "400",
            fontSize: 11,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function SettingsPage() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
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
  useEffect(() => {
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
  const [ledPattern, setLedPattern] = useState<LedPattern>("OFF");
  const [ledColor, setLedColor] = useState<LedColor>("BLUE");
  const [vibrationIntensity, setVibrationIntensity] =
    useState<VibrationIntensity>("MEDIUM");
  const [snoozePeriod, setSnoozePeriod] = useState("5");

  // Notification preference states
  const [defaultPushNotification, setDefaultPushNotification] = useState(true);
  const [defaultEmailNotification, setDefaultEmailNotification] =
    useState(false);

  // Update local state when preferences load
  useEffect(() => {
    if (preferences) {
      setLedPattern(preferences.defaultLedPattern);
      setLedColor(preferences.defaultLedColor);
      setVibrationIntensity(preferences.defaultVibrationIntensity);
      setSnoozePeriod(preferences.defaultSnoozePeriod.toString());
      setDefaultPushNotification(preferences.defaultPushNotification ?? true);
      setDefaultEmailNotification(
        preferences.defaultEmailNotification ?? false,
      );
    }
  }, [preferences]);

  const updatePreferencesMutation = useMutation({
    mutationFn: async (
      data: Partial<{
        defaultLedPattern: LedPattern;
        defaultLedColor: LedColor;
        defaultVibrationIntensity: VibrationIntensity;
        defaultSnoozePeriod: number;
        defaultPushNotification: boolean;
        defaultEmailNotification: boolean;
      }>,
    ) => {
      return await trpc.userPreferences.update.mutate(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
      trackAlarmPreferencesChanged();
      Alert.alert("Success", "Preferences updated successfully!");
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
      trackSettingsUpdated("profile");
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

  const handleSaveAlarmPreferences = () => {
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

  const handleSaveNotificationPreferences = () => {
    updatePreferencesMutation.mutate({
      defaultPushNotification,
      defaultEmailNotification,
    });
  };

  // Show loading state while preferences are being fetched
  if (isLoadingPreferences || isLoadingProfile) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="Settings" showBackButton={true} />
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

  const renderProfileTab = () => (
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
        <Text style={typography.h5}>Profile Information</Text>
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
  );

  const renderAlarmsTab = () => (
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
        onSave={handleSaveAlarmPreferences}
        isSaving={updatePreferencesMutation.isPending}
      />
    </View>
  );

  const renderNotificationsTab = () => (
    <View style={{ gap: spacing[4] }}>
      {/* Notification Defaults Card */}
      <View style={cards.base}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: spacing[2],
          }}
        >
          <Ionicons
            name="notifications-outline"
            size={24}
            color={colors.primary[500]}
            style={{ marginRight: spacing[2] }}
          />
          <Text style={typography.h5}>Default Notifications</Text>
        </View>
        <Text
          style={[
            typography.caption,
            { color: colors.text.secondary, marginBottom: spacing[4] },
          ]}
        >
          These settings will be applied to new alarms by default
        </Text>

        {/* Push Notifications Toggle */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: spacing[3],
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
          }}
        >
          <View style={{ flex: 1, marginRight: spacing[3] }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="phone-portrait-outline"
                size={20}
                color={colors.text.primary}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={typography.labelLarge}>Push Notifications</Text>
            </View>
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.secondary,
                  marginTop: spacing[1],
                  marginLeft: 28,
                },
              ]}
            >
              Receive alerts on your phone when alarms go off
            </Text>
          </View>
          <Switch
            value={defaultPushNotification}
            onValueChange={setDefaultPushNotification}
            trackColor={{ false: colors.gray[300], true: colors.primary[300] }}
            thumbColor={
              defaultPushNotification ? colors.primary[500] : colors.gray[100]
            }
          />
        </View>

        {/* Email Notifications Toggle */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: spacing[3],
          }}
        >
          <View style={{ flex: 1, marginRight: spacing[3] }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={colors.text.primary}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={typography.labelLarge}>Email Notifications</Text>
            </View>
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.secondary,
                  marginTop: spacing[1],
                  marginLeft: 28,
                },
              ]}
            >
              Receive email alerts when alarms go off
            </Text>
          </View>
          <Switch
            value={defaultEmailNotification}
            onValueChange={setDefaultEmailNotification}
            trackColor={{ false: colors.gray[300], true: colors.primary[300] }}
            thumbColor={
              defaultEmailNotification ? colors.primary[500] : colors.gray[100]
            }
          />
        </View>

        <Pressable
          style={[
            buttons.base,
            buttons.large,
            buttons.primary,
            { marginTop: spacing[4] },
            updatePreferencesMutation.isPending && buttons.disabled,
          ]}
          onPress={handleSaveNotificationPreferences}
          disabled={updatePreferencesMutation.isPending}
        >
          {updatePreferencesMutation.isPending ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <Text style={buttonText.primary}>Save Notification Settings</Text>
          )}
        </Pressable>
      </View>

      {/* Push Notification Status Card */}
      <View style={cards.base}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: spacing[3],
          }}
        >
          <Ionicons
            name="information-circle-outline"
            size={24}
            color={colors.primary[500]}
            style={{ marginRight: spacing[2] }}
          />
          <Text style={typography.h5}>Push Notification Status</Text>
        </View>

        <View
          style={{
            backgroundColor: colors.gray[50],
            padding: spacing[3],
            borderRadius: 8,
          }}
        >
          {preferences?.pushNotificationToken ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.status.synced}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={[typography.body, { color: colors.status.synced }]}>
                Push notifications are enabled
              </Text>
            </View>
          ) : (
            <View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name="alert-circle"
                  size={20}
                  color={colors.status.pending}
                  style={{ marginRight: spacing[2] }}
                />
                <Text
                  style={[typography.body, { color: colors.status.pending }]}
                >
                  Push notifications not configured
                </Text>
              </View>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginTop: spacing[2] },
                ]}
              >
                Push notifications will be set up when an alarm with push
                notifications enabled first triggers.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header title="Settings" showBackButton={true} />

      {/* Tab Bar */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.background.primary,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
        }}
      >
        <TabButton
          tab="profile"
          activeTab={activeTab}
          label="Profile"
          icon="person-outline"
          onPress={() => setActiveTab("profile")}
        />
        <TabButton
          tab="alarms"
          activeTab={activeTab}
          label="Alarms"
          icon="alarm-outline"
          onPress={() => setActiveTab("alarms")}
        />
        <TabButton
          tab="notifications"
          activeTab={activeTab}
          label="Notifications"
          icon="notifications-outline"
          onPress={() => setActiveTab("notifications")}
        />
      </View>

      <ScrollView
        style={containers.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingVertical: spacing[4] }}>
          {activeTab === "profile" && renderProfileTab()}
          {activeTab === "alarms" && renderAlarmsTab()}
          {activeTab === "notifications" && renderNotificationsTab()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
