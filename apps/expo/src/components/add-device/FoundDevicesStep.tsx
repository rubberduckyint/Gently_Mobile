import React from "react";
import { Pressable, Text, View } from "react-native";

import type { BluetoothDevice } from "~/services/bluetooth";
import {
  buttons,
  buttonText,
  colors,
  flex,
  spacing,
  typography,
} from "~/styles";
import { DeviceList } from "./DeviceList";
import { StepLayout } from "./StepLayout";

interface FoundDevicesStepProps {
  devices: BluetoothDevice[];
  onDeviceSelect: (device: BluetoothDevice) => void;
  onRetry: () => void;
  onCancel: () => void;
}

export function FoundDevicesStep({
  devices,
  onDeviceSelect,
  onRetry,
  onCancel,
}: FoundDevicesStepProps) {
  const hasDevices = devices.length > 0;

  return (
    <StepLayout
      bottomContent={
        <View style={[flex.row, { gap: spacing[3] }]}>
          <Pressable
            style={[buttons.base, buttons.large, buttons.primary, flex.flex1]}
            onPress={onRetry}
          >
            <Text style={[buttonText.primary, buttonText.large]}>
              Scan Again
            </Text>
          </Pressable>
          <Pressable
            style={[buttons.base, buttons.large, buttons.secondary, flex.flex1]}
            onPress={onCancel}
          >
            <Text style={[buttonText.secondary, buttonText.large]}>Cancel</Text>
          </Pressable>
        </View>
      }
    >
      <View style={{ alignItems: "center", width: "100%" }}>
        <Text
          style={[
            typography.h2,
            { marginBottom: spacing[2], textAlign: "center" },
          ]}
        >
          Found Devices
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
          Select your device from the list below
        </Text>

        {hasDevices ? (
          <DeviceList devices={devices} onDeviceSelect={onDeviceSelect} />
        ) : (
          <View style={{ alignItems: "center", marginBottom: spacing[8] }}>
            <Text
              style={[
                typography.h6,
                {
                  color: colors.text.secondary,
                  marginBottom: spacing[2],
                },
              ]}
            >
              No unpaired devices found
            </Text>
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  textAlign: "center",
                  lineHeight: 24,
                },
              ]}
            >
              Make sure your device is in pairing mode and hasn't been paired
              before
            </Text>
          </View>
        )}
      </View>
    </StepLayout>
  );
}
