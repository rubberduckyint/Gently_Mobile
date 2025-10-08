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

type DeviceWithAlarmsCount = RouterOutputs["device"]["getAll"][number];

function DeviceCard({
  device,
  onDeleteDevice,
}: {
  device: DeviceWithAlarmsCount;
  onDeleteDevice: (deviceId: string) => void;
}) {
  const [showDeleteButton, setShowDeleteButton] = React.useState(false);

  const handleLongPress = () => {
    setShowDeleteButton(!showDeleteButton);
  };

  const handleDeletePress = () => {
    Alert.alert(
      "Delete Device",
      `Are you sure you want to delete "${device.title}"? This action cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => setShowDeleteButton(false),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            onDeleteDevice(device.id);
            setShowDeleteButton(false);
          },
        },
      ],
    );
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
            showDeleteButton && cards.pressed,
            pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
          ]}
          onLongPress={handleLongPress}
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
              <Text
                style={[typography.bodySmall, { color: colors.text.secondary }]}
              >
                {device.description}
              </Text>
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

      {/* Delete Button */}
      {showDeleteButton && (
        <Pressable
          style={[
            buttons.base,
            buttons.small,
            buttons.error,
            { marginTop: spacing[2] },
          ]}
          onPress={handleDeletePress}
        >
          <Text style={[buttonText.error, buttonText.small]}>
            Delete Device
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default function DashboardPage() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();

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

  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return await trpc.device.delete.mutate({ id: deviceId });
    },
    onSuccess: (_, deviceId) => {
      // Remove all queries related to this specific device to prevent any stale data errors
      queryClient.removeQueries({
        queryKey: ["device", "getById", { id: deviceId }],
      });
      // Also remove any alarm-related queries for this device
      queryClient.removeQueries({
        queryKey: ["alarm"],
        predicate: (query) => {
          // Remove any alarm queries that reference this device
          const queryKey = query.queryKey as unknown[];
          return queryKey.some(
            (key) =>
              typeof key === "object" &&
              key !== null &&
              "deviceId" in key &&
              key.deviceId === deviceId,
          );
        },
      });

      // Update the devices list cache directly to remove the deleted device
      queryClient.setQueryData(
        ["devices"],
        (oldData: DeviceWithAlarmsCount[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.filter((device) => device.id !== deviceId);
        },
      );

      // Also update the trpc query cache with the correct key
      const queryKey = [["device", "getAll"], { input: {}, type: "query" }];
      queryClient.setQueryData(
        queryKey,
        (oldData: DeviceWithAlarmsCount[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.filter((device) => device.id !== deviceId);
        },
      );
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to delete device: ${error.message}`);
    },
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    onSuccess: () => {
      router.replace("/");
    },
  });

  useFocusEffect(
    React.useCallback(() => {
      if (session?.user) {
        // Invalidate both the legacy and TRPC query keys to ensure fresh data
        void queryClient.invalidateQueries({ queryKey: ["devices"] });
        void queryClient.invalidateQueries({
          queryKey: [["device", "getAll"]],
        });
        // Force refetch
        void refetch();
      }
    }, [session, refetch, queryClient]),
  );

  const handleAddDevice = () => {
    router.push("/add-device");
  };

  const handleDeleteDevice = (deviceId: string) => {
    deleteDeviceMutation.mutate(deviceId);
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
            Loading your devices...
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
        title="Your Devices"
        showBackButton={false}
        rightComponent={
          <HamburgerMenu
            options={[
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
              No devices yet
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
              Add your first device to start managing alarms and notifications.
            </Text>
            <Pressable
              style={[buttons.base, buttons.large, buttons.success]}
              onPress={handleAddDevice}
            >
              <Text style={buttonText.success}>Add Your First Device</Text>
            </Pressable>
          </View>
        ) : (
          /* Device List */
          <View style={{ paddingVertical: spacing[4] }}>
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <DeviceCard device={item} onDeleteDevice={handleDeleteDevice} />
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
                  <Text style={buttonText.outline}>+ Add Another Device</Text>
                </Pressable>
              )}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
