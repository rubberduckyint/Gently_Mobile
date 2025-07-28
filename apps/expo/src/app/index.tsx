import React, { useEffect, useState } from "react";
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
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

type DeviceWithAlarmsCount = RouterOutputs["device"]["getAll"][number];

function DeviceCard({ device }: { device: DeviceWithAlarmsCount }) {
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

  return (
    <Link
      href={{
        pathname: "/devices/[id]",
        params: { id: device.id },
      }}
      asChild
    >
      <Pressable style={styles.deviceCard}>
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
  );
}

function LoginPrompt() {
  return (
    <View style={styles.loginPrompt}>
      <Text style={styles.loginTitle}>Welcome to Gently</Text>
      <Text style={styles.loginDescription}>
        Please sign in to manage your devices and alarms
      </Text>
      <Link href="/login" asChild>
        <Pressable style={styles.loginButton}>
          <Text style={styles.loginButtonText}>Sign In</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No Devices Yet</Text>
      <Text style={styles.emptyDescription}>
        Add your first device to get started with gentle alarms
      </Text>
      <Pressable
        style={styles.addButton}
        onPress={() => Alert.alert("Coming Soon", "Device creation will be available soon!")}
      >
        <Text style={styles.addButtonText}>+ Add Device</Text>
      </Pressable>
    </View>
  );
}

export default function DashboardPage() {
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const sessionData = await authClient.getSession();
        setSession(sessionData);
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Fetch devices if authenticated
  const {
    data: devices,
    isLoading: devicesLoading,
    error,
  } = useQuery({
    queryKey: ["device", "getAll"],
    queryFn: async () => {
      return await trpc.device.getAll.query({});
    },
    enabled: !!session?.user,
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session?.user) {
    return (
      <SafeAreaView style={styles.container}>
        <LoginPrompt />
      </SafeAreaView>
    );
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
      </View>

      {devicesLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading devices...</Text>
        </View>
      ) : devices && devices.length > 0 ? (
        <FlatList
          data={devices}
          renderItem={({ item }) => <DeviceCard device={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.devicesList}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <EmptyState />
      )}

      <Pressable
        style={styles.logoutButton}
        onPress={async () => {
          try {
            await authClient.signOut();
            setSession(null);
            router.replace("/login");
          } catch (error) {
            Alert.alert("Error", "Failed to sign out");
          }
        }}
      >
        <Text style={styles.logoutButtonText}>Sign Out</Text>
      </Pressable>
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
  },
  devicesList: {
    paddingBottom: 20,
  },
  deviceCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
  loginPrompt: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
    textAlign: "center",
  },
  loginDescription: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  loginButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
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
});
