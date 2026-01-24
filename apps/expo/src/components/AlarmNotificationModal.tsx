/**
 * AlarmNotificationModal Component
 *
 * Shows a full-screen modal when an alarm is actively triggering on the bracelet.
 * Allows user to acknowledge/stop the alarm by sending the acknowledge command to the device.
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  Vibration,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { useBLE } from "~/contexts/BLEContext";
import { buttons, buttonText, colors, spacing, typography } from "~/styles";
import { trpc } from "~/utils/api";

/**
 * Modal that automatically shows when an alarm is active
 * Uses BLE context to detect active alarms and acknowledge them
 */
export function AlarmNotificationModal() {
  const { activeAlarm, acknowledgeAlarm } = useBLE();
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Fetch all user alarms to find the one matching the event index
  // We use the serial number to match with the device's alarms
  const { data: allAlarms } = useQuery({
    queryKey: ["alarms", "getAll"],
    queryFn: async () => {
      return await trpc.alarm.getAll.query({});
    },
    enabled: !!activeAlarm,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Find the alarm that matches the active event index
  // Note: deviceIndex corresponds to eventIndex from BLE notification
  const alarmDetails = allAlarms?.find(
    (alarm: { deviceIndex?: number | null }) =>
      alarm.deviceIndex === activeAlarm?.eventIndex,
  ) as
    | {
        id?: string;
        title?: string;
      }
    | undefined;

  // Send email notification when alarm triggers (if enabled)
  useEffect(() => {
    const sendEmailNotification = async () => {
      if (activeAlarm?.eventState === 2 && alarmDetails) {
        const alarmId = (alarmDetails as { id?: string })?.id;
        if (!alarmId) return;

        try {
          // Check if this alarm has email notifications enabled and send
          const result = await trpc.notification.sendAlarmEmail.mutate({
            alarmId,
            deviceName: undefined, // Will use the device name from the alarm
          });

          if (result.success) {
            console.log("📧 Email notification sent for alarm trigger");
          } else {
            console.log("📧 Email notification skipped:", result.message);
          }
        } catch (error) {
          // Don't show error to user - email is a secondary notification
          console.warn("⚠️ Failed to send email notification:", error);
        }
      }
    };

    void sendEmailNotification();
  }, [activeAlarm, alarmDetails]);

  // Vibrate the phone when alarm modal appears
  useEffect(() => {
    if (activeAlarm?.eventState === 2) {
      // State 2 = ON & active in vibration
      // Vibrate in a pattern: 500ms on, 250ms off, repeated
      const pattern = [0, 500, 250, 500, 250, 500];
      Vibration.vibrate(pattern, true); // true = repeat

      return () => {
        Vibration.cancel();
      };
    }
  }, [activeAlarm]);

  // Reset dismissed state when a new alarm comes in
  useEffect(() => {
    if (activeAlarm) {
      setIsDismissed(false);
    }
  }, [activeAlarm]);

  if (!activeAlarm || isDismissed) return null;

  const handleAcknowledge = async () => {
    setIsAcknowledging(true);

    try {
      console.log(
        `🔕 Acknowledging alarm at index ${activeAlarm.eventIndex}...`,
      );

      // Send acknowledge command (equivalent to double-pressing the button)
      await acknowledgeAlarm(activeAlarm.eventIndex);

      console.log(`✅ Alarm acknowledged successfully`);
      Vibration.cancel(); // Stop phone vibration
      // Modal will auto-close when activeAlarm is set to null by BLE context
    } catch (error) {
      console.error("❌ Error acknowledging alarm:", error);
      Vibration.cancel();
      // Show error but modal will stay open
      Alert.alert(
        "Error",
        "Failed to stop alarm. Please try again or use the device button.",
      );
    } finally {
      setIsAcknowledging(false);
    }
  };

  const getStateColor = () => {
    // Use primary blue color instead of red - less negative
    return colors.primary[500];
  };

  const getStateIcon = () => {
    switch (activeAlarm.eventState) {
      case 2: // ON & vibrating
        return "notifications" as const;
      case 3: // ON & retrigger delay
        return "time" as const;
      case 4: // ON & snooze period
        return "pause-circle" as const;
      default:
        return "alarm" as const;
    }
  };

  const handleDismiss = () => {
    // Allow dismissing modal without stopping the alarm
    Vibration.cancel();
    setIsDismissed(true);
    // Note: This doesn't stop the alarm on the device, just closes the modal
    // The alarm will continue on the bracelet
  };

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.9)",
          justifyContent: "center",
          alignItems: "center",
          padding: spacing[6],
        }}
      >
        <View
          style={{
            backgroundColor: colors.background.primary,
            borderRadius: 24,
            padding: spacing[8],
            width: "100%",
            maxWidth: 400,
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 16,
            elevation: 12,
          }}
        >
          {/* Icon */}
          <View
            style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              backgroundColor: `${getStateColor()}20`,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: spacing[6],
            }}
          >
            <Ionicons name={getStateIcon()} size={56} color={getStateColor()} />
          </View>

          {/* Alarm Title */}
          <Text
            style={[
              typography.h2,
              {
                color: colors.text.primary,
                marginBottom: spacing[2],
                textAlign: "center",
              },
            ]}
          >
            {alarmDetails?.title ?? activeAlarm.alarmTitle ?? "Alarm Active"}
          </Text>

          {/* State */}
          <Text
            style={[
              typography.body,
              {
                color: getStateColor(),
                marginBottom: spacing[6],
                textAlign: "center",
                fontWeight: "600",
              },
            ]}
          >
            {activeAlarm.eventStateText}
          </Text>

          {/* Event Index Info */}
          <Text
            style={[
              typography.caption,
              {
                color: colors.text.secondary,
                marginBottom: spacing[8],
                textAlign: "center",
              },
            ]}
          >
            Event #{activeAlarm.eventIndex} on your Gently bracelet
          </Text>

          {/* Action Buttons */}
          <View style={{ width: "100%", gap: spacing[3] }}>
            {/* Stop Alarm Button */}
            <Pressable
              style={[
                buttons.base,
                buttons.large,
                {
                  backgroundColor: getStateColor(),
                  width: "100%",
                  paddingVertical: spacing[5],
                },
                isAcknowledging && buttons.disabled,
              ]}
              onPress={handleAcknowledge}
              disabled={isAcknowledging}
            >
              {isAcknowledging ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.text.inverse}
                    style={{ marginRight: spacing[2] }}
                  />
                  <Text style={[buttonText.primary, { fontSize: 18 }]}>
                    Stop Alarm
                  </Text>
                </>
              )}
            </Pressable>

            {/* Dismiss Button */}
            <Pressable
              style={[
                buttons.base,
                buttons.large,
                {
                  backgroundColor: colors.background.secondary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  width: "100%",
                  paddingVertical: spacing[5],
                },
              ]}
              onPress={handleDismiss}
            >
              <Ionicons
                name="close-circle-outline"
                size={24}
                color={colors.text.secondary}
                style={{ marginRight: spacing[2] }}
              />
              <Text
                style={[
                  buttonText.secondary,
                  { fontSize: 18, color: colors.text.secondary },
                ]}
              >
                Dismiss
              </Text>
            </Pressable>
          </View>

          {/* Help Text */}
          <Text
            style={[
              typography.caption,
              {
                color: colors.text.tertiary,
                marginTop: spacing[4],
                textAlign: "center",
                fontStyle: "italic",
              },
            ]}
          >
            Stop turns off the alarm • Dismiss keeps it on your bracelet
          </Text>
        </View>
      </View>
    </Modal>
  );
}
