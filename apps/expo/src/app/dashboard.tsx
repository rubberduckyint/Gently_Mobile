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

  const getBatteryColor = (level: number) => {
    if (level > 50) return colors.battery.high;
    if (level > 20) return colors.battery.medium;
    return colors.battery.low;
  };

  const getSyncStatusText = (status: string) => {
    switch (status) {
      case "SYNCED":
        return "✓ Synced";
      case "SYNCING":
        return "⟳ Syncing";
      case "ERROR":
        return "⚠ Error";
      default:
        return "○ Not Synced";
    }
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case "SYNCED":
        return colors.status.synced;
      case "SYNCING":
        return colors.status.syncing;
      case "ERROR":
        return colors.status.error;
      default:
        return colors.status.pending;
    }
  };

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

          {/* Device Stats */}
          <View
            style={[
              flex.row,
              flex.justifyBetween,
              {
                paddingTop: spacing[3],
                borderTopWidth: 1,
                borderTopColor: colors.border.light,
              },
            ]}
          >
            <View style={flex.itemsCenter}>
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Alarms
              </Text>
              <Text style={[typography.labelLarge, { marginTop: spacing[1] }]}>
                {device._count.alarms}
              </Text>
            </View>

            <View style={flex.itemsCenter}>
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Battery
              </Text>
              <Text
                style={[
                  typography.labelLarge,
                  {
                    color: getBatteryColor(device.batteryLevel),
                    marginTop: spacing[1],
                  },
                ]}
              >
                {device.batteryLevel}%
              </Text>
            </View>

            <View style={flex.itemsCenter}>
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Status
              </Text>
              <Text
                style={[
                  typography.caption,
                  {
                    color: getSyncStatusColor(device.syncStatus),
                    fontWeight: "600",
                    marginTop: spacing[1],
                  },
                ]}
              >
                {getSyncStatusText(device.syncStatus)}
              </Text>
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
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return await trpc.device.delete.mutate({ id: deviceId });
    },
    onSuccess: (_, deviceId) => {
      // Remove the specific device query from cache to prevent any lingering queries
      queryClient.removeQueries({
        queryKey: ["device", "getById", { id: deviceId }],
      });
      // Invalidate the devices list to refresh the dashboard
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
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
        void refetch();
      }
    }, [session, refetch]),
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

      {/* Device count subtitle */}
      <View
        style={{ paddingHorizontal: spacing[6], paddingVertical: spacing[2] }}
      >
        <Text style={[typography.bodySmall, { color: colors.text.secondary }]}>
          {devices?.length ?? 0} device{devices?.length !== 1 ? "s" : ""}{" "}
          connected
        </Text>
      </View>

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
