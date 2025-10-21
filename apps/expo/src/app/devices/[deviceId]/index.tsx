import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AlarmCard } from "~/components/device";
import { QuickReminderModal } from "~/components/QuickReminderModal";
import { RetryConnectionModal } from "~/components/RetryConnectionModal";
import { HamburgerMenu } from "~/components/ui/HamburgerMenu";
import { Header } from "~/components/ui/Header";
import { HelpModal } from "~/components/ui/HelpModal";
import { useBLE } from "~/contexts/BLEContext";
import { useAlarmSync } from "~/hooks/useAlarmSync";
import {
  buttons,
  cards,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";
import { calculateNextAlarmOccurrence } from "~/utils/alarmUtils";
import { trpc } from "~/utils/api";
import { devicesBeingDeleted } from "~/utils/deviceDeletionTracker";
import { markOnboardingComplete } from "~/utils/userPreferences";

export default function DeviceDetailPage() {
  const { deviceId } = useGlobalSearchParams<{ deviceId: string }>();
  const queryClient = useQueryClient();
  const [autoConnectAttempted, setAutoConnectAttempted] = React.useState(false);
  const isMountedRef = React.useRef(true);
  const [connectionProgress, setConnectionProgress] = React.useState<{
    message: string;
    progress: number;
  } | null>(null);
  const [showRetryModal, setShowRetryModal] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState<string | null>(
    null,
  );
  const [showQuickReminderModal, setShowQuickReminderModal] =
    React.useState(false);
  const [showHelpModal, setShowHelpModal] = React.useState(false);
  const [showExpiredAlarms, setShowExpiredAlarms] = React.useState(false);

  // Store the initial device ID to prevent it from changing during navigation
  // Only set it if deviceId is actually defined
  const [initialDeviceId] = React.useState(() => {
    console.log("🔍 [Device Detail] Initializing with deviceId:", deviceId);
    return deviceId;
  });

  // Set mounted flag on mount
  React.useEffect(() => {
    isMountedRef.current = true;
    console.log("🔍 [Device Detail] Component mounted");

    // Cleanup function - only runs when component actually unmounts
    return () => {
      isMountedRef.current = false;
      console.log(
        "🧹 [Device Detail] Component unmounting for ID:",
        initialDeviceId,
      );

      // Note: We don't add the device to devicesBeingDeleted here
      // because unmounting happens during normal navigation too.
      // The device is only added to the set in the delete page.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount

  // Debug logging to track device ID changes
  React.useEffect(() => {
    console.log("🔍 [Device Detail] Route deviceId:", deviceId);
    console.log("🔍 [Device Detail] Stored initialDeviceId:", initialDeviceId);

    // If deviceId is not set, log it as a warning
    if (!deviceId) {
      console.warn(
        "⚠️ [Device Detail] Route deviceId is missing - page may be unmounting or route params lost",
      );
    }
  }, [deviceId, initialDeviceId]);

  // Use BLE context to show connection status
  const {
    connectionState,
    connectToDevice,
    notifications,
    connectedDevice,
    encryptionKey,
  } = useBLE();

  // Animation for connecting status
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // Animate the pulse when connecting or showing progress
  React.useEffect(() => {
    // Animate if connecting, scanning, or if there's an active connection progress message
    const shouldAnimate =
      connectionState === "connecting" ||
      connectionState === "scanning" ||
      connectionProgress !== null;

    if (shouldAnimate) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.5,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [connectionState, connectionProgress, pulseAnim]);

  // Track the latest battery status from notifications
  const [batteryStatus, setBatteryStatus] = React.useState<{
    level: number; // 0=CRITICAL, 1=LOW, 2=MEDIUM, 3=GOOD, 4=FULL
    voltage: number;
    isCharging: boolean;
    levelText: string;
  } | null>(null);

  // Update battery status when notifications arrive
  React.useEffect(() => {
    const latestBatteryNotification = notifications
      .filter((n) => n.type === "battery")
      .slice(-1)[0];

    if (latestBatteryNotification?.description) {
      const regex = /Battery: (\w+) \((\d+)mV\)(?: - (Charging))?/;
      const match = regex.exec(latestBatteryNotification.description);

      if (match) {
        const levelText = match[1] ?? "UNKNOWN";
        const voltage = parseInt(match[2] ?? "0", 10);
        const isCharging = match[3] === "Charging";

        const levelMap: Record<string, number> = {
          CRITICAL: 0,
          LOW: 1,
          MEDIUM: 2,
          GOOD: 3,
          FULL: 4,
        };

        setBatteryStatus({
          level: levelMap[levelText] ?? 0,
          voltage,
          isCharging,
          levelText,
        });
      }
    }
  }, [notifications]);

  // Helper to get battery display info
  const getBatteryInfo = (status: typeof batteryStatus) => {
    if (!status) {
      return {
        color: colors.gray[400],
        text: "Unknown",
        icon: "battery-dead-outline" as const,
      };
    }

    const configs = [
      {
        color: colors.error[600],
        text: "Critical",
        icon: "battery-dead" as const,
      },
      { color: colors.error[500], text: "Low", icon: "battery-half" as const },
      {
        color: colors.warning[600],
        text: "Medium",
        icon: "battery-half" as const,
      },
      {
        color: colors.success[600],
        text: "Good",
        icon: "battery-full" as const,
      },
      {
        color: colors.success[600],
        text: "Full",
        icon: "battery-full" as const,
      },
    ];

    const config = configs[status.level] ?? configs[0];

    return {
      ...config,
      icon: status.isCharging
        ? ("battery-charging" as const)
        : (config?.icon ?? ("battery-dead-outline" as const)),
    };
  };

  const {
    data: device,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["device", "getById", { id: initialDeviceId }],
    queryFn: async () => {
      // Check if component is still mounted before fetching
      if (!isMountedRef.current) {
        throw new Error("Component unmounted");
      }
      console.log(`🔍 [Device Detail] Fetching device: ${initialDeviceId}`);
      return await trpc.device.getById.query({ id: initialDeviceId });
    },
    enabled: !!initialDeviceId && !!deviceId, // Only run when we have both IDs and route is valid
    refetchOnMount: false, // Don't refetch when component mounts if we have data
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    staleTime: 30000, // Consider data fresh for 30 seconds
    retry: (failureCount, error) => {
      // Don't retry if the device is not found (likely deleted)
      if (
        error instanceof Error &&
        (error.message.includes("Device not found") ||
          error.message.includes("you don't have permission") ||
          error.message.includes("Component unmounted"))
      ) {
        return false;
      }
      // Default retry behavior for other errors
      return failureCount < 3;
    },
  });

  // Initialize alarm sync hook
  const alarmSync = useAlarmSync({
    deviceSerialNumber: device?.serialNumber ?? undefined,
    enabled: !!deviceId && !!initialDeviceId && !!device?.serialNumber, // Only enable when we have valid device data
    onSyncComplete: () => {
      void queryClient.invalidateQueries({
        queryKey: ["device", "getById", { id: initialDeviceId }],
      });
    },
  });

  // Track if we've synced alarms for this connection
  const initialSyncCompletedRef = React.useRef(false);

  // Track alarm count to detect when alarms are added/updated/deleted
  const previousAlarmCountRef = React.useRef<number | null>(null);

  // Helper to check if an alarm is expired/completed
  const isAlarmExpired = React.useCallback(
    (alarm: {
      isActive: boolean;
      startDate: Date;
      endDate: Date | null;
      repeat: boolean;
      cronExpression: string;
    }) => {
      const scheduleInfo = calculateNextAlarmOccurrence({
        isActive: alarm.isActive,
        startDate: alarm.startDate,
        endDate: alarm.endDate,
        repeat: alarm.repeat,
        cronExpression: alarm.cronExpression,
      });
      return (
        scheduleInfo.status === "completed" || scheduleInfo.status === "overdue"
      );
    },
    [],
  );

  // Watch for alarm changes and trigger re-sync if connected
  React.useEffect(() => {
    const currentAlarmCount = device?.alarms.length ?? 0;

    // If this is the first load, just store the count
    if (previousAlarmCountRef.current === null) {
      previousAlarmCountRef.current = currentAlarmCount;
      return;
    }

    // If alarm count changed and we're connected, trigger re-sync
    if (
      currentAlarmCount !== previousAlarmCountRef.current &&
      connectionState === "connected" &&
      !alarmSync.isSyncing &&
      initialSyncCompletedRef.current
    ) {
      console.log(
        `📊 Alarm count changed from ${previousAlarmCountRef.current} to ${currentAlarmCount}, triggering re-sync`,
      );
      initialSyncCompletedRef.current = false;
    }

    previousAlarmCountRef.current = currentAlarmCount;
  }, [device?.alarms.length, connectionState, alarmSync.isSyncing]);

  // Sync alarms when connected: clear all events and re-add only active alarms
  // This runs ONCE per connection after the device data is loaded
  React.useEffect(() => {
    const performInitialSync = async () => {
      if (
        !device?.alarms ||
        connectionState !== "connected" ||
        alarmSync.isSyncing ||
        !connectedDevice ||
        !encryptionKey ||
        initialSyncCompletedRef.current // Don't sync again if already completed for this connection
      ) {
        return;
      }

      console.log("🔄 Starting initial sync on connection");

      // Filter out expired/completed alarms before syncing
      const activeAlarms = device.alarms.filter(
        (alarm) => !isAlarmExpired(alarm),
      );

      console.log(
        `📊 Alarm sync filter - Total: ${device.alarms.length}, Active: ${activeAlarms.length}, Filtered out: ${device.alarms.length - activeAlarms.length}`,
      );

      try {
        // Perform full sync: clear all events and re-add only active alarms
        await alarmSync.performSync(activeAlarms);

        console.log("✅ Initial sync completed successfully");

        // Clear deviceIndex for expired alarms that weren't synced
        const expiredAlarmIds = device.alarms
          .filter((alarm) => {
            const scheduleInfo = calculateNextAlarmOccurrence({
              isActive: alarm.isActive,
              startDate: alarm.startDate,
              endDate: alarm.endDate,
              repeat: alarm.repeat,
              cronExpression: alarm.cronExpression,
            });
            // Alarm is expired if it has no future occurrences
            return (
              scheduleInfo.status === "completed" ||
              scheduleInfo.status === "overdue"
            );
          })
          .filter((alarm) => alarm.deviceIndex !== null) // Only update alarms that have a deviceIndex
          .map((alarm) => alarm.id);

        if (expiredAlarmIds.length > 0) {
          console.log(
            `🧹 Clearing deviceIndex for ${expiredAlarmIds.length} expired alarms that weren't synced`,
          );

          // Update each expired alarm to clear its deviceIndex
          for (const alarmId of expiredAlarmIds) {
            try {
              await trpc.alarm.update.mutate({
                id: alarmId,
                deviceIndex: null,
              });
            } catch (error) {
              console.error(
                `❌ Failed to clear deviceIndex for alarm ${alarmId}:`,
                error,
              );
            }
          }

          // Refresh device data to reflect the cleared deviceIndex values
          await queryClient.invalidateQueries({
            queryKey: ["device", "getById", { id: initialDeviceId }],
          });
        }

        initialSyncCompletedRef.current = true; // Mark sync as completed
      } catch (error) {
        console.error("❌ Initial sync failed:", error);
      }
    };

    void performInitialSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.alarms, connectionState]);

  // Reset sync flag when disconnected
  React.useEffect(() => {
    if (connectionState === "disconnected") {
      initialSyncCompletedRef.current = false;
    }
  }, [connectionState]);

  // Handle device not found errors by navigating back automatically
  useEffect(() => {
    // Only navigate away if we have a valid deviceId and it's an error for the current route
    if (
      deviceId && // Make sure we're on a valid route
      initialDeviceId && // Make sure we have an initial ID
      deviceId === initialDeviceId && // Make sure IDs match (not a stale query)
      error?.message &&
      (error.message.includes("Device not found") ||
        error.message.includes("you don't have permission"))
    ) {
      console.log(
        `📱 Device not found or access denied for ID: ${initialDeviceId}`,
      );
      console.log("   └─ Error:", error.message);
      console.log("   └─ Current route deviceId:", deviceId);
      console.log("   └─ Navigating back to dashboard");

      // Add a small delay to prevent navigation loops and allow debugging
      const timer = setTimeout(() => {
        router.push("/dashboard");
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [error, initialDeviceId, deviceId]);

  // Auto-connect to device when page loads
  useEffect(() => {
    const autoConnect = async () => {
      // Don't auto-connect if we don't have a valid device ID or device data
      // Check autoConnectAttempted first to prevent re-runs
      if (autoConnectAttempted) {
        return;
      }

      if (
        !isMountedRef.current || // Page is unmounting
        !deviceId || // No route parameter
        !initialDeviceId || // No stored ID
        devicesBeingDeleted.has(deviceId) || // Device is being deleted
        !device?.serialNumber || // No device data or serial number
        error || // Query has an error (device might be deleted)
        connectionState === "connected" ||
        connectionState === "connecting"
      ) {
        if (devicesBeingDeleted.has(deviceId)) {
          console.log(
            "🚫 Skipping auto-connect - device is being deleted:",
            deviceId,
          );
        }
        return;
      }

      console.log("🔄 Auto-connecting to device:", device.serialNumber);

      try {
        // Connect with proper configuration and progress tracking
        await connectToDevice(
          device.serialNumber,
          (progress) => {
            // Update connection progress for UI display
            setConnectionProgress({
              message: progress.message,
              progress: progress.progress,
            });
            console.log(
              `[Auto-connect Progress] ${progress.message} (${progress.progress}%)`,
            );
          },
          {
            maxRetries: 3,
            connectionTimeoutMs: 60000, // 60 seconds per attempt
            stabilizationDelayMs: 900,
            mtuSize: 512,
            scanTimeoutSeconds: 30, // 30 seconds scan timeout
          },
        );
        console.log("✅ Auto-connect successful!");
        setConnectionProgress(null); // Clear progress on success
        setConnectionError(null); // Clear any previous errors
        setAutoConnectAttempted(true); // Mark attempt as complete
      } catch (error) {
        console.warn("⚠️ Auto-connect failed:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setConnectionError(errorMessage);
        setConnectionProgress(null); // Clear progress on error
        setShowRetryModal(true); // Show retry modal
        setAutoConnectAttempted(true); // Mark attempt as complete even on failure
      }
    };

    void autoConnect();
    // Only depend on the serial number changing, not the entire device object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    device?.serialNumber,
    deviceId,
    initialDeviceId,
    autoConnectAttempted,
    error,
  ]);

  // Handle manual reconnect
  const handleReconnect = async () => {
    if (!device?.serialNumber) {
      Alert.alert("Error", "Device serial number is required for connection");
      return;
    }

    try {
      // Reset progress and attempt reconnect with full pairing process
      setConnectionProgress(null);
      setConnectionError(null);
      setShowRetryModal(false); // Close modal when retrying

      await connectToDevice(
        device.serialNumber,
        (progress) => {
          // Update connection progress for UI display
          setConnectionProgress({
            message: progress.message,
            progress: progress.progress,
          });
          console.log(
            `[Manual Reconnect Progress] ${progress.message} (${progress.progress}%)`,
          );
        },
        {
          maxRetries: 3,
          connectionTimeoutMs: 60000, // 60 seconds per attempt
          stabilizationDelayMs: 900,
          mtuSize: 512,
          scanTimeoutSeconds: 30, // 30 seconds scan timeout
        },
      );
      console.log("✅ Manual reconnect successful!");
      setConnectionProgress(null); // Clear progress on success
      setConnectionError(null); // Clear any previous errors
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setConnectionError(errorMessage);
      setConnectionProgress(null); // Clear progress on error
      setShowRetryModal(true); // Show retry modal
    }
  };

  const handleDeleteDevice = () => {
    router.push(`/devices/${deviceId}/delete`);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={containers.safeArea}>
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
            Loading your Gently...
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

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header
        title=""
        showBackButton={true}
        onBackPress={() => router.push("/")}
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
                onPress: () => router.push("/settings"),
                icon: "settings",
              },
              {
                label: "Edit Device",
                onPress: () => router.push(`/devices/${deviceId}/edit`),
                icon: "pencil",
              },
              {
                label: "BLE Test",
                onPress: () => router.push(`/devices/${deviceId}/ble-test`),
                icon: "bluetooth",
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
        <View style={[cards.base]}>
          <View>
            <Text style={[typography.h4, { marginBottom: spacing[1] }]}>
              {device.title}
            </Text>
            {device.description && (
              <Text
                style={[
                  typography.body,
                  { color: colors.text.secondary, marginBottom: spacing[3] },
                ]}
              >
                {device.description}
              </Text>
            )}

            {/* Device Stats */}
            <View
              style={{
                gap: spacing[2],
                marginTop: device.description ? 0 : spacing[2],
              }}
            >
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
              {/* Connection Status and Battery on same line */}
              <View
                style={[
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing[4],
                  },
                ]}
              >
                {/* Connection Status */}
                <View style={[{ flexDirection: "row", alignItems: "center" }]}>
                  <Animated.View
                    style={{
                      transform: [{ scale: pulseAnim }],
                      marginRight: spacing[1],
                    }}
                  >
                    <Ionicons
                      name="bluetooth"
                      size={14}
                      color={
                        connectionState === "connected"
                          ? colors.success[600]
                          : connectionState === "connecting" ||
                              connectionState === "scanning"
                            ? colors.warning[600]
                            : connectionState === "error"
                              ? colors.error[600]
                              : colors.gray[400]
                      }
                    />
                  </Animated.View>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color:
                          connectionState === "connected"
                            ? colors.success[600]
                            : connectionState === "connecting" ||
                                connectionState === "scanning"
                              ? colors.warning[600]
                              : connectionState === "error"
                                ? colors.error[600]
                                : colors.gray[500],
                        fontWeight: "500",
                      },
                    ]}
                  >
                    {connectionProgress?.message ??
                      connectionState.charAt(0).toUpperCase() +
                        connectionState.slice(1)}
                  </Text>
                </View>

                {/* Reconnect Button - inline with status, only show when disconnected/error and not attempting connection */}
                {autoConnectAttempted &&
                  connectionState !== "connecting" &&
                  connectionState !== "scanning" &&
                  connectionState !== "connected" &&
                  device.serialNumber && (
                    <Pressable
                      style={[
                        buttons.base,
                        buttons.primary,
                        {
                          paddingVertical: spacing[1],
                          paddingHorizontal: spacing[3],
                        },
                      ]}
                      onPress={handleReconnect}
                    >
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.text.inverse },
                        ]}
                      >
                        {connectionState === "error" ? "Retry" : "Reconnect"}
                      </Text>
                    </Pressable>
                  )}

                {/* Battery Status */}
                {batteryStatus && (
                  <View
                    style={[{ flexDirection: "row", alignItems: "center" }]}
                  >
                    <Ionicons
                      name={getBatteryInfo(batteryStatus).icon}
                      size={14}
                      color={getBatteryInfo(batteryStatus).color}
                      style={{ marginRight: spacing[1] }}
                    />
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: getBatteryInfo(batteryStatus).color,
                          fontWeight: "500",
                        },
                      ]}
                    >
                      {getBatteryInfo(batteryStatus).text}
                      {batteryStatus.isCharging && " ⚡"}
                    </Text>
                  </View>
                )}
              </View>
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
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginRight: spacing[2],
              }}
            >
              <Ionicons
                name="alarm"
                size={24}
                color={colors.text.primary}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={[typography.h5, { color: colors.text.primary }]}>
                Alarms (
                {
                  device.alarms.filter((alarm) => {
                    const scheduleInfo = calculateNextAlarmOccurrence({
                      isActive: alarm.isActive,
                      startDate: new Date(alarm.startDate),
                      endDate: alarm.endDate ? new Date(alarm.endDate) : null,
                      repeat: alarm.repeat,
                      cronExpression: alarm.cronExpression,
                    });
                    return scheduleInfo.nextOccurrence !== null;
                  }).length
                }
                )
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: spacing[2] }}>
              <Pressable
                style={[
                  buttons.base,
                  buttons.primary,
                  {
                    paddingVertical: spacing[2],
                    paddingHorizontal: spacing[3],
                  },
                ]}
                onPress={() => setShowQuickReminderModal(true)}
              >
                <Ionicons
                  name="time"
                  size={16}
                  color={colors.text.inverse}
                  style={{ marginRight: spacing[1] }}
                />
                <Text
                  style={[typography.label, { color: colors.text.inverse }]}
                >
                  Remind
                </Text>
              </Pressable>
              <Pressable
                style={[
                  buttons.base,
                  buttons.success,
                  {
                    paddingVertical: spacing[2],
                    paddingHorizontal: spacing[3],
                  },
                ]}
                onPress={() => router.push(`/devices/${deviceId}/alarms/add`)}
              >
                <Ionicons
                  name="add"
                  size={16}
                  color={colors.text.inverse}
                  style={{ marginRight: spacing[1] }}
                />
                <Text
                  style={[typography.label, { color: colors.text.inverse }]}
                >
                  Alarm
                </Text>
              </Pressable>
            </View>
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
              {(() => {
                // Separate alarms into active and expired
                const sortedAlarms = device.alarms.slice().map((alarm) => {
                  const scheduleInfo = calculateNextAlarmOccurrence({
                    isActive: alarm.isActive,
                    startDate: new Date(alarm.startDate),
                    endDate: alarm.endDate ? new Date(alarm.endDate) : null,
                    repeat: alarm.repeat,
                    cronExpression: alarm.cronExpression,
                  });
                  return { alarm, scheduleInfo };
                });

                const activeAlarms = sortedAlarms
                  .filter(({ scheduleInfo }) => scheduleInfo.nextOccurrence)
                  .sort((a, b) => {
                    const timeA = a.scheduleInfo.nextOccurrence?.getTime() ?? 0;
                    const timeB = b.scheduleInfo.nextOccurrence?.getTime() ?? 0;
                    return timeA - timeB;
                  });

                const expiredAlarms = sortedAlarms
                  .filter(({ scheduleInfo }) => !scheduleInfo.nextOccurrence)
                  .sort((a, b) => {
                    return (
                      new Date(b.alarm.createdAt).getTime() -
                      new Date(a.alarm.createdAt).getTime()
                    );
                  });

                return (
                  <>
                    {/* Active Alarms */}
                    {activeAlarms.map(({ alarm }) => (
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
                    ))}

                    {/* Expired Alarms Section */}
                    {expiredAlarms.length > 0 && (
                      <View style={{ marginTop: spacing[2] }}>
                        <Pressable
                          onPress={() =>
                            setShowExpiredAlarms(!showExpiredAlarms)
                          }
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            paddingVertical: spacing[2],
                            paddingHorizontal: spacing[3],
                            backgroundColor: colors.background.secondary,
                            borderRadius: spacing[2],
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: spacing[2],
                            }}
                          >
                            <Ionicons
                              name="archive-outline"
                              size={18}
                              color={colors.text.secondary}
                            />
                            <Text
                              style={[
                                typography.labelLarge,
                                { color: colors.text.secondary },
                              ]}
                            >
                              Expired Alarms ({expiredAlarms.length})
                            </Text>
                          </View>
                          <Ionicons
                            name={
                              showExpiredAlarms ? "chevron-up" : "chevron-down"
                            }
                            size={20}
                            color={colors.text.secondary}
                          />
                        </Pressable>

                        {showExpiredAlarms && (
                          <View
                            style={{ gap: spacing[3], marginTop: spacing[3] }}
                          >
                            {expiredAlarms.map(({ alarm }) => (
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
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </>
                );
              })()}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Retry Connection Modal */}
      <RetryConnectionModal
        visible={showRetryModal}
        connectionError={connectionError}
        onRetry={handleReconnect}
        onClose={() => setShowRetryModal(false)}
      />

      {/* Quick Reminder Modal */}
      <QuickReminderModal
        visible={showQuickReminderModal}
        deviceId={deviceId}
        onClose={() => setShowQuickReminderModal(false)}
        onSuccess={() => {
          void queryClient.invalidateQueries({
            queryKey: ["device", "getById", { id: initialDeviceId }],
          });
        }}
      />

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
