/**
 * Calendar Events Screen
 * Browse and select calendar events to create alarms from
 * Supports recurring events - shows schedule and allows selecting all instances
 */

import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
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

// Group of recurring events
interface RecurringEventGroup {
  recurringEventId: string;
  title: string;
  instances: GoogleCalendarEvent[];
  schedule: string; // Human-readable schedule
  location?: string;
}

// Parse RRULE to human-readable schedule
function parseRecurrenceRule(rrule: string): string {
  if (!rrule) return "";
  
  const rule = rrule.replace("RRULE:", "");
  const parts: Record<string, string> = {};
  
  rule.split(";").forEach((part) => {
    const [key, value] = part.split("=");
    if (key && value) parts[key] = value;
  });
  
  const freq = parts.FREQ;
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL) : 1;
  const byDay = parts.BYDAY;
  const count = parts.COUNT;
  const until = parts.UNTIL;
  
  const dayMap: Record<string, string> = {
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
    SU: "Sunday",
  };
  
  const shortDayMap: Record<string, string> = {
    MO: "Mon",
    TU: "Tue",
    WE: "Wed",
    TH: "Thu",
    FR: "Fri",
    SA: "Sat",
    SU: "Sun",
  };
  
  let result = "";
  
  switch (freq) {
    case "DAILY":
      result = interval === 1 ? "Every day" : `Every ${interval} days`;
      break;
    case "WEEKLY":
      if (byDay) {
        const days = byDay.split(",").map((d) => shortDayMap[d] || d);
        if (days.length === 5 && !days.includes("Sat") && !days.includes("Sun")) {
          result = interval === 1 ? "Weekdays" : `Every ${interval} weeks on weekdays`;
        } else if (days.length === 2 && days.includes("Sat") && days.includes("Sun")) {
          result = interval === 1 ? "Weekends" : `Every ${interval} weeks on weekends`;
        } else if (days.length === 1) {
          result = interval === 1 
            ? `Every ${dayMap[byDay] || byDay}` 
            : `Every ${interval} weeks on ${dayMap[byDay] || byDay}`;
        } else {
          result = interval === 1 
            ? `Every ${days.join(", ")}` 
            : `Every ${interval} weeks on ${days.join(", ")}`;
        }
      } else {
        result = interval === 1 ? "Weekly" : `Every ${interval} weeks`;
      }
      break;
    case "MONTHLY":
      result = interval === 1 ? "Monthly" : `Every ${interval} months`;
      break;
    case "YEARLY":
      result = interval === 1 ? "Yearly" : `Every ${interval} years`;
      break;
    default:
      result = "Recurring";
  }
  
  if (count) {
    result += ` (${count} times)`;
  } else if (until) {
    const untilDate = new Date(until.slice(0, 4) + "-" + until.slice(4, 6) + "-" + until.slice(6, 8));
    result += ` until ${untilDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  
  return result;
}

const REMINDER_OPTIONS = [
  { label: "At start", value: 0 },
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
];

export default function SelectEventsPage() {
  const params = useLocalSearchParams();
  const connectionId = params.connectionId as string;
  const deviceId = params.deviceId as string;
  const [selectedEvents, setSelectedEvents] = useState<Map<string, SelectedEvent>>(
    new Map(),
  );
  const [isCreatingAlarms, setIsCreatingAlarms] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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
    error,
  } = useQuery({
    queryKey: ["calendarEvents", connectionId],
    queryFn: async () => {
      if (!connection) return [];

      try {
        let accessToken = connection.accessToken;
        
        // Check if token needs refresh
        if (new Date(connection.tokenExpiresAt) <= new Date()) {
          const newToken = await refreshAccessToken(connection.refreshToken);
          accessToken = newToken.accessToken;

          await trpc.calendar.updateTokens.mutate({
            id: connectionId,
            accessToken: newToken.accessToken,
            tokenExpiresAt: new Date(Date.now() + newToken.expiresIn * 1000),
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

  // Group events by recurring event ID and separate one-time events
  const { recurringGroups, oneTimeEvents } = useMemo(() => {
    if (!events) return { recurringGroups: [], oneTimeEvents: [] };

    const groups = new Map<string, RecurringEventGroup>();
    const oneTime: GoogleCalendarEvent[] = [];

    events.forEach((event) => {
      if (event.recurringEventId) {
        // This is an instance of a recurring event
        const existing = groups.get(event.recurringEventId);
        if (existing) {
          existing.instances.push(event);
        } else {
          groups.set(event.recurringEventId, {
            recurringEventId: event.recurringEventId,
            title: event.summary || "Untitled Event",
            instances: [event],
            schedule: "", // Will be populated if we have the parent
            location: event.location,
          });
        }
      } else if (event.recurrence && event.recurrence.length > 0) {
        // This IS a recurring event (parent) - but with singleEvents=true, we get instances
        // The recurrence rule tells us the schedule
        const existing = groups.get(event.id);
        if (existing) {
          existing.schedule = parseRecurrenceRule(event.recurrence[0] || "");
          existing.instances.unshift(event);
        } else {
          groups.set(event.id, {
            recurringEventId: event.id,
            title: event.summary || "Untitled Event",
            instances: [event],
            schedule: parseRecurrenceRule(event.recurrence[0] || ""),
            location: event.location,
          });
        }
      } else {
        // One-time event
        oneTime.push(event);
      }
    });

    // Sort instances by date within each group
    groups.forEach((group) => {
      group.instances.sort((a, b) => {
        const dateA = new Date(a.start.dateTime || a.start.date || "");
        const dateB = new Date(b.start.dateTime || b.start.date || "");
        return dateA.getTime() - dateB.getTime();
      });
    });

    return {
      recurringGroups: Array.from(groups.values()).filter((g) => g.instances.length > 1),
      oneTimeEvents: oneTime,
    };
  }, [events]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const toggleEvent = (event: GoogleCalendarEvent) => {
    setSelectedEvents((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(event.id)) {
        newMap.delete(event.id);
      } else {
        newMap.set(event.id, { ...event, alarmMinutesBefore: 15 });
      }
      return newMap;
    });
  };

  const toggleAllInGroup = (group: RecurringEventGroup, minutes: number = 15) => {
    setSelectedEvents((prev) => {
      const newMap = new Map(prev);
      const allSelected = group.instances.every((e) => newMap.has(e.id));
      
      if (allSelected) {
        // Deselect all
        group.instances.forEach((e) => newMap.delete(e.id));
      } else {
        // Select all with the same reminder time
        group.instances.forEach((e) => {
          newMap.set(e.id, { ...e, alarmMinutesBefore: minutes });
        });
      }
      return newMap;
    });
  };

  const updateGroupAlarmTime = (group: RecurringEventGroup, minutes: number) => {
    setSelectedEvents((prev) => {
      const newMap = new Map(prev);
      group.instances.forEach((e) => {
        if (newMap.has(e.id)) {
          newMap.set(e.id, { ...newMap.get(e.id)!, alarmMinutesBefore: minutes });
        }
      });
      return newMap;
    });
  };

  const getGroupSelectionState = (group: RecurringEventGroup) => {
    const selectedCount = group.instances.filter((e) => selectedEvents.has(e.id)).length;
    if (selectedCount === 0) return "none";
    if (selectedCount === group.instances.length) return "all";
    return "partial";
  };

  const getGroupAlarmTime = (group: RecurringEventGroup) => {
    const selectedInstance = group.instances.find((e) => selectedEvents.has(e.id));
    return selectedInstance ? selectedEvents.get(selectedInstance.id)!.alarmMinutesBefore : 15;
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
      const eventsArray = Array.from(selectedEvents.values()).map((event) => ({
        eventId: event.id,
        eventSummary: event.summary || "Untitled Event",
        eventStartTime: new Date(event.start.dateTime || event.start.date || ""),
        eventEndTime: event.end.dateTime || event.end.date
          ? new Date(event.end.dateTime || event.end.date || "")
          : undefined,
        eventLocation: event.location,
        alarmMinutesBefore: event.alarmMinutesBefore,
      }));

      const result = await trpc.calendar.createAlarmsFromEvents.mutate({
        connectionId,
        events: eventsArray,
        deviceId,
      });

      Alert.alert(
        "Alarms Created",
        `Successfully created ${result.created} alarm${result.created !== 1 ? "s" : ""} from your calendar events. They will sync to your device automatically when connected.`,
        [{ text: "Done", onPress: () => router.back() }],
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create alarms";
      Alert.alert("Error", errorMessage);
    } finally {
      setIsCreatingAlarms(false);
    }
  };

  const formatEventDate = (event: GoogleCalendarEvent) => {
    const start = event.start.dateTime || event.start.date;
    if (!start) return "";

    const date = new Date(start);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = date.toDateString() === today.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    if (isToday) return "Today";
    if (isTomorrow) return "Tomorrow";

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatEventTime = (event: GoogleCalendarEvent) => {
    if (event.start.date && !event.start.dateTime) {
      return "All day";
    }

    const start = event.start.dateTime;
    if (!start) return "";

    return new Date(start).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const renderEvent = ({ item }: { item: GoogleCalendarEvent }) => {
    const isSelected = selectedEvents.has(item.id);
    const selectedEvent = selectedEvents.get(item.id);

    return (
      <Pressable
        style={[
          cards.base,
          {
            marginBottom: spacing[3],
            borderWidth: 2,
            borderColor: isSelected ? colors.primary[500] : "transparent",
          },
        ]}
        onPress={() => toggleEvent(item)}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          {/* Checkbox */}
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: isSelected ? colors.primary[500] : colors.gray[300],
              backgroundColor: isSelected ? colors.primary[500] : "transparent",
              alignItems: "center",
              justifyContent: "center",
              marginRight: spacing[3],
              marginTop: 2,
            }}
          >
            {isSelected && (
              <Ionicons name="checkmark" size={14} color={colors.text.inverse} />
            )}
          </View>

          {/* Event Details */}
          <View style={{ flex: 1 }}>
            <Text
              style={[typography.h6, { marginBottom: spacing[1] }]}
              numberOfLines={2}
            >
              {item.summary || "Untitled Event"}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: spacing[2],
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={colors.text.secondary}
                  style={{ marginRight: 4 }}
                />
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  {formatEventDate(item)}
                </Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={colors.text.secondary}
                  style={{ marginRight: 4 }}
                />
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  {formatEventTime(item)}
                </Text>
              </View>
            </View>

            {item.location && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: spacing[1],
                }}
              >
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={colors.text.secondary}
                  style={{ marginRight: 4 }}
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
        </View>

        {/* Reminder Options - shown when selected */}
        {isSelected && selectedEvent && (
          <View
            style={{
              marginTop: spacing[3],
              paddingTop: spacing[3],
              borderTopWidth: 1,
              borderTopColor: colors.gray[100],
            }}
          >
            <Text
              style={[
                typography.caption,
                { color: colors.text.secondary, marginBottom: spacing[2] },
              ]}
            >
              Remind me before:
            </Text>
            <View style={{ flexDirection: "row", gap: spacing[2] }}>
              {REMINDER_OPTIONS.map((option) => {
                const isActive = selectedEvent.alarmMinutesBefore === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={{
                      flex: 1,
                      paddingVertical: spacing[2],
                      paddingHorizontal: spacing[2],
                      borderRadius: 8,
                      backgroundColor: isActive
                        ? colors.primary[500]
                        : colors.gray[100],
                      alignItems: "center",
                    }}
                    onPress={() => updateAlarmTime(item.id, option.value)}
                  >
                    <Text
                      style={[
                        typography.caption,
                        {
                          fontWeight: "600",
                          color: isActive
                            ? colors.text.inverse
                            : colors.text.secondary,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  const renderRecurringGroup = (group: RecurringEventGroup) => {
    const selectionState = getGroupSelectionState(group);
    const isExpanded = expandedGroups.has(group.recurringEventId);
    const selectedCount = group.instances.filter((e) => selectedEvents.has(e.id)).length;
    const currentAlarmTime = getGroupAlarmTime(group);

    return (
      <View key={group.recurringEventId} style={{ marginBottom: spacing[3] }}>
        {/* Recurring Event Header Card */}
        <Pressable
          style={[
            cards.base,
            {
              borderWidth: 2,
              borderColor: selectionState !== "none" ? colors.primary[500] : "transparent",
              marginBottom: isExpanded ? spacing[2] : 0,
            },
          ]}
          onPress={() => toggleAllInGroup(group, currentAlarmTime)}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            {/* Checkbox with partial state */}
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: selectionState !== "none" ? colors.primary[500] : colors.gray[300],
                backgroundColor: selectionState === "all" 
                  ? colors.primary[500] 
                  : selectionState === "partial"
                    ? colors.primary[100]
                    : "transparent",
                alignItems: "center",
                justifyContent: "center",
                marginRight: spacing[3],
                marginTop: 2,
              }}
            >
              {selectionState === "all" && (
                <Ionicons name="checkmark" size={14} color={colors.text.inverse} />
              )}
              {selectionState === "partial" && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.primary[500],
                  }}
                />
              )}
            </View>

            {/* Event Details */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing[1] }}>
                <Ionicons
                  name="repeat"
                  size={16}
                  color={colors.primary[500]}
                  style={{ marginRight: spacing[2] }}
                />
                <Text style={[typography.h6, { flex: 1 }]} numberOfLines={2}>
                  {group.title}
                </Text>
              </View>

              {/* Schedule badge */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: spacing[2],
                }}
              >
                <View
                  style={{
                    backgroundColor: colors.primary[50],
                    paddingHorizontal: spacing[2],
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}
                >
                  <Text style={[typography.caption, { color: colors.primary[700], fontWeight: "600" }]}>
                    {group.schedule || "Recurring"}
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  {group.instances.length} instances in next 30 days
                </Text>
              </View>

              {/* First occurrence */}
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing[1] }}>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  Next: {formatEventDate(group.instances[0]!)} at {formatEventTime(group.instances[0]!)}
                </Text>
              </View>

              {group.location && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: spacing[1],
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={colors.text.secondary}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[typography.caption, { color: colors.text.secondary }]}
                    numberOfLines={1}
                  >
                    {group.location}
                  </Text>
                </View>
              )}
            </View>

            {/* Expand/Collapse button */}
            <Pressable
              style={{
                padding: spacing[2],
                marginLeft: spacing[2],
              }}
              onPress={(e) => {
                e.stopPropagation();
                toggleGroup(group.recurringEventId);
              }}
            >
              <Ionicons
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.gray[500]}
              />
            </Pressable>
          </View>

          {/* Selection info and reminder options when any selected */}
          {selectionState !== "none" && (
            <View
              style={{
                marginTop: spacing[3],
                paddingTop: spacing[3],
                borderTopWidth: 1,
                borderTopColor: colors.gray[100],
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing[2] }}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={colors.primary[500]}
                  style={{ marginRight: spacing[2] }}
                />
                <Text style={[typography.caption, { color: colors.primary[700] }]}>
                  {selectedCount} of {group.instances.length} selected
                </Text>
              </View>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginBottom: spacing[2] },
                ]}
              >
                Remind me before each:
              </Text>
              <View style={{ flexDirection: "row", gap: spacing[2] }}>
                {REMINDER_OPTIONS.map((option) => {
                  const isActive = currentAlarmTime === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={{
                        flex: 1,
                        paddingVertical: spacing[2],
                        paddingHorizontal: spacing[2],
                        borderRadius: 8,
                        backgroundColor: isActive
                          ? colors.primary[500]
                          : colors.gray[100],
                        alignItems: "center",
                      }}
                      onPress={() => updateGroupAlarmTime(group, option.value)}
                    >
                      <Text
                        style={[
                          typography.caption,
                          {
                            fontWeight: "600",
                            color: isActive
                              ? colors.text.inverse
                              : colors.text.secondary,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </Pressable>

        {/* Expanded individual instances */}
        {isExpanded && (
          <View
            style={{
              marginLeft: spacing[4],
              paddingLeft: spacing[3],
              borderLeftWidth: 2,
              borderLeftColor: colors.gray[200],
            }}
          >
            {group.instances.map((instance) => {
              const isSelected = selectedEvents.has(instance.id);
              return (
                <Pressable
                  key={instance.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: spacing[2],
                    paddingHorizontal: spacing[3],
                    backgroundColor: isSelected ? colors.primary[50] : colors.gray[50],
                    borderRadius: 8,
                    marginBottom: spacing[2],
                  }}
                  onPress={() => toggleEvent(instance)}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.primary[500] : colors.gray[300],
                      backgroundColor: isSelected ? colors.primary[500] : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: spacing[3],
                    }}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={12} color={colors.text.inverse} />
                    )}
                  </View>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing[2] }}>
                    <Text style={[typography.body, { fontWeight: "500" }]}>
                      {formatEventDate(instance)}
                    </Text>
                    <Text style={[typography.caption, { color: colors.text.secondary }]}>
                      {formatEventTime(instance)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // Loading state
  if (isLoadingConnection || isLoadingEvents) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="Calendar Events" showBackButton />
        <View style={[containers.contentCentered, { alignItems: "center" }]}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text
            style={[
              typography.body,
              { marginTop: spacing[3], color: colors.text.secondary },
            ]}
          >
            Loading your events...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error || !connection) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="Calendar Events" showBackButton />
        <View style={containers.contentCentered}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.error[50],
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing[4],
            }}
          >
            <Ionicons name="alert-circle" size={32} color={colors.error[500]} />
          </View>
          <Text
            style={[
              typography.h5,
              { textAlign: "center", marginBottom: spacing[2] },
            ]}
          >
            Unable to Load Events
          </Text>
          <Text
            style={[
              typography.body,
              {
                textAlign: "center",
                color: colors.text.secondary,
                marginBottom: spacing[4],
              },
            ]}
          >
            {error instanceof Error
              ? error.message
              : "Please check your connection and try again."}
          </Text>
          <Pressable
            style={[buttons.base, buttons.primary]}
            onPress={() => void refetch()}
          >
            <Ionicons
              name="refresh"
              size={18}
              color={colors.text.inverse}
              style={{ marginRight: spacing[2] }}
            />
            <Text style={buttonText.primary}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header title="Calendar Events" showBackButton />

      <FlatList
        data={[
          // Recurring groups as a special "section header" type
          ...recurringGroups.map((g) => ({ type: "recurring" as const, data: g })),
          // One-time events
          ...oneTimeEvents.map((e) => ({ type: "event" as const, data: e })),
        ]}
        renderItem={({ item }) => {
          if (item.type === "recurring") {
            return renderRecurringGroup(item.data as RecurringEventGroup);
          }
          return renderEvent({ item: item.data as GoogleCalendarEvent });
        }}
        keyExtractor={(item) => 
          item.type === "recurring" 
            ? `recurring-${(item.data as RecurringEventGroup).recurringEventId}` 
            : (item.data as GoogleCalendarEvent).id
        }
        style={containers.content}
        contentContainerStyle={{
          paddingVertical: spacing[4],
          flexGrow: 1,
        }}
        ListHeaderComponent={
          (events && events.length > 0) || recurringGroups.length > 0 ? (
            <View style={{ marginBottom: spacing[4] }}>
              <Text style={[typography.body, { color: colors.text.secondary }]}>
                Select events to create reminders. Recurring events can be selected all at once.
              </Text>
              {recurringGroups.length > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: spacing[2],
                    padding: spacing[2],
                    backgroundColor: colors.gray[50],
                    borderRadius: 8,
                  }}
                >
                  <Ionicons
                    name="repeat"
                    size={16}
                    color={colors.primary[500]}
                    style={{ marginRight: spacing[2] }}
                  />
                  <Text style={[typography.caption, { color: colors.text.secondary }]}>
                    {recurringGroups.length} recurring event{recurringGroups.length !== 1 ? "s" : ""} • {oneTimeEvents.length} one-time event{oneTimeEvents.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              )}
              {selectedEvents.size > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: spacing[2],
                    padding: spacing[3],
                    backgroundColor: colors.primary[50],
                    borderRadius: 8,
                  }}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.primary[500]}
                    style={{ marginRight: spacing[2] }}
                  />
                  <Text style={[typography.body, { color: colors.primary[700] }]}>
                    {selectedEvents.size} event{selectedEvents.size !== 1 ? "s" : ""} selected
                  </Text>
                </View>
              )}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: spacing[8],
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.gray[100],
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing[4],
              }}
            >
              <Ionicons
                name="calendar-outline"
                size={40}
                color={colors.gray[400]}
              />
            </View>
            <Text
              style={[
                typography.h5,
                { textAlign: "center", marginBottom: spacing[2] },
              ]}
            >
              No Upcoming Events
            </Text>
            <Text
              style={[
                typography.body,
                {
                  textAlign: "center",
                  color: colors.text.secondary,
                  paddingHorizontal: spacing[4],
                },
              ]}
            >
              You don't have any events scheduled in the next 30 days.
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

      {/* Bottom Action Bar */}
      {selectedEvents.size > 0 && (
        <View
          style={{
            padding: spacing[4],
            paddingBottom: spacing[6],
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
                  name="notifications"
                  size={20}
                  color={colors.text.inverse}
                  style={{ marginRight: spacing[2] }}
                />
                <Text style={buttonText.primary}>
                  Create {selectedEvents.size} Reminder{selectedEvents.size !== 1 ? "s" : ""}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
