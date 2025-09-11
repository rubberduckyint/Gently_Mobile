import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { State } from "react-native-ble-plx";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { useBluetooth } from "~/services/bluetooth";
import {
  getDeviceDetailsAndTime,
  syncDeviceAlarms,
} from "~/services/bluetooth/commands";
import { cards, colors, spacing, typography } from "~/styles";
import {
  calculateNextAlarmOccurrence,
  getAlarmStatusColor,
} from "~/utils/alarmUtils";
import { trpc } from "~/utils/api";

type DeviceWithAlarms = RouterOutputs["device"]["getById"];

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
  const { connect, disconnect, getBluetoothState } = useBluetooth();

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
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await trpc.device.delete.mutate({ id: id });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["device"] });
      router.back();
    },
  });

  const updateFromBluetoothMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      serialNumber: string;
      batteryLevel?: number;
      firmwareVersion?: string;
    }) => {
      return await trpc.device.updateFromBluetooth.mutate(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["device", "getById", { id: id }],
      });
    },
  });

  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isGettingDetails, setIsGettingDetails] = React.useState(false);

  const handleGetDeviceDetails = async () => {
    if (!device) {
      Alert.alert("Device Not Found", "Device information is not available.", [
        { text: "OK" },
      ]);
      return;
    }

    if (!device.id || !device.serialNumber) {
      Alert.alert(
        "Missing Information",
        "Cannot get device details without device ID and serial number. Please sync the device first.",
        [{ text: "OK" }],
      );
      return;
    }

    setIsGettingDetails(true);

    try {
      console.log(
        `🔍 Getting device details for serial: ${device.serialNumber}`,
      );

      const result = await getDeviceDetailsAndTime(connect, device.id);

      if (result.success && result.deviceInfo) {
        // Update the device with the retrieved information
        await updateFromBluetoothMutation.mutateAsync({
          id: device.id,
          serialNumber: result.deviceInfo.serialNumber,
          batteryLevel: result.deviceInfo.batteryLevel,
          firmwareVersion: result.deviceInfo.firmwareVersion,
        });

        // Refresh the device data
        await queryClient.invalidateQueries({
          queryKey: ["device", "getById", { id: device.id }],
        });

        Alert.alert(
          "Device Details Retrieved",
          `✅ Successfully retrieved device details!\n\nSerial: ${result.deviceInfo.serialNumber}\nFirmware: ${result.deviceInfo.firmwareVersion ?? "Unknown"}\nBattery: ${result.deviceInfo.batteryLevel}%\nDevice Time: ${result.deviceInfo.currentTime?.toLocaleString() ?? "Unknown"}`,
          [{ text: "OK" }],
        );
      } else {
        Alert.alert(
          "Connection Issue",
          result.message ||
            "Failed to retrieve device details. The device may not be responding.",
          [{ text: "OK" }],
        );
      }
    } catch (error) {
      console.error("❌ Error getting device details:", error);
      Alert.alert(
        "Error",
        "An unexpected error occurred while getting device details.",
        [{ text: "OK" }],
      );
    } finally {
      setIsGettingDetails(false);
    }
  };

  const handleSyncDevice = async () => {
    if (!device?.id) return;

    setIsSyncing(true);
    try {
      console.log("🔄 Starting comprehensive device sync for:", device.title);

      // Check if Bluetooth is available and enabled
      const bluetoothState = await getBluetoothState();
      console.log("📡 Bluetooth State:", bluetoothState);

      if (bluetoothState !== State.PoweredOn) {
        Alert.alert(
          "Bluetooth Required",
          "Please enable Bluetooth to sync with your device.",
          [{ text: "OK" }],
        );
        return;
      }

      // Update device sync status to SYNCING
      await trpc.device.updateFromBluetooth.mutate({
        id: device.id,
        serialNumber: device.serialNumber ?? "unknown",
      });

      // Establish secure connection to the device (now handled in syncDeviceAlarms)
      console.log("🔗 Starting device sync...");

      // Perform comprehensive device synchronization
      const syncResponse = await syncDeviceAlarms(
        connect,
        device.id,
        device.serialNumber ?? "unknown",
        device.alarms,
      );

      console.log("🔄 Sync completed:", syncResponse);

      if (syncResponse.success) {
        // Update device sync status to success
        await updateFromBluetoothMutation.mutateAsync({
          id: device.id,
          serialNumber: device.serialNumber ?? "unknown",
          batteryLevel: device.batteryLevel ?? undefined,
        });

        // Refresh device data to reflect sync status
        await queryClient.invalidateQueries({
          queryKey: ["device", "getById", { id: device.id }],
        });

        // Show results to user
        Alert.alert("Sync Successful", syncResponse.message, [{ text: "OK" }]);
      } else {
        Alert.alert("Sync Failed", syncResponse.message, [{ text: "OK" }]);
      }

      // Disconnect from device
      await disconnect();
      console.log("🔌 Disconnected from device");
    } catch (error) {
      console.error("❌ Device sync failed:", error);

      // Update device sync status to ERROR
      try {
        await trpc.device.updateFromBluetooth.mutate({
          id: device.id,
          serialNumber: device.serialNumber ?? "unknown",
        });
      } catch (dbError) {
        console.error("❌ Failed to update sync status:", dbError);
      }

      // Try to disconnect if there was a connection issue
      try {
        await disconnect();
      } catch (disconnectError) {
        console.error("❌ Error during cleanup disconnect:", disconnectError);
      }

      Alert.alert(
        "Sync Failed",
        `❌ Failed to sync with device: ${error instanceof Error ? error.message : "Unknown error"}\n\nPlease ensure your device is nearby and try again.`,
        [{ text: "OK" }],
      );
    } finally {
      setIsSyncing(false);
    }
  };

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
            style={[styles.syncButton, isSyncing && styles.buttonDisabled]}
            onPress={handleSyncDevice}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <View style={styles.syncingContainer}>
                <ActivityIndicator size="small" color="white" />
                <Text style={styles.syncButtonText}>Syncing...</Text>
              </View>
            ) : (
              <Text style={styles.syncButtonText}>Sync Device</Text>
            )}
          </Pressable>
          <Pressable
            style={[
              styles.detailsButton,
              isGettingDetails && styles.buttonDisabled,
            ]}
            onPress={handleGetDeviceDetails}
            disabled={isGettingDetails}
          >
            {isGettingDetails ? (
              <View style={styles.syncingContainer}>
                <ActivityIndicator size="small" color="white" />
                <Text style={styles.detailsButtonText}>Getting Details...</Text>
              </View>
            ) : (
              <Text style={styles.detailsButtonText}>
                Get Device Details & Time
              </Text>
            )}
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
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 4,
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
});
