import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SecureConnectionResult } from "~/services/bluetooth/connection";
import type { RouterOutputs } from "~/utils/api";
import { useBluetoothContext } from "~/services/bluetooth/BluetoothContext";
import { cards, colors, spacing, typography } from "~/styles";
import {
  calculateNextAlarmOccurrence,
  getAlarmStatusColor,
} from "~/utils/alarmUtils";
import { trpc } from "~/utils/api";

type DeviceWithAlarms = RouterOutputs["device"]["getById"];

// Temporary type extension until database schema is migrated
type DeviceWithBluetooth = DeviceWithAlarms & {
  bluetoothDeviceId?: string;
};

function AlarmCard({
  alarm,
}: {
  alarm: NonNullable<DeviceWithAlarms>["alarms"][number];
}) {
  const scheduleInfo = calculateNextAlarmOccurrence({
    isActive: alarm.isActive,
    startDate: alarm.startDate,
    endDate: alarm.endDate,
    repeat: alarm.repeat,
    cronExpression: alarm.cronExpression,
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return colors.error[500];
      case "MEDIUM":
        return colors.warning[500];
      case "LOW":
        return colors.success[500];
      default:
        return colors.text.secondary;
    }
  };

  return (
    <View style={[cards.base, { marginBottom: spacing[4] }]}>
      <View
        style={[
          { flexDirection: "row", alignItems: "flex-start" },
          { marginBottom: spacing[3] },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[typography.h4, { color: colors.text.primary }]}>
            {alarm.title}
          </Text>
          {alarm.description && (
            <Text
              style={[
                typography.bodySmall,
                { color: colors.text.secondary, marginTop: spacing[1] },
              ]}
            >
              {alarm.description}
            </Text>
          )}
        </View>
        <View
          style={[
            {
              paddingHorizontal: spacing[2],
              paddingVertical: spacing[1],
              borderRadius: spacing[1],
              backgroundColor: getPriorityColor(alarm.priority),
            },
          ]}
        >
          <Text
            style={[
              typography.bodySmall,
              { color: colors.text.inverse, fontWeight: "600" },
            ]}
          >
            {alarm.priority}
          </Text>
        </View>
      </View>

      {/* Schedule Information */}
      <View
        style={[
          {
            backgroundColor: colors.background.tertiary,
            padding: spacing[3],
            borderRadius: spacing[2],
            marginBottom: spacing[3],
          },
        ]}
      >
        <View
          style={[
            {
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            },
            { marginBottom: spacing[2] },
          ]}
        >
          <Text
            style={[typography.bodySmall, { color: colors.text.secondary }]}
          >
            Next Occurrence:
          </Text>
          <Text
            style={[
              typography.bodySmall,
              { color: getAlarmStatusColor(scheduleInfo), fontWeight: "600" },
            ]}
          >
            {scheduleInfo.timeUntilNext}
          </Text>
        </View>

        {scheduleInfo.nextOccurrence && (
          <Text
            style={[typography.bodySmall, { color: colors.text.secondary }]}
          >
            {scheduleInfo.formattedNextTime}
          </Text>
        )}
      </View>

      {/* Alarm Details */}
      <View style={[{ flexDirection: "row", justifyContent: "space-between" }]}>
        <View style={{ flex: 1 }}>
          <Text
            style={[typography.bodySmall, { color: colors.text.secondary }]}
          >
            Status
          </Text>
          <Text
            style={[
              typography.bodySmall,
              {
                color: alarm.isActive
                  ? colors.text.success
                  : colors.text.secondary,
                fontWeight: "600",
              },
            ]}
          >
            {alarm.isActive ? "Active" : "Inactive"}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={[typography.bodySmall, { color: colors.text.secondary }]}
          >
            Repeat
          </Text>
          <Text
            style={[
              typography.bodySmall,
              { color: colors.text.primary, fontWeight: "600" },
            ]}
          >
            {alarm.repeat ? "Yes" : "No"}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={[typography.bodySmall, { color: colors.text.secondary }]}
          >
            Haptic
          </Text>
          <Text
            style={[
              typography.bodySmall,
              { color: colors.text.primary, fontWeight: "600" },
            ]}
          >
            {alarm.hapticChoice}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={[typography.bodySmall, { color: colors.text.secondary }]}
          >
            Sync
          </Text>
          <Text
            style={[
              typography.bodySmall,
              {
                color:
                  alarm.syncStatus === "SYNCED"
                    ? colors.status.synced
                    : alarm.syncStatus === "ERROR"
                      ? colors.status.error
                      : colors.status.syncing,
                fontWeight: "600",
              },
            ]}
          >
            {alarm.syncStatus}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function DeviceDetailPage() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { connectBySerialNumber, isDeviceIdConnected, stopScan } =
    useBluetoothContext();

  // State for BLE connection management
  const [deviceConnection, setDeviceConnection] =
    useState<SecureConnectionResult | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionTime, setConnectionTime] = useState<Date | null>(null);
  const isConnectionAttemptActiveRef = useRef(false);

  const {
    data: device,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["device", "getById", { id: id }],
    queryFn: async () => {
      return await trpc.device.getById.query({ id: id });
    },
    enabled: !!id,
    retry: (failureCount, error) => {
      // Don't retry if the device is not found (likely deleted)
      if (
        error instanceof Error &&
        error.message.includes("Device not found")
      ) {
        return false;
      }
      // Default retry behavior for other errors
      return failureCount < 3;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await trpc.device.delete.mutate({ id: id });
    },
    onSuccess: () => {
      // Remove the specific device query from cache to prevent refetch of deleted device
      queryClient.removeQueries({
        queryKey: ["device", "getById", { id: id }],
      });
      // Invalidate the devices list to refresh the dashboard
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      router.back();
    },
  });

  // Handle device not found errors by navigating back automatically
  useEffect(() => {
    if (error?.message.includes("Device not found")) {
      console.log("📱 Device not found, navigating back to dashboard");
      router.back();
    }
  }, [error]);

  // Establish BLE connection when device is available (only try once)
  useEffect(() => {
    const establishConnection = async () => {
      if (!device?.id || isConnecting || deviceConnection) return;

      // Check if device has a serial number for connection
      if (!device.serialNumber) {
        console.log("⚠️ Device has no serial number, cannot connect");
        return;
      }

      // For checking existing connection, we need to use the stored bluetoothDeviceId if available
      // but we'll connect using serial number for robustness
      const deviceWithBleId = device as DeviceWithBluetooth;
      const checkDeviceId = deviceWithBleId.bluetoothDeviceId;

      console.log(
        "🔍 Checking if device is already connected by device ID:",
        checkDeviceId,
        "for serial:",
        device.serialNumber,
      );

      // First, check if this device is already connected (if we have a bluetooth device ID)
      if (checkDeviceId) {
        try {
          const existingConnection = await isDeviceIdConnected(checkDeviceId);

          if (existingConnection.isConnected) {
            console.log(
              "✅ Device is already connected! Reusing existing connection with custom key.",
            );

            // Create a mock SecureConnectionResult to maintain compatibility
            // Note: We don't have the uptime from the existing connection, but that's OK
            // for reusing the connection since the key is already established
            const mockUptime = new Uint8Array([0, 0, 0, 0]); // Mock uptime
            const reuseConnection: SecureConnectionResult = {
              device: existingConnection.device,
              protocol: existingConnection.protocol,
              deviceInfo: existingConnection.deviceInformation ?? {
                hardwareVersion: 1,
                firmwareVersionMajor: 1,
                firmwareVersionMinor: 0,
                firmwareBuildNumber: 1,
              },
              uptime: mockUptime,
              serialNumber: device.serialNumber ?? "UNKNOWN",
            };

            setDeviceConnection(reuseConnection);
            setConnectionTime(new Date());
            console.log(
              "✅ Reusing existing connection - no pairing process needed, custom key already established",
            );
            return;
          }
        } catch (error) {
          console.log("⚠️ Error checking existing connection:", error);
          // Continue with new connection attempt
        }
      }

      // Mark connection attempt as active
      isConnectionAttemptActiveRef.current = true;

      // Try to connect only once when device is first loaded
      setIsConnecting(true);
      try {
        console.log(
          "🔗 No existing connection found. Establishing new connection to device:",
          device.title,
          "using serial number:",
          device.serialNumber,
        );
        console.log(
          "🔐 This will go through the full pairing process to generate a new custom key",
        );

        // Check if component was unmounted during async work
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!isConnectionAttemptActiveRef.current) {
          console.log(
            "🛑 Connection attempt cancelled due to component unmount",
          );
          return;
        }

        const connection = await connectBySerialNumber(device.serialNumber);

        // Check again after async operation
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!isConnectionAttemptActiveRef.current) {
          console.log(
            "🛑 Connection established but component unmounted, cleaning up",
          );
          connection.device.cancelConnection().catch(console.error);
          return;
        }

        setDeviceConnection(connection);
        setConnectionTime(new Date());
        console.log("✅ New connection established with fresh custom key");
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (isConnectionAttemptActiveRef.current) {
          console.error("❌ Failed to establish connection:", error);
          setConnectionTime(null);
        } else {
          console.log("🛑 Connection attempt was cancelled");
        }
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (isConnectionAttemptActiveRef.current) {
          setIsConnecting(false);
        }
        isConnectionAttemptActiveRef.current = false;
      }
    };

    void establishConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, connectBySerialNumber, isDeviceIdConnected]); // Intentionally exclude deviceConnection and isConnecting to prevent loop

  // Cleanup connection and stop any ongoing scans when component unmounts
  useEffect(() => {
    return () => {
      console.log("🧹 DeviceDetailPage: Starting cleanup on component unmount");

      // Cancel any ongoing connection attempt
      if (isConnectionAttemptActiveRef.current) {
        console.log("🛑 Cancelling ongoing connection attempt due to unmount");
        isConnectionAttemptActiveRef.current = false;
      }

      // Always stop any ongoing scans when navigating away from device detail page
      console.log(
        "🛑 Stopping any ongoing device scans due to page navigation",
      );
      stopScan();

      // NOTE: We intentionally do NOT disconnect the device here
      // The connection should persist across page navigations
      // The BluetoothContext will manage the connection lifecycle globally
      console.log("� Preserving device connection for cross-page navigation");

      console.log("✅ DeviceDetailPage: Cleanup completed");
    };
  }, [stopScan]); // Removed deviceConnection from dependencies since we're not cleaning it up

  const [connectionDurationTick, setConnectionDurationTick] = useState(0);

  // Update connection duration every second
  useEffect(() => {
    if (!deviceConnection || !connectionTime) return;

    const interval = setInterval(() => {
      setConnectionDurationTick((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [deviceConnection, connectionTime]);

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
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading device...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load device</Text>
          <Text style={styles.errorDescription}>
            {error.message || "Please try again later"}
          </Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Device not found</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
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

  const getConnectionStatusText = () => {
    if (deviceConnection) {
      return "🟢 Connected";
    } else if (isConnecting) {
      return "🟡 Connecting";
    } else {
      return "🔴 Disconnected";
    }
  };

  const getConnectionDuration = () => {
    if (!connectionTime || !deviceConnection) return "Not connected";
    // Force re-render by using connectionDurationTick in calculation
    const now = new Date(Date.now() + connectionDurationTick * 0);
    const diffMs = now.getTime() - connectionTime.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);

    if (diffMinutes > 0) {
      return `${diffMinutes}m ${diffSeconds % 60}s`;
    } else {
      return `${diffSeconds}s`;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Device Header */}
        <View style={styles.deviceHeader}>
          <View style={styles.deviceAvatar}>
            <Text style={styles.deviceInitials}>
              {device.title?.slice(0, 2).toUpperCase() ?? "??"}
            </Text>
          </View>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceTitle}>{device.title}</Text>
            <Text style={styles.deviceDescription}>{device.description}</Text>
          </View>
        </View>

        {/* Device Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Connection</Text>
            <Text style={styles.statValue}>{getConnectionStatusText()}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Battery Level</Text>
            <Text
              style={[
                styles.statValue,
                { color: getBatteryColor(device.batteryLevel ?? 0) },
              ]}
            >
              {device.batteryLevel ?? 0}%
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Sync Status</Text>
            <Text style={styles.statValue}>
              {getSyncStatusText(device.syncStatus ?? "NOT_SYNCED")}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Last Sync</Text>
            <Text style={styles.statValue}>
              {device.lastSync
                ? new Date(device.lastSync).toLocaleDateString()
                : "Never"}
            </Text>
          </View>
          {device.serialNumber && (
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Serial Number</Text>
              <Text style={styles.statValue}>{device.serialNumber}</Text>
            </View>
          )}
        </View>

        {/* BLE Connection Status */}
        <View style={styles.section}>
          <View style={styles.connectionStatusContainer}>
            <View style={styles.connectionStatusHeader}>
              <Text style={styles.sectionTitle}>BLE Connection</Text>
              <View
                style={[
                  styles.connectionIndicator,
                  deviceConnection
                    ? styles.connectionIndicatorConnected
                    : isConnecting
                      ? styles.connectionIndicatorConnecting
                      : styles.connectionIndicatorDisconnected,
                ]}
              >
                <Text
                  style={[
                    styles.connectionIndicatorText,
                    deviceConnection
                      ? styles.connectionIndicatorTextConnected
                      : isConnecting
                        ? styles.connectionIndicatorTextConnecting
                        : styles.connectionIndicatorTextDisconnected,
                  ]}
                >
                  {deviceConnection
                    ? "Connected"
                    : isConnecting
                      ? "Connecting..."
                      : "Disconnected"}
                </Text>
              </View>
            </View>
            {deviceConnection && (
              <View>
                <Text style={styles.connectionStatusDescription}>
                  🔗 Persistent connection active - operations will be faster
                </Text>
                <Text style={styles.connectionStatusDescription}>
                  📡 Connected for: {getConnectionDuration()}
                </Text>
              </View>
            )}
            {isConnecting && (
              <View style={styles.connectingContainer}>
                <ActivityIndicator size="small" color={colors.primary[500]} />
                <Text style={styles.connectingText}>
                  Establishing secure connection to {device.title}...
                </Text>
              </View>
            )}
            {!deviceConnection && !isConnecting && (
              <Text style={styles.connectionStatusDescription}>
                ⚠️ Device connection will be established automatically when
                needed
              </Text>
            )}
          </View>
        </View>

        {/* Alarms Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Alarms ({device.alarms.length})
            </Text>
            <Pressable
              style={styles.addAlarmButton}
              onPress={() => router.push(`/alarms/add/${device.id}`)}
            >
              <Text style={styles.addAlarmButtonText}>+ Add Alarm</Text>
            </Pressable>
          </View>

          {device.alarms.length === 0 ? (
            <View style={styles.emptyAlarmsContainer}>
              <Text style={styles.emptyAlarmsText}>No alarms configured</Text>
              <Text style={styles.emptyAlarmsDescription}>
                Add your first alarm to get started
              </Text>
            </View>
          ) : (
            <View style={styles.alarmsContainer}>
              {device.alarms.map((alarm) => (
                <AlarmCard key={alarm.id} alarm={alarm} />
              ))}
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <Pressable
            style={[
              styles.testButton,
              !deviceConnection && styles.buttonDisabled,
            ]}
            onPress={() => router.push(`/ble-test?deviceId=${device.id}`)}
            disabled={!deviceConnection}
          >
            <Text style={styles.testButtonText}>
              {deviceConnection
                ? "Test BLE Connection"
                : "Connect Device First"}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.deleteButton,
              deleteMutation.isPending && styles.deleteButtonDisabled,
            ]}
            onPress={handleDeleteDevice}
            disabled={deleteMutation.isPending}
          >
            <Text style={styles.deleteButtonText}>
              {deleteMutation.isPending ? "Deleting..." : "Delete Device"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6b7280",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#dc2626",
    marginBottom: 8,
    textAlign: "center",
  },
  errorDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    marginTop: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  deviceAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  deviceInitials: {
    fontSize: 20,
    fontWeight: "600",
    color: "#374151",
  },
  deviceInfo: {
    flex: 1,
  },
  deviceTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  deviceDescription: {
    fontSize: 16,
    color: "#6b7280",
  },
  statsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    minWidth: "48%",
    marginHorizontal: "1%",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
    textAlign: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    textAlign: "center",
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
  },
  addAlarmButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addAlarmButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  alarmsContainer: {
    gap: 12,
  },
  alarmCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  alarmHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  alarmInfo: {
    flex: 1,
    marginRight: 12,
  },
  alarmTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 2,
  },
  alarmDescription: {
    fontSize: 14,
    color: "#6b7280",
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  alarmDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  alarmDetailItem: {
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  emptyAlarmsContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  emptyAlarmsText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  emptyAlarmsDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 32,
  },
  syncButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  syncingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  detailsButton: {
    backgroundColor: "#10b981",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  detailsButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  testButton: {
    backgroundColor: "#f59e0b",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  testButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    backgroundColor: "#9ca3af",
  },
  deleteButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  deleteButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  deleteButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  connectionStatusContainer: {
    marginBottom: 16,
  },
  connectionStatusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  connectionIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  connectionIndicatorConnected: {
    backgroundColor: "#dcfce7",
    borderColor: "#16a34a",
  },
  connectionIndicatorConnecting: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
  },
  connectionIndicatorDisconnected: {
    backgroundColor: "#fee2e2",
    borderColor: "#dc2626",
  },
  connectionIndicatorText: {
    fontSize: 12,
    fontWeight: "600",
  },
  connectionIndicatorTextConnected: {
    color: "#16a34a",
  },
  connectionIndicatorTextConnecting: {
    color: "#f59e0b",
  },
  connectionIndicatorTextDisconnected: {
    color: "#dc2626",
  },
  connectionStatusDescription: {
    fontSize: 14,
    color: "#6b7280",
    fontStyle: "italic",
  },
  connectingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  connectingText: {
    fontSize: 14,
    color: "#6b7280",
  },
});
