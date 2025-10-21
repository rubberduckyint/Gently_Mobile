import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { AlarmForSync } from "~/utils/alarmSync";
import { AlarmCard } from "~/components/device";
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
  const [selectedReminderTime, setSelectedReminderTime] =
    React.useState<Date | null>(null);
  const [showDateTimePicker, setShowDateTimePicker] = React.useState(false);
  const [pickerMode, setPickerMode] = React.useState<"date" | "time">("date");
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
  const { connectionState, connectToDevice, notifications } = useBLE();

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
      // Reset the auto-sync flag so future changes can trigger new syncs
      autoSyncedRef.current = false;
      void queryClient.invalidateQueries({
        queryKey: ["device", "getById", { id: initialDeviceId }],
      });
    },
  });

  // Track if we've already auto-synced to prevent infinite loops
  const autoSyncedRef = React.useRef(false);
  // Track the previous alarm count to detect deletions
  const previousAlarmCountRef = React.useRef<number | null>(null);
  // Track the previous alarm data to detect updates
  const previousAlarmsRef = React.useRef<string | null>(null);

  // Auto-sync unsynced alarms when connected
  React.useEffect(() => {
    if (
      device?.alarms &&
      connectionState === "connected" &&
      !alarmSync.isSyncing
    ) {
      const alarmsForSync: AlarmForSync[] = device.alarms.map((alarm) => ({
        id: alarm.id,
        title: alarm.title,
        cronExpression: alarm.cronExpression,
        isActive: alarm.isActive,
        severityLevel: alarm.severityLevel,
        ledPattern: alarm.ledPattern,
        ledColor: alarm.ledColor,
        vibrationPattern: alarm.vibrationPattern,
        vibrationIntensity: alarm.vibrationIntensity,
        snoozePeriod: alarm.snoozePeriod,
        snoozeTimeout: alarm.snoozeTimeout,
        retriggerDelay: alarm.retriggerDelay,
        retriggerTimeout: alarm.retriggerTimeout,
        syncStatus: alarm.syncStatus,
      }));

      const currentAlarmCount = device.alarms.length;
      const previousAlarmCount = previousAlarmCountRef.current;

      // Create a hash of the current alarms to detect changes
      // Include key properties that would indicate the alarm needs re-syncing
      const currentAlarmsHash = JSON.stringify(
        alarmsForSync.map((a) => ({
          id: a.id,
          title: a.title,
          cronExpression: a.cronExpression,
          isActive: a.isActive,
          severityLevel: a.severityLevel,
          ledPattern: a.ledPattern,
          ledColor: a.ledColor,
          vibrationPattern: a.vibrationPattern,
          vibrationIntensity: a.vibrationIntensity,
        })),
      );
      const alarmsChanged = previousAlarmsRef.current !== currentAlarmsHash;

      // Reset the auto-sync flag if alarms have changed
      if (alarmsChanged) {
        console.log("📝 Alarms changed, triggering sync");
        autoSyncedRef.current = false;
      }

      // Trigger sync if we haven't already synced these alarms
      // We sync whenever alarms change or there's a deletion
      if (!autoSyncedRef.current) {
        const alarmWasDeleted =
          previousAlarmCount !== null && currentAlarmCount < previousAlarmCount;

        // Always sync if alarms changed or were deleted
        if (alarmsChanged || alarmWasDeleted) {
          // Set the flag IMMEDIATELY to prevent race conditions
          autoSyncedRef.current = true;

          console.log(
            `🔄 Triggering sync - changed: ${alarmsChanged}, deleted: ${alarmWasDeleted}`,
          );

          // Force sync of all alarms to peripheral
          void alarmSync.performSync(alarmsForSync, true);
        }
      }

      // Update the alarm count and hash for next comparison
      previousAlarmCountRef.current = currentAlarmCount;
      previousAlarmsRef.current = currentAlarmsHash;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.alarms, connectionState]);

  // Reset auto-sync flag when disconnected
  React.useEffect(() => {
    if (connectionState === "disconnected") {
      autoSyncedRef.current = false;
      previousAlarmCountRef.current = null;
      previousAlarmsRef.current = null;
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
      <Modal
        visible={showRetryModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRetryModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: spacing[4],
          }}
        >
          <View
            style={[
              cards.base,
              {
                width: "100%",
                maxWidth: 400,
                padding: spacing[6],
                alignItems: "center",
              },
            ]}
          >
            {/* Error Icon */}
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.error[100],
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing[4],
              }}
            >
              <Ionicons
                name="alert-circle"
                size={48}
                color={colors.error[600]}
              />
            </View>

            {/* Error Title */}
            <Text
              style={[
                typography.h3,
                {
                  color: colors.text.primary,
                  textAlign: "center",
                  marginBottom: spacing[2],
                },
              ]}
            >
              Connection Failed
            </Text>

            {/* Error Message */}
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  textAlign: "center",
                  marginBottom: spacing[4],
                },
              ]}
            >
              {connectionError ?? "Unable to connect to your Gently device"}
            </Text>

            {/* Instructions */}
            <View
              style={[
                {
                  backgroundColor: colors.primary[50],
                  borderRadius: 12,
                  padding: spacing[4],
                  marginBottom: spacing[6],
                  width: "100%",
                },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  marginBottom: spacing[2],
                }}
              >
                <Ionicons
                  name="information-circle"
                  size={20}
                  color={colors.primary[600]}
                  style={{ marginRight: spacing[2], marginTop: 2 }}
                />
                <Text
                  style={[
                    typography.labelLarge,
                    {
                      color: colors.primary[700],
                      flex: 1,
                    },
                  ]}
                >
                  To retry connection:
                </Text>
              </View>
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.primary[700],
                    marginLeft: spacing[7],
                  },
                ]}
              >
                Hold the button on your Gently device for 10 seconds until it
                beeps to enter pairing mode, then tap Retry below.
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={{ width: "100%", gap: spacing[3] }}>
              <Pressable
                style={[
                  buttons.base,
                  buttons.primary,
                  { alignItems: "center", justifyContent: "center" },
                ]}
                onPress={handleReconnect}
              >
                <Text style={[typography.labelLarge, { color: "#ffffff" }]}>
                  Retry Connection
                </Text>
              </Pressable>

              <Pressable
                style={[
                  buttons.base,
                  buttons.secondary,
                  { alignItems: "center", justifyContent: "center" },
                ]}
                onPress={() => setShowRetryModal(false)}
              >
                <Text
                  style={[
                    typography.labelLarge,
                    { color: colors.primary[600] },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quick Reminder Modal */}
      <Modal
        visible={showQuickReminderModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowQuickReminderModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={[
              cards.base,
              {
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                padding: spacing[6],
                paddingBottom: spacing[8],
              },
            ]}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: spacing[2],
              }}
            >
              <Text style={[typography.h4, { color: colors.text.primary }]}>
                Quick Reminder
              </Text>
              <Pressable
                onPress={() => setShowQuickReminderModal(false)}
                style={{
                  padding: spacing[1],
                }}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.text.secondary}
                />
              </Pressable>
            </View>

            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  marginBottom: spacing[5],
                },
              ]}
            >
              Create a one-time reminder that will alert you at the selected
              time
            </Text>

            {/* Quick Time Options */}
            <View style={{ marginBottom: spacing[5] }}>
              <Text
                style={[
                  typography.label,
                  { marginBottom: spacing[3], color: colors.text.primary },
                ]}
              >
                Quick Options
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: spacing[2],
                }}
              >
                {[
                  { label: "15 min", minutes: 15 },
                  { label: "30 min", minutes: 30 },
                  { label: "45 min", minutes: 45 },
                  { label: "1 hour", minutes: 60 },
                ].map((option) => (
                  <Pressable
                    key={option.minutes}
                    style={[
                      buttons.base,
                      buttons.secondary,
                      {
                        flex: 1,
                        minWidth: "45%",
                        paddingVertical: spacing[3],
                      },
                    ]}
                    onPress={() => {
                      const reminderTime = new Date(
                        Date.now() + option.minutes * 60000,
                      );
                      setSelectedReminderTime(reminderTime);
                    }}
                  >
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color={colors.primary[600]}
                      style={{ marginRight: spacing[1] }}
                    />
                    <Text
                      style={[typography.label, { color: colors.primary[600] }]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Custom Date/Time Picker */}
            <View style={{ marginBottom: spacing[5] }}>
              <Text
                style={[
                  typography.label,
                  { marginBottom: spacing[3], color: colors.text.primary },
                ]}
              >
                Or Pick Custom Time
              </Text>
              <Pressable
                style={[
                  buttons.base,
                  buttons.secondary,
                  {
                    paddingVertical: spacing[3],
                    paddingHorizontal: spacing[4],
                  },
                ]}
                onPress={() => {
                  setPickerMode("date");
                  setShowDateTimePicker(true);
                }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.primary[600]}
                  style={{ marginRight: spacing[2] }}
                />
                <Text
                  style={[typography.label, { color: colors.primary[600] }]}
                >
                  {selectedReminderTime
                    ? selectedReminderTime.toLocaleString()
                    : "Select Date & Time"}
                </Text>
              </Pressable>
            </View>

            {/* Date/Time Picker Modal */}
            {showDateTimePicker && (
              <Modal
                visible={showDateTimePicker}
                transparent={true}
                animationType="fade"
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    justifyContent: "center",
                    alignItems: "center",
                    paddingHorizontal: spacing[4],
                  }}
                >
                  <View
                    style={[
                      cards.base,
                      {
                        width: "100%",
                        maxWidth: 400,
                        padding: spacing[4],
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.h6,
                        {
                          color: colors.text.primary,
                          marginBottom: spacing[4],
                          textAlign: "center",
                        },
                      ]}
                    >
                      {pickerMode === "date" ? "Select Date" : "Select Time"}
                    </Text>
                    <DateTimePicker
                      value={selectedReminderTime ?? new Date()}
                      mode={pickerMode}
                      display="spinner"
                      onChange={(event, selectedDate) => {
                        if (selectedDate) {
                          setSelectedReminderTime(selectedDate);
                        }
                      }}
                      minimumDate={new Date()}
                      style={{
                        backgroundColor: colors.background.primary,
                        height: 200,
                      }}
                      textColor={colors.text.primary}
                    />
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: spacing[3],
                        paddingTop: spacing[4],
                        borderTopWidth: 1,
                        borderTopColor: colors.border.light,
                        marginTop: spacing[4],
                      }}
                    >
                      <Pressable
                        style={[buttons.base, buttons.secondary, { flex: 1 }]}
                        onPress={() => {
                          setShowDateTimePicker(false);
                          setSelectedReminderTime(null);
                        }}
                      >
                        <Text
                          style={[
                            typography.label,
                            { color: colors.primary[600] },
                          ]}
                        >
                          Cancel
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[buttons.base, buttons.primary, { flex: 1 }]}
                        onPress={() => {
                          if (pickerMode === "date") {
                            // After selecting date, show time picker
                            setPickerMode("time");
                          } else {
                            // After selecting time, close picker
                            setShowDateTimePicker(false);
                          }
                        }}
                      >
                        <Text
                          style={[
                            typography.label,
                            { color: colors.text.inverse },
                          ]}
                        >
                          {pickerMode === "date" ? "Next" : "Done"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Modal>
            )}

            {/* Selected Time Display */}
            {selectedReminderTime && (
              <View
                style={{
                  backgroundColor: colors.primary[50],
                  padding: spacing[3],
                  borderRadius: 12,
                  marginBottom: spacing[5],
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.primary[600]}
                  style={{ marginRight: spacing[2] }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[typography.caption, { color: colors.primary[700] }]}
                  >
                    Reminder set for:
                  </Text>
                  <Text
                    style={[
                      typography.labelLarge,
                      { color: colors.primary[700] },
                    ]}
                  >
                    {selectedReminderTime.toLocaleString()}
                  </Text>
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={{ gap: spacing[2] }}>
              <Pressable
                style={[
                  buttons.base,
                  selectedReminderTime ? buttons.success : buttons.disabled,
                  { alignItems: "center", justifyContent: "center" },
                ]}
                onPress={async () => {
                  if (!selectedReminderTime) {
                    Alert.alert("Error", "Please select a reminder time");
                    return;
                  }

                  if (!deviceId) {
                    Alert.alert("Error", "Device ID is missing");
                    return;
                  }

                  try {
                    // Create the quick reminder alarm
                    await trpc.alarm.create.mutate({
                      title: "Quick Reminder",
                      description: `Set for ${selectedReminderTime.toLocaleString()}`,
                      isActive: true,
                      startDate: selectedReminderTime.toISOString(),
                      endDate: undefined,
                      repeat: false,
                      cronExpression: `${selectedReminderTime.getMinutes()} ${selectedReminderTime.getHours()} ${selectedReminderTime.getDate()} ${selectedReminderTime.getMonth() + 1} *`,
                      severityLevel: "INFORMATIONAL",
                      ledPattern: "BLINK_SLOW",
                      ledColor: "BLUE",
                      vibrationPattern: 1, // Pattern 1 (valid range: 1-63)
                      vibrationIntensity: "MEDIUM",
                      snoozePeriod: 5,
                      snoozeTimeout: 120,
                      retriggerDelay: 5,
                      retriggerTimeout: 120,
                      deviceId: deviceId,
                    });

                    // Invalidate queries to refresh the alarm list
                    void queryClient.invalidateQueries({
                      queryKey: ["device", "getById", { id: deviceId }],
                    });

                    setShowQuickReminderModal(false);
                    setSelectedReminderTime(null);

                    Alert.alert(
                      "Success",
                      "Quick reminder created successfully!",
                    );
                  } catch (error) {
                    console.error("❌ Failed to create quick reminder:", error);
                    Alert.alert(
                      "Error",
                      `Failed to create reminder: ${error instanceof Error ? error.message : "Unknown error"}`,
                    );
                  }
                }}
                disabled={!selectedReminderTime}
              >
                <Ionicons
                  name="checkmark"
                  size={18}
                  color={colors.text.inverse}
                  style={{ marginRight: spacing[1] }}
                />
                <Text style={[typography.labelLarge, { color: "#ffffff" }]}>
                  Create Reminder
                </Text>
              </Pressable>

              <Pressable
                style={[
                  buttons.base,
                  buttons.secondary,
                  { alignItems: "center", justifyContent: "center" },
                ]}
                onPress={() => {
                  setShowQuickReminderModal(false);
                  setSelectedReminderTime(null);
                }}
              >
                <Text
                  style={[
                    typography.labelLarge,
                    { color: colors.primary[600] },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
