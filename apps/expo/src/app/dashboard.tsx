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
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { devicesBeingDeleted } from "~/utils/deviceDeletionTracker";
import {
  hasSeenOnboarding,
  markOnboardingComplete,
  resetOnboarding,
} from "~/utils/userPreferences";

type DeviceWithAlarmsCount = RouterOutputs["device"]["getAll"][number];

function DeviceCard({ device }: { device: DeviceWithAlarmsCount }) {
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
            pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
          ]}
        >
          {/* Device Header */}
          <View
            style={[flex.row, flex.itemsCenter, { marginBottom: spacing[3] }]}
          >
            {/* Device Avatar */}
            <View
              style={[
                avatars.base,
                avatars.medium,
                { backgroundColor: colors.primary[500] },
              ]}
            >
              <Text style={[avatars.text, avatars.textMedium]}>
                {device.title.slice(0, 2).toUpperCase()}
              </Text>
            </View>

            {/* Device Info */}
            <View style={[flex.flex1, { marginLeft: spacing[3] }]}>
              <Text style={typography.h6}>{device.title}</Text>
              {device.description && (
                <Text
                  style={[
                    typography.bodySmall,
                    { color: colors.text.secondary },
                  ]}
                >
                  {device.description}
                </Text>
              )}
              {device.serialNumber && (
                <Text
                  style={[
                    typography.caption,
                    {
                      color: colors.primary[600],
                      marginTop: spacing[1],
                    },
                  ]}
                >
                  Serial: {device.serialNumber}
                </Text>
              )}
            </View>

            {/* Clickable indicator */}
            <View style={{ marginLeft: spacing[2] }}>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.text.secondary}
              />
            </View>
          </View>
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
                label: "Settings",
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
              renderItem={({ item }) => <DeviceCard device={item} />}
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
