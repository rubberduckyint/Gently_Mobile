/**
 * Calendar Connections Screen
 * Manage Google Calendar connections and sync events
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Header } from "~/components/ui/Header";
import {
  buttons,
  buttonText,
  cards,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";

export default function CalendarConnectionsPage() {
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch calendar connections
  const { data: connections, isLoading } = useQuery({
    queryKey: ["calendarConnections"],
    queryFn: () => trpc.calendar.getConnections.query(),
  });

  // Delete connection mutation
  const deleteConnectionMutation = useMutation({
    mutationFn: (id: string) => trpc.calendar.deleteConnection.mutate({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["calendarConnections"] });
      Alert.alert("Success", "Calendar connection removed");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message);
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      trpc.calendar.toggleActive.mutate({ id, isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["calendarConnections"] });
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message);
    },
  });

  const handleConnectGoogle = async () => {
    // Navigate to OAuth flow
    router.push("/calendar/connect-google");
  };

  const handleDeleteConnection = (id: string, email: string) => {
    Alert.alert(
      "Remove Connection",
      `Are you sure you want to remove the connection to ${email}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteConnectionMutation.mutate(id),
        },
      ],
    );
  };

  const handleToggleActive = (id: string, currentStatus: boolean) => {
    toggleActiveMutation.mutate({ id, isActive: !currentStatus });
  };

  const handleSelectEvents = (connectionId: string) => {
    router.push(`/calendar/select-events?connectionId=${connectionId}`);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={containers.screen}>
        <Header title="Calendar Connections" showBackButton />
        <View style={containers.contentCentered}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.screen}>
      <Header title="Calendar Connections" showBackButton />

      <ScrollView
        style={containers.content}
        contentContainerStyle={{ padding: spacing[4] }}
      >
        {/* Info Card */}
        <View style={[cards.base, { marginBottom: spacing[4] }]}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: spacing[2],
            }}
          >
            <Ionicons
              name="information-circle"
              size={24}
              color={colors.primary[500]}
              style={{ marginRight: spacing[2] }}
            />
            <Text style={typography.h5}>About Calendar Sync</Text>
          </View>
          <Text style={[typography.body, { color: colors.text.secondary }]}>
            Connect your Google Calendar to automatically create alarms for your
            events. You can select which events to sync and customize alarm
            settings.
          </Text>
        </View>

        {/* Connected Calendars */}
        {connections && connections.length > 0 && (
          <View style={{ marginBottom: spacing[4] }}>
            <Text
              style={[
                typography.h5,
                { marginBottom: spacing[3], color: colors.text.primary },
              ]}
            >
              Connected Calendars
            </Text>

            {connections.map((connection) => (
              <View key={connection.id} style={[cards.base, { marginBottom: spacing[3] }]}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: spacing[3],
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: spacing[1],
                      }}
                    >
                      <Ionicons
                        name="logo-google"
                        size={20}
                        color={colors.primary[500]}
                        style={{ marginRight: spacing[2] }}
                      />
                      <Text style={typography.h6}>{connection.accountEmail}</Text>
                    </View>
                    <Text
                      style={[typography.caption, { color: colors.text.secondary }]}
                    >
                      {connection.isActive ? "Active" : "Inactive"} •{" "}
                      {connection.lastSyncedAt
                        ? `Last synced ${new Date(connection.lastSyncedAt).toLocaleDateString()}`
                        : "Not synced yet"}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() =>
                      handleToggleActive(connection.id, connection.isActive)
                    }
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <Ionicons
                      name={connection.isActive ? "toggle" : "toggle-outline"}
                      size={32}
                      color={
                        connection.isActive
                          ? colors.primary[500]
                          : colors.gray[400]
                      }
                    />
                  </Pressable>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    gap: spacing[2],
                  }}
                >
                  <Pressable
                    style={[buttons.base, buttons.secondary, { flex: 1 }]}
                    onPress={() => handleSelectEvents(connection.id)}
                  >
                    <Ionicons
                      name="calendar"
                      size={18}
                      color={colors.primary[500]}
                      style={{ marginRight: spacing[2] }}
                    />
                    <Text style={buttonText.secondary}>Select Events</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      buttons.base,
                      {
                        backgroundColor: colors.error[50],
                        borderColor: colors.error[200],
                        paddingHorizontal: spacing[4],
                      },
                    ]}
                    onPress={() =>
                      handleDeleteConnection(connection.id, connection.accountEmail)
                    }
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error[500]} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Add Connection Button */}
        <Pressable
          style={[buttons.base, buttons.large, buttons.primary]}
          onPress={handleConnectGoogle}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <>
              <Ionicons
                name="add-circle"
                size={24}
                color={colors.text.inverse}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={buttonText.primary}>Connect Google Calendar</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
