/**
 * Dashboard Screen using the new design system
 *
 * This demonstrates the practical application of the design system
 * with improved consistency and maintainability
 */

import React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { HamburgerMenu } from "~/components/ui/HamburgerMenu";
import { Header } from "~/components/ui/Header";
import { HelpModal } from "~/components/ui/HelpModal";
// Import the new design system
import {
  avatars,
  buttons,
  buttonText,
  cards,
  colors,
  commonStyles,
  containers,
  emptyStates,
  flex,
  spacing,
  typography,
} from "~/styles";
import { calculateNextAlarmOccurrence } from "~/utils/alarmUtils";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { devicesBeingDeleted } from "~/utils/deviceDeletionTracker";
import {
  hasSeenOnboarding,
  markOnboardingComplete,
  resetOnboarding,
} from "~/utils/userPreferences";

type DeviceWithAlarmsCount = RouterOutputs["device"]["getAll"][number];

interface Alarm {
  id: string;
  title: string;
  isActive: boolean;
  startDate: Date;
  endDate: Date | null;
  repeat: boolean;
  cronExpression: string | null;
  deviceId: string | null;
}

function DeviceCard({
  device,
  alarms,
}: {
  device: DeviceWithAlarmsCount;
  alarms: Alarm[];
}) {
  // Filter alarms for this device
  const deviceAlarms = React.useMemo(() => {
    return alarms.filter((alarm) => alarm.deviceId === device.id);
  }, [alarms, device.id]);

  // Calculate next alarm
  const nextAlarm = React.useMemo(() => {
    if (deviceAlarms.length === 0) return null;

    // Filter active alarms and calculate next occurrence for each
    const activeAlarms = deviceAlarms
      .filter(
        (alarm): alarm is Alarm & { cronExpression: string } =>
          alarm.isActive && alarm.cronExpression !== null,
      )
      .map((alarm) => {
        const scheduleInfo = calculateNextAlarmOccurrence({
          isActive: alarm.isActive,
          startDate: alarm.startDate,
          endDate: alarm.endDate,
          repeat: alarm.repeat,
          cronExpression: alarm.cronExpression,
        });
        return {
          alarm,
          scheduleInfo,
        };
      })
      .filter(
        ({ scheduleInfo }) =>
          scheduleInfo.status === "active" && scheduleInfo.nextOccurrence,
      )
      .sort((a, b) => {
        if (!a.scheduleInfo.nextOccurrence || !b.scheduleInfo.nextOccurrence)
          return 0;
        return (
          a.scheduleInfo.nextOccurrence.getTime() -
          b.scheduleInfo.nextOccurrence.getTime()
        );
      });

    return activeAlarms[0] ?? null;
  }, [deviceAlarms]);

  // Format next alarm time
  const formatNextAlarmTime = (date: Date) => {
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const isTomorrow =
      date.getDate() === now.getDate() + 1 &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    if (isToday) return `Today at ${timeStr}`;
    if (isTomorrow) return `Tomorrow at ${timeStr}`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <View style={{ marginBottom: spacing[4] }}>
      <Link
        href={{
          pathname: "/devices/[deviceId]",
          params: { deviceId: device.id },
        }}
        asChild
      >
        <Pressable
          style={({ pressed }) => [
            cards.base,
            cards.interactive,
            { minHeight: 140 },
            pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
          ]}
        >
          {/* Device Header */}
          <View
            style={[flex.row, flex.itemsCenter, { marginBottom: spacing[4] }]}
          >
            {/* Device Avatar */}
            <View
              style={[
                avatars.base,
                avatars.large,
                { backgroundColor: colors.primary[500] },
              ]}
            >
              <Text style={[avatars.text, avatars.textLarge]}>
                {device.title.slice(0, 2).toUpperCase()}
              </Text>
            </View>

            {/* Device Info */}
            <View style={[flex.flex1, { marginLeft: spacing[4] }]}>
              <Text style={typography.h5}>{device.title}</Text>
              {device.description && (
                <Text
                  style={[
                    typography.bodySmall,
                    { color: colors.text.secondary, marginTop: spacing[1] },
                  ]}
                >
                  {device.description}
                </Text>
              )}
            </View>

            {/* Clickable indicator */}
            <View style={{ marginLeft: spacing[2] }}>
              <Ionicons
                name="chevron-forward"
                size={24}
                color={colors.text.secondary}
              />
            </View>
          </View>

          {/* Alarm Count */}
          <View
            style={[
              flex.row,
              flex.itemsCenter,
              { marginBottom: nextAlarm ? spacing[3] : 0 },
            ]}
          >
            <Ionicons
              name="alarm-outline"
              size={18}
              color={colors.text.secondary}
            />
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, marginLeft: spacing[2] },
              ]}
            >
              {device._count.alarms === 0
                ? "No alarms"
                : device._count.alarms === 1
                  ? "1 alarm"
                  : `${device._count.alarms} alarms`}
            </Text>
          </View>

          {/* Next Alarm */}
          {nextAlarm?.scheduleInfo.nextOccurrence && (
            <View
              style={[
                {
                  backgroundColor: colors.primary[50],
                  padding: spacing[3],
                  borderRadius: 8,
                  borderLeftWidth: 3,
                  borderLeftColor: colors.primary[500],
                },
              ]}
            >
              <Text
                style={[
                  typography.caption,
                  {
                    color: colors.text.secondary,
                    marginBottom: spacing[1],
                    textTransform: "uppercase",
                  },
                ]}
              >
                Next Alarm
              </Text>
              <Text
                style={[
                  typography.h6,
                  {
                    color: colors.text.primary,
                    marginBottom: spacing[1],
                  },
                ]}
              >
                {nextAlarm.alarm.title}
              </Text>
              <View style={[flex.row, flex.itemsCenter]}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={colors.primary[600]}
                />
                <Text
                  style={[
                    typography.bodySmall,
                    {
                      color: colors.primary[600],
                      marginLeft: spacing[1],
                      fontWeight: "600",
                    },
                  ]}
                >
                  {formatNextAlarmTime(nextAlarm.scheduleInfo.nextOccurrence)}
                </Text>
              </View>
            </View>
          )}
        </Pressable>
      </Link>
    </View>
  );
}

export default function DashboardPage() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const [showHelpModal, setShowHelpModal] = React.useState(false);

  // Check if user has seen onboarding on mount
  React.useEffect(() => {
    const checkOnboarding = async () => {
      const hasSeen = await hasSeenOnboarding();
      if (!hasSeen) {
        // Show help modal on first login
        setShowHelpModal(true);
      }
    };
    void checkOnboarding();
  }, []);

  const {
    data: devices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["devices"],
    queryFn: () => trpc.device.getAll.query({}),
    enabled: !!session?.user,
    refetchOnMount: "always", // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when app comes to foreground
    staleTime: 0, // Consider data stale immediately
    gcTime: 0, // No garbage collection time - data removed immediately
  });

  // Fetch all alarms for the user
  const { data: allAlarms = [] } = useQuery({
    queryKey: ["alarms"],
    queryFn: () => trpc.alarm.getAll.query({}),
    enabled: !!session?.user,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      // Reset user preferences on logout
      await resetOnboarding();
      await authClient.signOut();
    },
    onSuccess: () => {
      router.replace("/");
    },
    onError: (error) => {
      console.error("❌ Failed to sign out:", error);
      Alert.alert("Error", "Failed to sign out. Please try again.");
    },
  });

  useFocusEffect(
    React.useCallback(() => {
      if (session?.user) {
        // Don't refetch if any device is currently being deleted
        // This prevents the app from reloading during the deletion process
        if (devicesBeingDeleted.size > 0) {
          console.log(
            "⏸️ Skipping dashboard refetch - device deletion in progress",
          );
          return;
        }

        // Invalidate queries to ensure fresh data on next mount
        // The useQuery hook will automatically refetch due to refetchOnMount: "always"
        void queryClient.invalidateQueries({ queryKey: ["devices"] });
      }
    }, [session, queryClient]),
  );

  const handleAddDevice = () => {
    router.push("/add-device");
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", onPress: () => signOutMutation.mutate() },
    ]);
  };

  const handleUserProfile = () => {
    console.log(
      "🔧 Dashboard: Settings button pressed, navigating to /settings",
    );
    router.push("/settings");
  };

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View style={commonStyles.fullScreenLoading}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, marginTop: spacing[3] },
            ]}
          >
            Loading your Gentlys...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View style={commonStyles.fullScreenLoading}>
          <Text style={[typography.h4, { color: colors.error[600] }]}>
            Something went wrong
          </Text>
          <Text
            style={[
              typography.body,
              {
                color: colors.text.secondary,
                textAlign: "center",
                marginTop: spacing[2],
                marginBottom: spacing[6],
              },
            ]}
          >
            {error.message}
          </Text>
          <Pressable
            style={[buttons.base, buttons.medium, buttons.primary]}
            onPress={() => refetch()}
          >
            <Text style={buttonText.primary}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header
        title="Your Gentlys"
        showBackButton={false}
        rightComponent={
          <HamburgerMenu
            options={[
              {
                label: "Help",
                onPress: () => setShowHelpModal(true),
                icon: "help-circle",
              },
              {
                label: "User Settings",
                onPress: handleUserProfile,
                icon: "settings",
              },
              {
                label: "Sign Out",
                onPress: handleSignOut,
                icon: "log-out",
                destructive: true,
              },
            ]}
          />
        }
      />

      {/* Content */}
      <View style={containers.content}>
        {!devices || devices.length === 0 ? (
          /* Empty State */
          <View style={emptyStates.container}>
            <Text style={[typography.h4, { marginBottom: spacing[2] }]}>
              No Gentlys yet
            </Text>
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  textAlign: "center",
                  lineHeight: 24,
                  marginBottom: spacing[8],
                },
              ]}
            >
              Add your first Gently to start managing alarms and notifications.
            </Text>
            <Pressable
              style={[buttons.base, buttons.large, buttons.success]}
              onPress={handleAddDevice}
            >
              <Text style={buttonText.success}>Add Your First Gently</Text>
            </Pressable>
          </View>
        ) : (
          /* Device List */
          <View style={{ paddingVertical: spacing[4] }}>
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <DeviceCard device={item} alarms={allAlarms} />
              )}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={() => (
                <Pressable
                  style={[
                    buttons.base,
                    buttons.large,
                    buttons.outline,
                    { marginTop: spacing[4] },
                  ]}
                  onPress={handleAddDevice}
                >
                  <Text style={buttonText.outline}>+ Add Another Gently</Text>
                </Pressable>
              )}
            />
          </View>
        )}
      </View>

      {/* Help Modal */}
      <HelpModal
        visible={showHelpModal}
        onClose={async () => {
          setShowHelpModal(false);
          await markOnboardingComplete();
        }}
      />
    </SafeAreaView>
  );
}
