/**
 * Dashboard Screen using the new design system
 *
 * This demonstrates the practical application of the design system
 * with improved consistency and maintainability
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router, useFocusEffect } from "expo-router";
import type { RelativePathString } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { HamburgerMenu } from "~/components/ui/HamburgerMenu";
import { Header } from "~/components/ui/Header";
import { HelpModal } from "~/components/ui/HelpModal";
import { YearOfBirthModal } from "~/components/ui/YearOfBirthModal";
import {
  clearUserIdentity,
  identifyUser,
  trackLogout,
  trackOnboardingCompleted,
} from "~/services/analytics";
// Import the new design system
import {
  buttons,
  buttonText,
  colors,
  commonStyles,
  containers,
  emptyStates,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { nextOnboardingRoute } from "~/utils/onboarding-gate";
import { devicesBeingDeleted } from "~/utils/deviceDeletionTracker";
import {
  hasSeenOnboarding,
  markOnboardingComplete,
  resetOnboarding,
} from "~/utils/userPreferences";

type DeviceData = RouterOutputs["device"]["getAll"][number];

function DeviceCard({ device }: { device: DeviceData }) {
  return (
    <View style={{ marginBottom: spacing[6] }}>
      <Link
        href={{
          pathname: "/devices/[deviceId]",
          params: { deviceId: device.id },
        }}
        asChild
      >
        <Pressable
          style={({ pressed }) => [
            {
              backgroundColor: "#FFFFFF",
              borderRadius: 20,
              padding: spacing[5],
              shadowColor: colors.primary[900],
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 16,
              borderWidth: 2,
              borderColor: colors.primary[200],
              overflow: "hidden",
            },
            pressed && {
              transform: [{ scale: 0.97 }],
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              borderColor: colors.primary[400],
            },
          ]}
        >
          {/* Gradient accent bar at top */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              backgroundColor: colors.primary[500],
            }}
          />
          {/* Device Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: spacing[2],
            }}
          >
            {/* Device Icon */}
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: colors.primary[50],
                alignItems: "center",
                justifyContent: "center",
                marginRight: spacing[4],
                position: "relative",
              }}
            >
              <Ionicons
                name="watch-outline"
                size={28}
                color={colors.primary[600]}
              />
            </View>

            {/* Device Info */}
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  typography.h4,
                  {
                    color: colors.text.primary,
                    fontWeight: "700",
                    marginBottom: spacing[1],
                  },
                ]}
                numberOfLines={1}
              >
                {device.title}
              </Text>
              {device.serialNumber && (
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.tertiary },
                  ]}
                >
                  SN: ...{device.serialNumber.slice(-5)}
                </Text>
              )}
            </View>

            {/* Chevron indicator */}
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.gray[100],
                alignItems: "center",
                justifyContent: "center",
              }}
            >
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
  const [showYearOfBirthModal, setShowYearOfBirthModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Fetch user profile to check year of birth
  const { data: userProfile } = useQuery({
    queryKey: ["userProfile"],
    queryFn: () => trpc.auth.getProfile.query(),
    enabled: !!session?.user,
  });

  // Identify user for analytics when session is available
  useEffect(() => {
    if (session?.user?.id) {
      void identifyUser(session.user.id);
    }
  }, [session?.user?.id]);

  // Check if user needs to provide year of birth and/or see onboarding
  useEffect(() => {
    const checkUserStatus = async () => {
      // Wait for user profile to load
      if (!userProfile) return;

      const hasSeenHelp = await hasSeenOnboarding();

      // First check: show year of birth modal if not in database
      if (!userProfile.yearOfBirth) {
        setShowYearOfBirthModal(true);
      }
      // Second check: show help modal if year of birth exists but haven't seen help
      else if (!hasSeenHelp) {
        setShowHelpModal(true);
      }
    };
    void checkUserStatus();
  }, [userProfile]);

  const {
    data: devices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["devices"],
    queryFn: () => trpc.device.getAll.query({}),
    enabled: !!session?.user,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });

  const sourcesQ = useQuery({
    queryKey: ["dexcom", "list"],
    queryFn: () => trpc.dexcom.list.query(),
    enabled: !!session?.user,
  });

  useEffect(() => {
    if (isLoading || sourcesQ.isLoading) return;
    const next = nextOnboardingRoute({
      hasBracelet: (devices ?? []).length > 0,
      sources: (sourcesQ.data ?? []).map((s) => ({
        id: s.id,
        displayName: s.displayName,
        active: s.dexcom?.active ?? true,
      })),
    });
    if (next) router.replace(next as RelativePathString);
  }, [isLoading, sourcesQ.isLoading, devices, sourcesQ.data]);

  const signOutMutation = useMutation({
    mutationFn: async () => {
      trackLogout();
      await clearUserIdentity();
      await resetOnboarding();
      await authClient.signOut();
    },
    onSuccess: () => {
      router.replace("/");
    },
    onError: (error) => {
      console.error("Failed to sign out:", error);
      Alert.alert("Error", "Failed to sign out. Please try again.");
    },
  });

  const updateYearOfBirthMutation = useMutation({
    mutationFn: async (yearOfBirth: number) => {
      return await trpc.auth.update.mutate({ yearOfBirth });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userProfile"] });

      setShowYearOfBirthModal(false);

      const hasSeenHelp = await hasSeenOnboarding();
      if (!hasSeenHelp) {
        setShowHelpModal(true);
      }
    },
    onError: (error) => {
      console.error("Failed to update year of birth:", error);
      Alert.alert("Error", "Failed to save year of birth. Please try again.");
    },
  });

  const handleYearOfBirthComplete = (yearOfBirth: number) => {
    updateYearOfBirthMutation.mutate(yearOfBirth);
  };

  useFocusEffect(
    useCallback(() => {
      if (session?.user) {
        if (devicesBeingDeleted.size > 0) {
          console.log(
            "Skipping dashboard refetch - device deletion in progress",
          );
          return;
        }

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
                label: "Dexcom Sources",
                onPress: () => router.push("/cgm"),
                icon: "pulse",
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
              Add your first Gently to get started.
            </Text>
            <Pressable
              style={[
                buttons.base,
                buttons.large,
                buttons.success,
                { flexDirection: "row", gap: spacing[2], alignItems: "center" },
              ]}
              onPress={handleAddDevice}
            >
              <Ionicons name="add-circle" size={20} color="white" />
              <Text style={buttonText.success}>Add Your First Gently</Text>
            </Pressable>
          </View>
        ) : (
          /* Device List */
          <ScrollView
            style={{ paddingVertical: spacing[4] }}
            showsVerticalScrollIndicator={false}
          >
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}

            {/* Add device button */}
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
          </ScrollView>
        )}
      </View>

      {/* Year of Birth Modal */}
      <YearOfBirthModal
        visible={showYearOfBirthModal}
        onComplete={handleYearOfBirthComplete}
        isLoading={updateYearOfBirthMutation.isPending}
      />

      {/* Help Modal */}
      <HelpModal
        visible={showHelpModal}
        onClose={async () => {
          setShowHelpModal(false);
          await markOnboardingComplete();
          trackOnboardingCompleted();
        }}
      />
    </SafeAreaView>
  );
}
