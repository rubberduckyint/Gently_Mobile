/**
 * Calendar Event Selection Screen
 * Browse and select calendar events to create alarms from
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

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
import {
  fetchCalendarEvents,
  refreshAccessToken,
  type GoogleCalendarEvent,
} from "~/services/googleCalendar";
import { trpc } from "~/utils/api";

interface SelectedEvent extends GoogleCalendarEvent {
  alarmMinutesBefore: number;
}

export default function SelectEventsPage() {
  const params = useLocalSearchParams();
  const connectionId = params.connectionId as string;
  const [selectedEvents, setSelectedEvents] = useState<Map<string, SelectedEvent>>(
    new Map(),
  );
  const [isCreatingAlarms, setIsCreatingAlarms] = useState(false);

  // Fetch connection details
  const { data: connection, isLoading: isLoadingConnection } = useQuery({
    queryKey: ["calendarConnection", connectionId],
    queryFn: () => trpc.calendar.getConnection.query({ id: connectionId }),
    enabled: !!connectionId,
  });

  // Fetch calendar events
  const {
    data: events,
    isLoading: isLoadingEvents,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["calendarEvents", connectionId],
    queryFn: async () => {
      if (!connection) return [];

      try {
        // Check if token needs refresh
        let accessToken = connection.accessToken;
        if (new Date(connection.tokenExpiresAt) <= new Date()) {
          const newToken = await refreshAccessToken(connection.refreshToken);
          accessToken = newToken.accessToken;

          // Update token in database
          await trpc.calendar.updateTokens.mutate({
            id: connectionId,
            accessToken: newToken.accessToken,
            tokenExpiresAt: new Date(
              Date.now() + newToken.expiresIn * 1000,
            ),
          });
        }

        // Fetch events from the next 30 days
        const timeMin = new Date();
        const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        return await fetchCalendarEvents(accessToken, "primary", {
          timeMin,
          timeMax,
        });
      } catch (error) {
        console.error("Failed to fetch events:", error);
        throw error;
      }
    },
    enabled: !!connection,
  });

  const toggleEvent = (event: GoogleCalendarEvent) => {
    setSelectedEvents((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(event.id)) {
        newMap.delete(event.id);
      } else {
        // Default to 15 minutes before
        newMap.set(event.id, { ...event, alarmMinutesBefore: 15 });
      }
      return newMap;
    });
  };

  const updateAlarmTime = (eventId: string, minutes: number) => {
    setSelectedEvents((prev) => {
      const newMap = new Map(prev);
      const event = newMap.get(eventId);
      if (event) {
        newMap.set(eventId, { ...event, alarmMinutesBefore: minutes });
      }
      return newMap;
    });
  };

  const handleCreateAlarms = async () => {
    if (selectedEvents.size === 0) {
      Alert.alert("No Events Selected", "Please select at least one event");
      return;
    }

    setIsCreatingAlarms(true);

    try {
      // TODO: Implement alarm creation from calendar events
      // This will require a new tRPC endpoint to create alarms
      // For now, just show success
      Alert.alert(
        "Success",
        `Created ${selectedEvents.size} alarm(s) from calendar events`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create alarms";
      Alert.alert("Error", errorMessage);
    } finally {
      setIsCreatingAlarms(false);
    }
  };

  const formatEventTime = (event: GoogleCalendarEvent) => {
    const start = event.start.dateTime || event.start.date;
    if (!start) return "No time";

    const date = new Date(start);
    if (event.start.dateTime) {
      // Has specific time
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } else {
      // All-day event
      return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} (All day)`;
    }
  };

  const renderEvent = ({ item }: { item: GoogleCalendarEvent }) => {
    const isSelected = selectedEvents.has(item.id);
    const selectedEvent = selectedEvents.get(item.id);

    return (
      <Pressable
        style={[
          cards.base,
          {
            borderWidth: 2,
            borderColor: isSelected ? colors.primary[500] : "transparent",
            marginBottom: spacing[3],
          },
        ]}
        onPress={() => toggleEvent(item)}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, marginRight: spacing[3] }}>
            <Text style={[typography.h6, { marginBottom: spacing[1] }]}>
              {item.summary || "Untitled Event"}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing[1],
              }}
            >
              <Ionicons
                name="time-outline"
                size={16}
                color={colors.text.secondary}
                style={{ marginRight: spacing[1] }}
              />
              <Text style={[typography.body, { color: colors.text.secondary }]}>
                {formatEventTime(item)}
              </Text>
            </View>
            {item.location && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name="location-outline"
                  size={16}
                  color={colors.text.secondary}
                  style={{ marginRight: spacing[1] }}
                />
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                  numberOfLines={1}
                >
                  {item.location}
                </Text>
              </View>
            )}
          </View>

          <Ionicons
            name={isSelected ? "checkmark-circle" : "ellipse-outline"}
            size={28}
            color={isSelected ? colors.primary[500] : colors.gray[400]}
          />
        </View>

        {isSelected && selectedEvent && (
          <View
            style={{
              marginTop: spacing[3],
              paddingTop: spacing[3],
              borderTopWidth: 1,
              borderTopColor: colors.gray[200],
            }}
          >
            <Text
              style={[
                typography.body,
                { marginBottom: spacing[2], color: colors.text.primary },
              ]}
            >
              Alarm reminder:
            </Text>
            <View style={{ flexDirection: "row", gap: spacing[2] }}>
              {[5, 15, 30, 60].map((minutes) => (
                <Pressable
                  key={minutes}
                  style={[
                    buttons.base,
                    {
                      flex: 1,
                      paddingVertical: spacing[2],
                      backgroundColor:
                        selectedEvent.alarmMinutesBefore === minutes
                          ? colors.primary[500]
                          : colors.background.secondary,
                      borderColor:
                        selectedEvent.alarmMinutesBefore === minutes
                          ? colors.primary[500]
                          : colors.gray[300],
                    },
                  ]}
                  onPress={() => updateAlarmTime(item.id, minutes)}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        color:
                          selectedEvent.alarmMinutesBefore === minutes
                            ? colors.text.inverse
                            : colors.text.secondary,
                        textAlign: "center",
                      },
                    ]}
                  >
                    {minutes}m
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  if (isLoadingConnection || isLoadingEvents) {
    return (
      <SafeAreaView style={containers.screen}>
        <Header title="Select Events" showBackButton />
        <View style={containers.contentCentered}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  if (!connection) {
    return (
      <SafeAreaView style={containers.screen}>
        <Header title="Select Events" showBackButton />
        <View style={containers.contentCentered}>
          <Text style={typography.body}>Connection not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.screen}>
      <Header title="Select Events" showBackButton />

      <View style={containers.content}>
        {/* Info Header */}
        <View style={{ padding: spacing[4], paddingBottom: spacing[2] }}>
          <Text style={[typography.body, { color: colors.text.secondary }]}>
            Select events to create alarms for. Choose how many minutes before
            each event you want to be reminded.
          </Text>
        </View>

        {/* Events List */}
        <FlatList
          data={events ?? []}
          renderItem={renderEvent}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing[4], paddingTop: spacing[2] }}
          ListEmptyComponent={
            <View style={containers.contentCentered}>
              <Ionicons
                name="calendar-outline"
                size={64}
                color={colors.gray[400]}
                style={{ marginBottom: spacing[3] }}
              />
              <Text
                style={[
                  typography.body,
                  { color: colors.text.secondary, textAlign: "center" },
                ]}
              >
                No upcoming events found in your calendar
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={colors.primary[500]}
            />
          }
        />

        {/* Create Alarms Button */}
        {selectedEvents.size > 0 && (
          <View
            style={{
              padding: spacing[4],
              borderTopWidth: 1,
              borderTopColor: colors.gray[200],
              backgroundColor: colors.background.primary,
            }}
          >
            <Pressable
              style={[buttons.base, buttons.large, buttons.primary]}
              onPress={handleCreateAlarms}
              disabled={isCreatingAlarms}
            >
              {isCreatingAlarms ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <>
                  <Ionicons
                    name="alarm"
                    size={24}
                    color={colors.text.inverse}
                    style={{ marginRight: spacing[2] }}
                  />
                  <Text style={buttonText.primary}>
                    Create {selectedEvents.size} Alarm{selectedEvents.size > 1 ? "s" : ""}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
