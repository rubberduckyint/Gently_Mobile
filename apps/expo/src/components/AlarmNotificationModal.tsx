/**
 * AlarmNotificationModal Component
 *
 * Shows a full-screen modal when an alarm is actively triggering on the bracelet.
 * Allows user to acknowledge/stop the alarm by sending the acknowledge command to the device.
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useBLE } from "~/contexts/BLEContext";
import { buttons, buttonText, colors, spacing, typography } from "~/styles";

/**
 * Modal that automatically shows when an alarm is active
 * Uses BLE context to detect active alarms and acknowledge them
 */
export function AlarmNotificationModal() {
  const { activeAlarm, acknowledgeAlarm } = useBLE();
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  // Vibrate the phone when alarm modal appears
  useEffect(() => {
    if (activeAlarm && activeAlarm.eventState === 2) {
      // State 2 = ON & active in vibration
      // Vibrate in a pattern: 500ms on, 250ms off, repeated
      const pattern = [0, 500, 250, 500, 250, 500];
      Vibration.vibrate(pattern, true); // true = repeat

      return () => {
        Vibration.cancel();
      };
    }
  }, [activeAlarm]);

  if (!activeAlarm) return null;

  const handleAcknowledge = async () => {
    setIsAcknowledging(true);

    try {
      console.log(`🔕 Acknowledging alarm at index ${activeAlarm.eventIndex}...`);

      // Send acknowledge command (equivalent to double-pressing the button)
      await acknowledgeAlarm(activeAlarm.eventIndex);

      console.log(`✅ Alarm acknowledged successfully`);
      Vibration.cancel(); // Stop phone vibration
      // Modal will auto-close when activeAlarm is set to null by BLE context
    } catch (error) {
      console.error("❌ Error acknowledging alarm:", error);
      Vibration.cancel();
      // Show error but modal will stay open
      alert("Failed to stop alarm. Please try again or use the device button.");
    } finally {
      setIsAcknowledging(false);
    }
  };

  const getStateColor = () => {
    switch (activeAlarm.eventState) {
      case 2: // ON & vibrating
        return colors.error[500];
      case 3: // ON & retrigger delay
        return colors.warning[500];
      case 4: // ON & snooze period
        return colors.primary[500];
      default:
        return colors.gray[500];
    }
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

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={handleAcknowledge}
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
            <Ionicons
              name={getStateIcon()}
              size={56}
              color={getStateColor()}
            />
          </View>

          {/* Title */}
          <Text
            style={[
              typography.h1,
              {
                color: colors.text.primary,
                marginBottom: spacing[2],
                textAlign: "center",
              },
            ]}
          >
            Alarm Active
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

          {/* Acknowledge Button */}
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
            This stops the alarm on your bracelet
          </Text>
        </View>
      </View>
    </Modal>
  );
}
