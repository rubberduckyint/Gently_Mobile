import React from "react";
import { Text, View } from "react-native";

import { cards, colors, spacing, typography } from "~/styles";

interface DeviceInfoProps {
  deviceInfo: {
    serialNumber: string;
    firmwareVersion: string;
    batteryLevel: number;
  };
}

export function DeviceInfo({ deviceInfo }: DeviceInfoProps) {
  return (
    <View
      style={[
        cards.base,
        {
          width: "100%",
          marginBottom: spacing[6],
        },
      ]}
    >
      <Text
        style={[
          typography.h6,
          {
            marginBottom: spacing[4],
            color: colors.text.primary,
          },
        ]}
      >
        Device Information
      </Text>

      <View
        style={{
          paddingVertical: spacing[3],
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={[typography.body, { color: colors.text.secondary }]}>
          Serial Number:
        </Text>
        <Text style={[typography.labelLarge, { color: colors.text.primary }]}>
          {deviceInfo.serialNumber}
        </Text>
      </View>

      <View
        style={{
          paddingVertical: spacing[3],
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={[typography.body, { color: colors.text.secondary }]}>
          Firmware:
        </Text>
        <Text style={[typography.labelLarge, { color: colors.text.primary }]}>
          {deviceInfo.firmwareVersion}
        </Text>
      </View>

      <View
        style={{
          paddingVertical: spacing[3],
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={[typography.body, { color: colors.text.secondary }]}>
          Battery:
        </Text>
        <Text style={[typography.labelLarge, { color: colors.text.primary }]}>
          {deviceInfo.batteryLevel}%
        </Text>
      </View>
    </View>
  );
}
