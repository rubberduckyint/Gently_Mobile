import React from "react";
import { Pressable, Text, View } from "react-native";

import {
  buttons,
  buttonText,
  colors,
  flex,
  spacing,
  typography,
} from "~/styles";
import { StepLayout } from "./StepLayout";

interface ErrorStepProps {
  errorMessage: string;
  onRetry: () => void;
  onCancel: () => void;
}

export function ErrorStep({ errorMessage, onRetry, onCancel }: ErrorStepProps) {
  return (
    <StepLayout
      bottomContent={
        <View style={[flex.row, { gap: spacing[3] }]}>
          <Pressable
            style={[buttons.base, buttons.large, buttons.primary, flex.flex1]}
            onPress={onRetry}
          >
            <Text style={[buttonText.primary, buttonText.large]}>
              Try Again
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
      <View style={{ alignItems: "center" }}>
        <Text
          style={[
            typography.h2,
            { marginBottom: spacing[2], textAlign: "center" },
          ]}
        >
          Connection Error
        </Text>

        <Text
          style={[
            typography.body,
            {
              color: colors.error[600],
              textAlign: "center",
              lineHeight: 24,
            },
          ]}
        >
          {errorMessage}
        </Text>
      </View>
    </StepLayout>
  );
}
