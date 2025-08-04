import React, { useEffect } from "react";
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
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { trpc } from "~/utils/api";
import { useGentlyBluetooth } from "~/hooks/useGentlyBluetooth";
import { GentlyConnectionState } from "~/services/GentlyTypes";

type DeviceWithAlarms = RouterOutputs["device"]["getById"];

function AlarmCard({ alarm }: { alarm: NonNullable<DeviceWithAlarms>["alarms"][number] }) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return "#ef4444";
      case "MEDIUM":
        return "#f59e0b";
      case "LOW":
        return "#10b981";
      default:
        return "#6b7280";
    }
  };

  return (
    <View style={styles.alarmCard}>
      <View style={styles.alarmHeader}>
        <View style={styles.alarmInfo}>
          <Text style={styles.alarmTitle}>{alarm.title}</Text>
          {alarm.description && (
            <Text style={styles.alarmDescription}>{alarm.description}</Text>
          )}
        </View>
        <View style={[
          styles.priorityBadge,
          { backgroundColor: getPriorityColor(alarm.priority) }
        ]}>
          <Text style={styles.priorityText}>{alarm.priority}</Text>
        </View>
      </View>
      <View style={styles.alarmDetails}>
        <View style={styles.alarmDetailItem}>
          <Text style={styles.detailLabel}>Status</Text>
          <Text style={[
            styles.detailValue,
            { color: alarm.isActive ? "#10b981" : "#6b7280" }
          ]}>
            {alarm.isActive ? "Active" : "Inactive"}
          </Text>
        </View>
        <View style={styles.alarmDetailItem}>
          <Text style={styles.detailLabel}>Repeat</Text>
          <Text style={styles.detailValue}>
            {alarm.repeat ? "Yes" : "No"}
          </Text>
        </View>
        <View style={styles.alarmDetailItem}>
          <Text style={styles.detailLabel}>Haptic</Text>
          <Text style={styles.detailValue}>{alarm.hapticChoice}</Text>
        </View>
      </View>
    </View>
  );
}

export default function DeviceDetailPage() {
  const { id } = useGlobalSearchParams<{ id: string }>();

  // BLE functionality
  const {
    connectionState,
    connectedDevice,
    connectToDevice,
    disconnectDevice,
    deleteDevice,
    getDeviceInfo,
    getDeviceStatus,
    error: bleError
  } = useGentlyBluetooth();

  const {
    data: device,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["device", "getById", { id: id! }],
    queryFn: async () => {
      return await trpc.device.getById.query({ id: id! });
    },
    enabled: !!id,
  });

  // Handle BLE connection based on device ID (assuming it matches BLE unique ID)
  const handleBLEConnect = async () => {
    if (!device?.id) {
      Alert.alert("Error", "Device ID not found");
      return;
    }

    try {
      await connectToDevice(device.id);
      Alert.alert("Success", "Connected to device");
      
      // Optionally sync time
      try {
        // await setTime(); // Commented out since setTime doesn't exist in hook
      } catch (timeError) {
        console.warn("Failed to set time:", timeError);
      }
      
      // Refresh device data
      refetch();
    } catch (error) {
      Alert.alert("Connection Failed", error instanceof Error ? error.message : "Failed to connect");
    }
  };

  const handleBLEDisconnect = async () => {
    try {
      await disconnectDevice();
      Alert.alert("Disconnected", "Device disconnected");
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  };

  const handleSyncDevice = async () => {
    if (connectionState !== GentlyConnectionState.CONNECTED) {
      Alert.alert("Not Connected", "Please connect to the device first");
      return;
    }

    try {
      const deviceStatus = await getDeviceStatus();
      const deviceInfo = await getDeviceInfo();
      
      if (deviceStatus && deviceInfo) {
        Alert.alert(
          "Device Status", 
          `Battery: ${deviceStatus.batteryVoltage}mV (${deviceStatus.batteryLevel}%)\n` +
          `Uptime: ${deviceStatus.uptimeSeconds}s\n` +
          `Firmware: ${deviceInfo.firmwareVersion}\n` +
          `Hardware: ${deviceInfo.hardwareVersion}\n` +
          `Charging: ${deviceStatus.isCharging ? 'Yes' : 'No'}`
        );
      } else {
        Alert.alert("Success", "Device synced successfully");
      }
      
      // Refresh device data
      refetch();
    } catch (error) {
      Alert.alert("Sync Failed", error instanceof Error ? error.message : "Failed to sync device");
    }
  };

  const handleDeleteDevice = async () => {
    if (!device?.id) {
      Alert.alert("Error", "Device ID not found");
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      "Delete Device",
      "Are you sure you want to delete this device? This will reset the device to factory mode and remove it from your account. This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              console.log("Starting device deletion for ID:", device.id);
              
              // Ensure device ID exists
              if (!device.id) {
                throw new Error("Device ID is required for deletion");
              }
              
              // Show loading state
              Alert.alert(
                "Deleting Device",
                "Resetting device to factory mode and removing from your account...",
                [],
                { cancelable: false }
              );
              
              // First, perform BLE deletion (factory reset if paired via BLE)
              try {
                await deleteDevice(device.id);
                console.log("BLE device deletion completed");
              } catch (bleError) {
                console.warn("BLE device deletion failed, but continuing with app deletion:", bleError);
              }
              
              // Second, remove device from app database
              try {
                await trpc.device.delete.mutate({ id: device.id });
                console.log("App database deletion completed");
              } catch (dbError) {
                console.error("Failed to delete device from app database:", dbError);
                throw new Error("Failed to remove device from your account");
              }
              
              // Show success and go back
              Alert.alert(
                "Device Deleted",
                "The device has been successfully reset to factory mode and removed from your account.",
                [
                  {
                    text: "OK",
                    onPress: () => router.back()
                  }
                ]
              );
              
            } catch (error) {
              console.error("Delete device error:", error);
              Alert.alert(
                "Delete Failed",
                error instanceof Error ? error.message : "Failed to delete device. The device may still be paired.",
                [{ text: "OK" }]
              );
            }
          }
        }
      ]
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
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
          >
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
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
          >
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

  const getConnectionStatusText = (status: GentlyConnectionState) => {
    switch (status) {
      case GentlyConnectionState.CONNECTED:
        return "Connected";
      case GentlyConnectionState.CONNECTING:
        return "Connecting...";
      case GentlyConnectionState.AUTHENTICATING:
        return "Authenticating...";
      case GentlyConnectionState.SCANNING:
        return "Scanning...";
      case GentlyConnectionState.ERROR:
        return "Connection Error";
      default:
        return "Disconnected";
    }
  };

  const getConnectionStatusColor = (status: GentlyConnectionState) => {
    switch (status) {
      case GentlyConnectionState.CONNECTED:
        return "#10b981"; // green
      case GentlyConnectionState.CONNECTING:
      case GentlyConnectionState.AUTHENTICATING:
      case GentlyConnectionState.SCANNING:
        return "#f59e0b"; // amber
      case GentlyConnectionState.ERROR:
        return "#ef4444"; // red
      default:
        return "#6b7280"; // gray
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Device Header */}
        <View style={styles.deviceHeader}>
          <View style={styles.deviceAvatar}>
            <Text style={styles.deviceInitials}>
              {device.title?.slice(0, 2).toUpperCase() || "??"}
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
            <Text style={[
              styles.statValue,
              { color: getBatteryColor(device.batteryLevel || 0) }
            ]}>
              {device.batteryLevel || 0}%
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Sync Status</Text>
            <Text style={styles.statValue}>
              {getSyncStatusText(device.syncStatus || "NOT_SYNCED")}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Last Sync</Text>
            <Text style={styles.statValue}>
              {device.lastSync 
                ? new Date(device.lastSync).toLocaleDateString()
                : "Never"
              }
            </Text>
          </View>
        </View>

        {/* BLE Connection Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Bluetooth Connection</Text>
          </View>
          
          <View style={styles.bleStatusContainer}>
            <View style={styles.bleStatusInfo}>
              <Text style={styles.bleStatusLabel}>Status:</Text>
              <Text style={[
                styles.bleStatusValue,
                { color: getConnectionStatusColor(connectionState) }
              ]}>
                {getConnectionStatusText(connectionState)}
              </Text>
            </View>
            
            {connectedDevice && (
              <View style={styles.connectedDeviceInfo}>
                <Text style={styles.connectedDeviceText}>
                  Connected to: {connectedDevice.name}
                </Text>
                <Text style={styles.connectedDeviceId}>
                  ID: {connectedDevice.uniqueId}
                </Text>
              </View>
            )}
            
            {bleError && (
              <View style={styles.bleErrorContainer}>
                <Text style={styles.bleErrorText}>Error: {bleError}</Text>
              </View>
            )}
          </View>

          <View style={styles.bleControlsContainer}>
            {connectionState === GentlyConnectionState.CONNECTED ? (
              <View style={styles.connectedButtonsContainer}>
                <View style={styles.connectedButtonsRow}>
                  <Pressable
                    style={[styles.bleButton, styles.syncButton]}
                    onPress={handleSyncDevice}
                  >
                    <Text style={styles.bleButtonText}>🔄 Sync Device</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.bleButton, styles.disconnectButton]}
                    onPress={handleBLEDisconnect}
                  >
                    <Text style={styles.bleButtonText}>❌ Disconnect</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={[styles.bleButton, styles.deleteButton]}
                  onPress={handleDeleteDevice}
                >
                  <Text style={styles.bleButtonText}>🗑️ Delete Device</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <Pressable
                  style={[
                    styles.bleButton, 
                    styles.connectButton,
                    (connectionState === GentlyConnectionState.CONNECTING || 
                     connectionState === GentlyConnectionState.AUTHENTICATING) && styles.bleButtonDisabled
                  ]}
                  onPress={handleBLEConnect}
                  disabled={connectionState === GentlyConnectionState.CONNECTING || 
                           connectionState === GentlyConnectionState.AUTHENTICATING}
                >
                  <Text style={styles.bleButtonText}>
                    {connectionState === GentlyConnectionState.CONNECTING || 
                     connectionState === GentlyConnectionState.AUTHENTICATING 
                      ? "⏳ Connecting..." 
                      : "📶 Connect to Device"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.bleButton, styles.deleteButton]}
                  onPress={handleDeleteDevice}
                >
                  <Text style={styles.bleButtonText}>🗑️ Delete Device</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Alarms Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Alarms ({device.alarms.length})</Text>
            <Pressable
              style={styles.addAlarmButton}
              onPress={() => Alert.alert("Coming Soon", "Alarm creation will be available soon!")}
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
  // BLE Connection Styles
  bleStatusContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  bleStatusInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  bleStatusLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1f2937",
    marginRight: 8,
  },
  bleStatusValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  connectedDeviceInfo: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  connectedDeviceText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1f2937",
    marginBottom: 4,
  },
  connectedDeviceId: {
    fontSize: 12,
    color: "#6b7280",
  },
  bleErrorContainer: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  bleErrorText: {
    fontSize: 14,
    color: "#dc2626",
  },
  bleControlsContainer: {
    gap: 12,
    marginTop: 16,
  },
  connectedButtonsContainer: {
    gap: 12,
  },
  connectedButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  bleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  connectButton: {
    backgroundColor: "#10b981",
  },
  disconnectButton: {
    backgroundColor: "#ef4444",
  },
  syncButton: {
    backgroundColor: "#3b82f6",
  },
  deleteButton: {
    backgroundColor: "#dc2626",
  },
  bleButtonDisabled: {
    opacity: 0.6,
  },
  bleButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
