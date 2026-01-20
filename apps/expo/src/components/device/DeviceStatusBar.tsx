/**
 * DeviceStatusBar Component
 *
 * Displays the connection status, battery level, and device serial number.
 */

import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import type { BLEConnectionState } from "~/contexts/BLEContext";
import { buttons, colors, spacing, typography } from "~/styles";

interface BatteryStatus {
  level: number;
  voltage: number;
  isCharging: boolean;
  levelText: string;
}

interface DeviceStatusBarProps {
  connectionState: BLEConnectionState;
  connectionProgress?: { message: string; progress: number } | null;
  batteryStatus?: BatteryStatus | null;
  serialNumber?: string;
  onReconnect?: () => void;
  showReconnect?: boolean;
  pulseAnimatedStyle?: StyleProp<ViewStyle>;
}

/**
 * Get battery display configuration based on status
 */
function getBatteryInfo(status: BatteryStatus): {
  color: string;
  text: string;
  icon:
    | "battery-dead"
    | "battery-dead-outline"
    | "battery-half"
    | "battery-full"
    | "battery-charging";
} {
  const configs = [
    {
      color: colors.error[600],
      text: "Critical",
      icon: "battery-dead" as const,
    },
    { color: colors.error[500], text: "Low", icon: "battery-half" as const },
    {
      color: colors.warning[600],
      text: "Medium",
      icon: "battery-half" as const,
    },
    { color: colors.success[600], text: "Good", icon: "battery-full" as const },
    { color: colors.success[600], text: "Full", icon: "battery-full" as const },
  ];

  const config = configs[status.level] ??
    configs[0] ?? {
      color: colors.gray[600],
      text: "Unknown",
      icon: "battery-dead-outline" as const,
    };

  return {
    color: config.color,
    text: config.text,
    icon: status.isCharging ? "battery-charging" : config.icon,
  };
}

/**
 * Get connection status display configuration
 */
function getConnectionInfo(state: BLEConnectionState) {
  switch (state) {
    case "connected":
      return { color: colors.success[600], icon: colors.success[600] };
    case "connecting":
    case "scanning":
      return { color: colors.warning[600], icon: colors.warning[600] };
    case "error":
      return { color: colors.error[600], icon: colors.error[600] };
    default:
      return { color: colors.gray[500], icon: colors.gray[400] };
  }
}

export function DeviceStatusBar({
  connectionState,
  connectionProgress,
  batteryStatus,
  serialNumber,
  onReconnect,
  showReconnect = false,
  pulseAnimatedStyle,
}: DeviceStatusBarProps) {
  const connectionInfo = getConnectionInfo(connectionState);

  const statusText =
    connectionProgress?.message ??
    connectionState.charAt(0).toUpperCase() + connectionState.slice(1);

  return (
    <View
      style={{
        paddingHorizontal: spacing[4],
        paddingVertical: spacing[2],
        backgroundColor: colors.background.secondary,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing[2],
      }}
      accessible={true}
      accessibilityLabel={`Device status: ${statusText}${batteryStatus ? `, Battery ${batteryStatus.levelText}` : ""}`}
      accessibilityRole="summary"
    >
      {/* Connection Status */}
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <Animated.View
          style={[{ marginRight: spacing[1] }, pulseAnimatedStyle]}
        >
          <Ionicons name="bluetooth" size={14} color={connectionInfo.icon} />
        </Animated.View>
        <Text
          style={[
            typography.caption,
            {
              color: connectionInfo.color,
              fontWeight: "500",
            },
          ]}
          numberOfLines={1}
        >
          {statusText}
        </Text>
      </View>

      {/* Battery Status */}
      {batteryStatus && (
        <View
          style={{ flexDirection: "row", alignItems: "center" }}
          accessible={true}
          accessibilityLabel={`Battery ${batteryStatus.levelText}${batteryStatus.isCharging ? ", charging" : ""}`}
        >
          <Ionicons
            name={getBatteryInfo(batteryStatus).icon}
            size={14}
            color={getBatteryInfo(batteryStatus).color}
            style={{ marginRight: spacing[1] }}
          />
          <Text
            style={[
              typography.caption,
              {
                color: getBatteryInfo(batteryStatus).color,
                fontWeight: "500",
              },
            ]}
          >
            {getBatteryInfo(batteryStatus).text}
            {batteryStatus.isCharging && " ⚡"}
          </Text>
        </View>
      )}

      {/* Serial Number */}
      {serialNumber && (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons
            name="barcode-outline"
            size={14}
            color={colors.gray[500]}
            style={{ marginRight: spacing[1] }}
          />
          <Text
            style={[
              typography.caption,
              { color: colors.gray[500], fontWeight: "500" },
            ]}
          >
            {serialNumber.slice(-5)}
          </Text>
        </View>
      )}

      {/* Reconnect Button */}
      {showReconnect && onReconnect && (
        <Pressable
          style={[
            buttons.base,
            buttons.primary,
            {
              paddingVertical: spacing[1],
              paddingHorizontal: spacing[2],
            },
          ]}
          onPress={onReconnect}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Reconnect to device"
        >
          <Text
            style={[
              typography.caption,
              { color: colors.text.inverse, fontSize: 11 },
            ]}
          >
            Reconnect
          </Text>
        </Pressable>
      )}
    </View>
  );
}
