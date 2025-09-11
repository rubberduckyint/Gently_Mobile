import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { colors, spacing, typography } from "~/styles";
import { StepLayout } from "./StepLayout";

interface ConnectingStepProps {
  deviceName?: string;
  isSaving: boolean;
}

export function ConnectingStep({ deviceName, isSaving }: ConnectingStepProps) {
  return (
    <StepLayout>
      <View style={{ alignItems: "center" }}>
        <Text
          style={[
            typography.h2,
            { marginBottom: spacing[2], textAlign: "center" },
          ]}
        >
          {isSaving ? "Saving Device" : "Connecting & Adding Device"}
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
          {isSaving
            ? `Adding ${deviceName ?? "device"} to your account...`
            : `Connecting to ${deviceName ?? "device"} and adding it to your account...`}
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
          This may take a few moments
        </Text>
      </View>
    </StepLayout>
  );
}
