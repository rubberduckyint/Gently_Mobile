import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useGlobalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { RetryConnectionModal } from "~/components/RetryConnectionModal";
import { HamburgerMenu } from "~/components/ui/HamburgerMenu";
import { Header } from "~/components/ui/Header";
import { useBLE } from "~/contexts/BLEContext";
import { createTriggerAudioPatternRequest } from "~/services/ble/commands/triggerAudioPattern";
import { createTriggerLedPatternRequest } from "~/services/ble/commands/triggerLedPattern";
import { createTriggerVibrationPatternRequest } from "~/services/ble/commands/triggerVibrationPattern";
import {
  buttons,
  cards,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";
import { devicesBeingDeleted } from "~/utils/deviceDeletionTracker";

export default function DeviceDetailPage() {
  const { deviceId } = useGlobalSearchParams<{ deviceId: string }>();
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const isMountedRef = useRef(true);
  const [connectionProgress, setConnectionProgress] = useState<{
    message: string;
    progress: number;
  } | null>(null);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Store the initial device ID to prevent it from changing during navigation
  const [initialDeviceId] = useState(() => {
    return deviceId;
  });

  // Set mounted flag on mount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Use BLE context to show connection status
  const {
    connectionState,
    connectToDevice,
    notifications,
    sendBLECommand,
  } = useBLE();
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);

  // Animation for connecting status using Reanimated
  const pulseScale = useSharedValue(1);

  // Animate the pulse when connecting or showing progress
  useEffect(() => {
    const shouldAnimate =
      connectionState === "connecting" ||
      connectionState === "scanning" ||
      connectionProgress !== null;

    if (shouldAnimate) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 800 }),
          withTiming(1, { duration: 800 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [connectionState, connectionProgress, pulseScale]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Track the latest battery status from notifications
  const [batteryStatus, setBatteryStatus] = useState<{
    level: number;
    voltage: number;
    isCharging: boolean;
    levelText: string;
  } | null>(null);

  // Update battery status when notifications arrive
  useEffect(() => {
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
    refetch,
  } = useQuery({
    queryKey: ["device", "getById", { id: initialDeviceId }],
    queryFn: async () => {
      if (!isMountedRef.current) {
        throw new Error("Component unmounted");
      }
      return await trpc.device.getById.query({ id: initialDeviceId });
    },
    enabled: !!initialDeviceId && !!deviceId,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 5000,
    retry: (failureCount, error) => {
      if (
        error instanceof Error &&
        (error.message.includes("Device not found") ||
          error.message.includes("you don't have permission") ||
          error.message.includes("Component unmounted"))
      ) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Refetch device data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Handle device not found errors by navigating back automatically
  useEffect(() => {
    if (
      deviceId &&
      initialDeviceId &&
      deviceId === initialDeviceId &&
      error?.message &&
      (error.message.includes("Device not found") ||
        error.message.includes("you don't have permission"))
    ) {
      console.log(
        `Device not found or access denied for ID: ${initialDeviceId}`,
      );
      console.log("   └─ Error:", error.message);
      console.log("   └─ Navigating back to dashboard");

      const timer = setTimeout(() => {
        router.push("/dashboard");
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [error, initialDeviceId, deviceId]);

  // Auto-connect-on-mount intentionally disabled 2026-05-14. This screen used
  // to fire `connectToDevice(serialNumber, ...)` on mount, which runs
  // scan-by-serial — but the bracelet does NOT advertise post-pairing, so the
  // scan always times out. Worse, it sets BLEContext.connectionState to
  // "scanning"/"connecting", which fights the BLE-context-level periodic
  // reconnect loop and prevents real reconnect attempts. BLEContext is now
  // the sole reconnect authority — it polls every 15s while disconnected and
  // calls `BleManager.connect(id)` directly using the stored peripheralId
  // (no scan needed since the bracelet is OS-known). The "Reconnecting…" UI
  // on this screen still reflects connectionState from BLEContext, so the
  // user-facing behavior is preserved.

  // Handle manual reconnect
  const handleReconnect = async () => {
    if (!device?.serialNumber) {
      Alert.alert("Error", "Device serial number is required for connection");
      return;
    }

    try {
      setConnectionProgress(null);
      setConnectionError(null);
      setShowRetryModal(false);

      await connectToDevice(
        device.serialNumber,
        (progress) => {
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
          connectionTimeoutMs: 60000,
          stabilizationDelayMs: 900,
          mtuSize: 512,
          scanTimeoutSeconds: 30,
        },
      );
      console.log("Manual reconnect successful!");
      setConnectionProgress(null);
      setConnectionError(null);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setConnectionError(errorMessage);
      setConnectionProgress(null);
      setShowRetryModal(true);
    }
  };

  const handleTriggerVibrate = async () => {
    setTriggerLoading("vibrate");
    try {
      await sendBLECommand(
        createTriggerVibrationPatternRequest({
          vibrationPattern: 1, // Heartbeat
          vibrationIntensity: 2, // HIGH
          totalDurationSeconds: 2,
        }),
      );
    } catch {
      Alert.alert("Error", "Failed to trigger vibration");
    } finally {
      setTriggerLoading(null);
    }
  };

  const handleTriggerSound = async () => {
    setTriggerLoading("sound");
    try {
      await sendBLECommand(
        createTriggerAudioPatternRequest({
          onDurationMs: 200,
          offDurationMs: 200,
          totalDurationSeconds: 2,
        }),
      );
    } catch {
      Alert.alert("Error", "Failed to trigger sound");
    } finally {
      setTriggerLoading(null);
    }
  };

  const handleTriggerLight = async () => {
    setTriggerLoading("light");
    try {
      await sendBLECommand(
        createTriggerLedPatternRequest({
          ledColor: 1, // Blue
          onDurationMs: 500,
          offDurationMs: 500,
          totalDurationSeconds: 2,
        }),
      );
    } catch {
      Alert.alert("Error", "Failed to trigger light");
    } finally {
      setTriggerLoading(null);
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
        title={
          device.title
            ? device.title.length > 20
              ? `${device.title.slice(0, 20)}...`
              : device.title
            : "Gently Device"
        }
        showBackButton={true}
        onBackPress={() => router.push("/")}
        rightComponent={
          <HamburgerMenu
            options={[
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
                icon: "trash" as const,
                destructive: true,
              },
            ]}
          />
        }
      />

      {/* Device Status Bar */}
      <View
        style={{
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[2],
          backgroundColor: colors.background.secondary,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[2],
        }}
      >
        {/* Connection Status */}
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Animated.View
            style={[{ marginRight: spacing[1] }, pulseAnimatedStyle]}
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
            numberOfLines={1}
          >
            {connectionProgress?.message ??
              connectionState.charAt(0).toUpperCase() +
                connectionState.slice(1)}
          </Text>
        </View>

        {/* Battery Status */}
        {batteryStatus && (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
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

        {/* Serial Number (last 5 chars) */}
        {device.serialNumber && (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
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
              {device.serialNumber.slice(-5)}
            </Text>
          </View>
        )}

        {/* Reconnect Button - compact version */}
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
                  paddingHorizontal: spacing[2],
                },
              ]}
              onPress={handleReconnect}
            >
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.inverse, fontSize: 11 },
                ]}
              >
                {connectionState === "error" ? "Retry" : "Reconnect"}
              </Text>
            </Pressable>
          )}
      </View>

      <ScrollView
        style={containers.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Device Info Section */}
        <View style={[containers.section, { paddingTop: spacing[3] }]}>
          <View
            style={[
              cards.base,
              { alignItems: "center", paddingVertical: spacing[8] },
            ]}
          >
            <Ionicons
              name="watch-outline"
              size={48}
              color={
                connectionState === "connected"
                  ? colors.success[600]
                  : colors.gray[400]
              }
              style={{ marginBottom: spacing[3] }}
            />
            <Text
              style={[
                typography.h6,
                {
                  color: colors.text.primary,
                  marginBottom: spacing[1],
                },
              ]}
            >
              {connectionState === "connected"
                ? "Device Connected"
                : "Device Disconnected"}
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, textAlign: "center" },
              ]}
            >
              {connectionState === "connected"
                ? "Your Gently device is ready"
                : "Connect to your device to get started"}
            </Text>
          </View>

          {/* Device Trigger Buttons */}
          {connectionState === "connected" && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: spacing[3],
                marginTop: spacing[4],
              }}
            >
              <Pressable
                style={[
                  cards.base,
                  {
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: spacing[4],
                    opacity: triggerLoading === "vibrate" ? 0.6 : 1,
                  },
                ]}
                onPress={handleTriggerVibrate}
                disabled={triggerLoading !== null}
              >
                {triggerLoading === "vibrate" ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary[500]}
                    style={{ marginBottom: spacing[2] }}
                  />
                ) : (
                  <Ionicons
                    name="phone-portrait-outline"
                    size={28}
                    color={colors.primary[600]}
                    style={{ marginBottom: spacing[2] }}
                  />
                )}
                <Text
                  style={[
                    typography.label,
                    { color: colors.text.primary, fontWeight: "600" },
                  ]}
                >
                  Vibrate
                </Text>
              </Pressable>

              <Pressable
                style={[
                  cards.base,
                  {
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: spacing[4],
                    opacity: triggerLoading === "sound" ? 0.6 : 1,
                  },
                ]}
                onPress={handleTriggerSound}
                disabled={triggerLoading !== null}
              >
                {triggerLoading === "sound" ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary[500]}
                    style={{ marginBottom: spacing[2] }}
                  />
                ) : (
                  <Ionicons
                    name="volume-high-outline"
                    size={28}
                    color={colors.primary[600]}
                    style={{ marginBottom: spacing[2] }}
                  />
                )}
                <Text
                  style={[
                    typography.label,
                    { color: colors.text.primary, fontWeight: "600" },
                  ]}
                >
                  Sound
                </Text>
              </Pressable>

              <Pressable
                style={[
                  cards.base,
                  {
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: spacing[4],
                    opacity: triggerLoading === "light" ? 0.6 : 1,
                  },
                ]}
                onPress={handleTriggerLight}
                disabled={triggerLoading !== null}
              >
                {triggerLoading === "light" ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary[500]}
                    style={{ marginBottom: spacing[2] }}
                  />
                ) : (
                  <Ionicons
                    name="flash-outline"
                    size={28}
                    color={colors.primary[600]}
                    style={{ marginBottom: spacing[2] }}
                  />
                )}
                <Text
                  style={[
                    typography.label,
                    { color: colors.text.primary, fontWeight: "600" },
                  ]}
                >
                  Light
                </Text>
              </Pressable>
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
    </SafeAreaView>
  );
}
