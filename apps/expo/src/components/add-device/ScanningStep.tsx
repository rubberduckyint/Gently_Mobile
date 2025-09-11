import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { buttons, buttonText, colors, spacing, typography } from "~/styles";
import { StepLayout } from "./StepLayout";

interface ScanningStepProps {
  isInitialized: boolean;
  onCancel: () => void;
}

export function ScanningStep({ isInitialized, onCancel }: ScanningStepProps) {
  return (
    <StepLayout
      bottomContent={
        <Pressable
          style={[buttons.base, buttons.large, buttons.secondary]}
          onPress={onCancel}
        >
          <Text style={[buttonText.secondary, buttonText.large]}>Cancel</Text>
        </Pressable>
      }
    >
      <View style={{ alignItems: "center" }}>
        <Text
          style={[
            typography.h2,
            { marginBottom: spacing[2], textAlign: "center" },
          ]}
        >
          {isInitialized ? "Scanning for Devices" : "Initializing Bluetooth"}
        </Text>

        <Text
          style={[
            typography.body,
            {
              color: colors.text.secondary,
              textAlign: "center",
              marginBottom: spacing[8],
            },
          ]}
        >
          {isInitialized
            ? "Make sure your device is in pairing mode and nearby"
            : "Setting up Bluetooth permissions and checking device status..."}
        </Text>

        <ActivityIndicator
          size="large"
          color={colors.primary[500]}
          style={{ marginBottom: spacing[4] }}
        />

        <Text
          style={[
            typography.bodySmall,
            {
              color: colors.text.secondary,
              textAlign: "center",
            },
          ]}
        >
          {isInitialized ? "Looking for nearby devices..." : "Please wait..."}
        </Text>
      </View>
    </StepLayout>
  );
}
