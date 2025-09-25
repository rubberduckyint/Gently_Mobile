import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AlarmCard } from "~/components/device";
import { HamburgerMenu } from "~/components/ui/HamburgerMenu";
import { Header } from "~/components/ui/Header";
import {
  buttons,
  cards,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";

export default function DeviceDetailPage() {
  const { deviceId } = useGlobalSearchParams<{ deviceId: string }>();
  const queryClient = useQueryClient();

  // Store the initial device ID to prevent it from changing during navigation
  const [initialDeviceId] = React.useState(deviceId);

  const {
    data: device,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["device", "getById", { id: initialDeviceId }],
    queryFn: async () => {
      return await trpc.device.getById.query({ id: initialDeviceId });
    },
    enabled: !!initialDeviceId,
    retry: (failureCount, error) => {
      // Don't retry if the device is not found (likely deleted)
      if (
        error instanceof Error &&
        (error.message.includes("Device not found") ||
          error.message.includes("you don't have permission"))
      ) {
        return false;
      }
      // Default retry behavior for other errors
      return failureCount < 3;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!initialDeviceId) throw new Error("Device ID is required");
      return await trpc.device.delete.mutate({ id: initialDeviceId });
    },
    onSuccess: () => {
      // Remove the specific device query from cache to prevent refetch of deleted device
      queryClient.removeQueries({
        queryKey: ["device", "getById", { id: deviceId }],
      });
      // Invalidate the devices list to refresh the dashboard
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      router.back();
    },
  });

  // Handle device not found errors by navigating back automatically
  useEffect(() => {
    if (
      error?.message &&
      (error.message.includes("Device not found") ||
        error.message.includes("you don't have permission"))
    ) {
      console.log(
        "📱 Device not found or access denied, navigating back to dashboard",
      );
      router.back();
    }
  }, [error]);

  const handleDeleteDevice = () => {
    Alert.alert(
      "Delete Device",
      "Are you sure you want to delete this device? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View style={containers.contentCentered}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text
            style={[
              typography.body,
              { marginTop: spacing[3], color: colors.gray[500] },
            ]}
          >
            Loading device...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View
          style={[
            containers.contentCentered,
            { alignItems: "center", paddingHorizontal: spacing[8] },
          ]}
        >
          <Text
            style={[
              typography.h5,
              {
                color: colors.error[600],
                marginBottom: spacing[2],
                textAlign: "center",
              },
            ]}
          >
            Failed to load device
          </Text>
          <Text
            style={[
              typography.body,
              {
                color: colors.gray[500],
                textAlign: "center",
                marginBottom: spacing[6],
              },
            ]}
          >
            {error.message || "Please try again later"}
          </Text>
          <Pressable
            style={[buttons.base, buttons.primary]}
            onPress={() => router.back()}
          >
            <Text
              style={[typography.labelLarge, { color: colors.text.inverse }]}
            >
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View
          style={[
            containers.contentCentered,
            { alignItems: "center", paddingHorizontal: spacing[8] },
          ]}
        >
          <Text
            style={[
              typography.h5,
              {
                color: colors.error[600],
                marginBottom: spacing[6],
                textAlign: "center",
              },
            ]}
          >
            Device not found
          </Text>
          <Pressable
            style={[buttons.base, buttons.primary]}
            onPress={() => router.back()}
          >
            <Text
              style={[typography.labelLarge, { color: colors.text.inverse }]}
            >
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const getBatteryColor = (level: number) => {
    if (level > 50) return "#10b981";
    if (level > 20) return "#f59e0b";
    return "#ef4444";
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

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header
        title={device.title ?? "Device"}
        showBackButton={true}
        rightComponent={
          <HamburgerMenu
            options={[
              {
                label: "Edit Device",
                onPress: () => router.push(`/devices/${deviceId}/edit`),
                icon: "pencil",
              },
              {
                label: "BLE Debug",
                onPress: () => {
                  router.push(`/devices/${deviceId}/ble-test`);
                },
                icon: "build",
              },
              {
                label: "Delete Device",
                onPress: handleDeleteDevice,
                icon: "trash",
                destructive: true,
              },
            ]}
          />
        }
      />
      <ScrollView
        style={containers.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Device Header */}
        <View
          style={[
            cards.base,
            {
              flexDirection: "row",
              alignItems: "center",
              marginTop: spacing[4],
            },
          ]}
        >
          <View
            style={[
              {
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: colors.gray[200],
                justifyContent: "center",
                alignItems: "center",
                marginRight: spacing[4],
              },
            ]}
          >
            {device.title ? (
              <Text style={[typography.h6, { color: colors.gray[700] }]}>
                {device.title.slice(0, 2).toUpperCase()}
              </Text>
            ) : (
              <Ionicons name="watch" size={28} color={colors.gray[700]} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.h4, { marginBottom: spacing[1] }]}>
              {device.title}
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, marginBottom: spacing[3] },
              ]}
            >
              {device.description}
            </Text>

            {/* Device Stats */}
            <View
              style={[
                { flexDirection: "row", flexWrap: "wrap", gap: spacing[4] },
              ]}
            >
              <View style={[{ flexDirection: "row", alignItems: "center" }]}>
                <Ionicons
                  name="sync"
                  size={14}
                  color={colors.gray[500]}
                  style={{ marginRight: spacing[1] }}
                />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.gray[500], fontWeight: "500" },
                  ]}
                >
                  {getSyncStatusText(device.syncStatus ?? "NOT_SYNCED")}
                </Text>
              </View>
              <View style={[{ flexDirection: "row", alignItems: "center" }]}>
                <Ionicons
                  name="battery-half"
                  size={14}
                  color={getBatteryColor(device.batteryLevel ?? 0)}
                  style={{ marginRight: spacing[1] }}
                />
                <Text
                  style={[
                    typography.caption,
                    {
                      color: getBatteryColor(device.batteryLevel ?? 0),
                      fontWeight: "500",
                    },
                  ]}
                >
                  {device.batteryLevel ?? 0}%
                </Text>
              </View>
              {device.serialNumber && (
                <View style={[{ flexDirection: "row", alignItems: "center" }]}>
                  <Ionicons
                    name="barcode-outline"
                    size={14}
                    color={colors.gray[500]}
                    style={{ marginRight: spacing[1] }}
                  />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.gray[500], fontWeight: "500" },
                    ]}
                  >
                    {device.serialNumber}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Alarms Section */}
        <View style={containers.section}>
          <View
            style={[
              {
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: spacing[4],
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="alarm"
                size={24}
                color={colors.text.primary}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={[typography.h5, { color: colors.text.primary }]}>
                Alarms ({device.alarms.length})
              </Text>
            </View>
            <Pressable
              style={[
                buttons.base,
                buttons.success,
                { paddingVertical: spacing[2], paddingHorizontal: spacing[4] },
              ]}
              onPress={() => router.push(`/devices/${deviceId}/alarms/add`)}
            >
              <Ionicons
                name="add"
                size={16}
                color={colors.text.inverse}
                style={{ marginRight: spacing[1] }}
              />
              <Text style={[typography.label, { color: colors.text.inverse }]}>
                Add Alarm
              </Text>
            </Pressable>
          </View>

          {device.alarms.length === 0 ? (
            <View
              style={[
                cards.base,
                { alignItems: "center", paddingVertical: spacing[8] },
              ]}
            >
              <Ionicons
                name="alarm-outline"
                size={48}
                color={colors.gray[400]}
                style={{ marginBottom: spacing[3] }}
              />
              <Text
                style={[
                  typography.h6,
                  { color: colors.text.primary, marginBottom: spacing[1] },
                ]}
              >
                No alarms configured
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.text.secondary, textAlign: "center" },
                ]}
              >
                Add your first alarm to get started
              </Text>
            </View>
          ) : (
            <View style={[{ gap: spacing[3] }]}>
              {device.alarms.map((alarm, index) => {
                // Debug logging to see raw alarm data
                console.log(`📊 Alarm ${index} raw data:`, {
                  id: alarm.id,
                  startDate: alarm.startDate,
                  startDateType: typeof alarm.startDate,
                  endDate: alarm.endDate,
                  endDateType: typeof alarm.endDate,
                  cronExpression: alarm.cronExpression,
                });

                return (
                  <AlarmCard
                    key={alarm.id}
                    alarm={alarm}
                    onPress={() => {
                      console.log(
                        "🚨 Navigating to alarm edit:",
                        alarm.id,
                        "from device:",
                        deviceId,
                      );
                      router.push(
                        `/devices/${deviceId}/alarms/edit/${alarm.id}`,
                      );
                    }}
                  />
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
