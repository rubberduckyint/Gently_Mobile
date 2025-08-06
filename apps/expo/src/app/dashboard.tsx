import React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { AddDeviceModal } from "~/components/AddDeviceModal";
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
    if (level > 50) return "#10b981"; // green
    if (level > 20) return "#f59e0b"; // amber
    return "#ef4444"; // red
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
    <View style={styles.deviceCardContainer}>
      <Link
        href={{
          pathname: "/devices/[id]",
          params: { id: device.id },
        }}
        asChild
      >
        <Pressable style={styles.deviceCard} onLongPress={handleLongPress}>
          <View style={styles.deviceHeader}>
            <View style={styles.deviceAvatar}>
              <Text style={styles.deviceInitials}>
                {device.title.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceTitle}>{device.title}</Text>
              <Text style={styles.deviceDescription}>{device.description}</Text>
            </View>
          </View>
          <View style={styles.deviceStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Alarms</Text>
              <Text style={styles.statValue}>{device._count.alarms}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Battery</Text>
              <Text
                style={[
                  styles.statValue,
                  { color: getBatteryColor(device.batteryLevel) },
                ]}
              >
                {device.batteryLevel}%
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Status</Text>
              <Text style={styles.syncStatus}>
                {getSyncStatusText(device.syncStatus)}
              </Text>
            </View>
          </View>
        </Pressable>
      </Link>
      {showDeleteButton && (
        <Pressable style={styles.deleteButton} onPress={handleDeletePress}>
          <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
        </Pressable>
      )}
    </View>
  );
}

function EmptyState({ onDeviceAdded }: { onDeviceAdded: () => void }) {
  const [showAddModal, setShowAddModal] = React.useState(false);

  const handleDeviceAdded = () => {
    setShowAddModal(false);
    onDeviceAdded();
  };

  return (
    <>
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No Devices Yet</Text>
        <Text style={styles.emptyDescription}>
          Add your first device to get started with gentle alarms
        </Text>
        <Pressable
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Text style={styles.addButtonText}>+ Add Device</Text>
        </Pressable>
      </View>

      <AddDeviceModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onDeviceAdded={handleDeviceAdded}
      />
    </>
  );
}

export default function DashboardPage() {
  const { data: session, isPending } = authClient.useSession();
  const [showAddModal, setShowAddModal] = React.useState(false);
  const queryClient = useQueryClient();

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace("/");
    }
  }, [session, isPending]);

  // Fetch devices if authenticated
  const {
    data: devices,
    isLoading: devicesLoading,
    error,
    refetch: refetchDevices,
  } = useQuery({
    queryKey: ["device", "getAll"],
    queryFn: async () => {
      return await trpc.device.getAll.query({});
    },
    enabled: !!session?.user,
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      return await trpc.device.delete.mutate({ id: deviceId });
    },
    onSuccess: () => {
      // Invalidate queries to refresh the devices list
      void queryClient.invalidateQueries({ queryKey: ["device", "getAll"] });
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to delete device: ${error.message}`);
    },
  });

  const handleDeviceAdded = () => {
    setShowAddModal(false);
    void refetchDevices();
  };

  const handleDeleteDevice = (deviceId: string) => {
    deleteDeviceMutation.mutate(deviceId);
  };

  // Show loading while checking authentication
  if (isPending) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!session?.user) {
    return null;
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load devices</Text>
          <Text style={styles.errorDescription}>
            {error.message || "Please try again later"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>
          Welcome back, {session.user.name || session.user.email}!
        </Text>
        <Text style={styles.headerDescription}>
          Manage your devices and gentle alarms
        </Text>
        {devices && devices.length > 0 && (
          <Pressable
            style={styles.headerAddButton}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.headerAddButtonText}>+ Add Device</Text>
          </Pressable>
        )}
      </View>

      {devicesLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading devices...</Text>
        </View>
      ) : devices && devices.length > 0 ? (
        <FlatList
          data={devices}
          renderItem={({ item }) => (
            <DeviceCard device={item} onDeleteDevice={handleDeleteDevice} />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.devicesList}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <EmptyState onDeviceAdded={handleDeviceAdded} />
      )}

      <Pressable
        style={styles.logoutButton}
        onPress={async () => {
          try {
            await authClient.signOut();
            router.replace("/");
          } catch {
            Alert.alert("Error", "Failed to sign out");
          }
        }}
      >
        <Text style={styles.logoutButtonText}>Sign Out</Text>
      </Pressable>

      <AddDeviceModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onDeviceAdded={handleDeviceAdded}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  headerDescription: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 16,
  },
  headerAddButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  headerAddButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  devicesList: {
    paddingBottom: 20,
  },
  deviceCardContainer: {
    marginBottom: 12,
  },
  deviceCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  deviceAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  deviceInitials: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  deviceInfo: {
    flex: 1,
  },
  deviceTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 2,
  },
  deviceDescription: {
    fontSize: 14,
    color: "#6b7280",
  },
  deviceStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  statItem: {
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
  },
  syncStatus: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  addButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
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
  },
  logoutButton: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 20,
    alignSelf: "center",
  },
  logoutButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
    alignItems: "center",
  },
  deleteButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
});
