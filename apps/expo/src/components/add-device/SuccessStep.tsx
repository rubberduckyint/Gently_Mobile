import React from "react";
import { Pressable, Text, View } from "react-native";

import { buttons, buttonText, colors, spacing, typography } from "~/styles";
import { DeviceInfo } from "./DeviceInfo";
import { StepLayout } from "./StepLayout";

interface SuccessStepProps {
  deviceName?: string;
  deviceInfo?: {
    serialNumber: string;
    firmwareVersion: string;
    batteryLevel: number;
  };
  onViewDevice: () => void;
}

export function SuccessStep({
  deviceName,
  deviceInfo,
  onViewDevice,
}: SuccessStepProps) {
  return (
    <StepLayout
      bottomContent={
        <Pressable
          style={[buttons.base, buttons.large, buttons.success]}
          onPress={onViewDevice}
        >
          <Text style={[buttonText.success, buttonText.large]}>
            View Device Details
          </Text>
        </Pressable>
      }
    >
      <View style={{ alignItems: "center", width: "100%" }}>
        <View style={{ alignItems: "center", marginBottom: spacing[6] }}>
          <Text style={{ fontSize: 64, marginBottom: spacing[4] }}>🎉</Text>
        </View>

        <Text
          style={[
            typography.h2,
            { marginBottom: spacing[2], textAlign: "center" },
          ]}
        >
          Device Added Successfully!
        </Text>

        <Text
          style={[
            typography.body,
            {
              color: colors.text.secondary,
              textAlign: "center",
              marginBottom: spacing[6],
            },
          ]}
        >
          {deviceName ?? "Your device"} has been connected and added to your
          account.
        </Text>

        {deviceInfo && <DeviceInfo deviceInfo={deviceInfo} />}

        <Text
          style={[
            typography.bodySmall,
            {
              color: colors.text.secondary,
              textAlign: "center",
              lineHeight: 20,
            },
          ]}
        >
          You can now create gentle alarms and sync with your device.
        </Text>
      </View>
    </StepLayout>
  );
}
