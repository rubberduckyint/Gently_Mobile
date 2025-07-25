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
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { trpc } from "~/utils/api";

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
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    data: device,
    isLoading,
    error,
  } = useQuery({
    ...trpc.device.getById.queryOptions({ id: id! }),
    enabled: !!id,
  });

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

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <Pressable
            style={styles.syncButton}
            onPress={() => Alert.alert("Coming Soon", "Device sync will be available soon!")}
          >
            <Text style={styles.syncButtonText}>Sync Device</Text>
          </Pressable>
          <Pressable
            style={styles.deleteButton}
            onPress={() => {
              Alert.alert(
                "Delete Device",
                "Are you sure you want to delete this device? This action cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => Alert.alert("Coming Soon", "Device deletion will be available soon!")
                  }
                ]
              );
            }}
          >
            <Text style={styles.deleteButtonText}>Delete Device</Text>
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
  syncButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  deleteButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  deleteButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
