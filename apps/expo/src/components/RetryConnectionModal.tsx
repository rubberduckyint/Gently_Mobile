import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { buttons, cards, colors, spacing, typography } from "~/styles";

interface RetryConnectionModalProps {
  visible: boolean;
  connectionError: string | null;
  onRetry: () => void;
  onClose: () => void;
}

export function RetryConnectionModal({
  visible,
  connectionError,
  onRetry,
  onClose,
}: RetryConnectionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: spacing[4],
        }}
      >
        <View
          style={[
            cards.base,
            {
              width: "100%",
              maxWidth: 400,
              padding: spacing[6],
              alignItems: "center",
            },
          ]}
        >
          {/* Error Icon */}
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: colors.error[100],
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing[4],
            }}
          >
            <Ionicons name="alert-circle" size={48} color={colors.error[600]} />
          </View>

          {/* Error Title */}
          <Text
            style={[
              typography.h3,
              {
                color: colors.text.primary,
                textAlign: "center",
                marginBottom: spacing[2],
              },
            ]}
          >
            Connection Failed
          </Text>

          {/* Error Message */}
          <Text
            style={[
              typography.body,
              {
                color: colors.text.secondary,
                textAlign: "center",
                marginBottom: spacing[4],
              },
            ]}
          >
            {connectionError ?? "Unable to connect to your Gently device"}
          </Text>

          {/* Instructions */}
          <View
            style={[
              {
                backgroundColor: colors.primary[50],
                borderRadius: 12,
                padding: spacing[4],
                marginBottom: spacing[6],
                width: "100%",
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                marginBottom: spacing[2],
              }}
            >
              <Ionicons
                name="information-circle"
                size={20}
                color={colors.primary[600]}
                style={{ marginRight: spacing[2], marginTop: 2 }}
              />
              <Text
                style={[
                  typography.labelLarge,
                  {
                    color: colors.primary[700],
                    flex: 1,
                  },
                ]}
              >
                To retry connection:
              </Text>
            </View>
            <Text
              style={[
                typography.body,
                {
                  color: colors.primary[700],
                  marginLeft: spacing[7],
                },
              ]}
            >
              Hold the button on your Gently device for 10 seconds until it
              beeps to enter pairing mode, then tap Retry below.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={{ width: "100%", gap: spacing[3] }}>
            <Pressable
              style={[
                buttons.base,
                buttons.primary,
                { alignItems: "center", justifyContent: "center" },
              ]}
              onPress={onRetry}
            >
              <Text style={[typography.labelLarge, { color: "#ffffff" }]}>
                Retry Connection
              </Text>
            </Pressable>

            <Pressable
              style={[
                buttons.base,
                buttons.secondary,
                { alignItems: "center", justifyContent: "center" },
              ]}
              onPress={onClose}
            >
              <Text
                style={[typography.labelLarge, { color: colors.primary[600] }]}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
