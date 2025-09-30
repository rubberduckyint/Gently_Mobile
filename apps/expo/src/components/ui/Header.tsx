import React from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing, typography } from "~/styles";

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  rightButton?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    accessibilityLabel?: string;
  };
  rightComponent?: React.ReactNode;
}

export function Header({
  title,
  showBackButton = true,
  rightButton,
  rightComponent,
}: HeaderProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing[4],
        paddingVertical: spacing[3],
        backgroundColor: colors.background.primary,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
      }}
    >
      {/* Left side - Back button */}
      <View style={{ width: 40 }}>
        {showBackButton && (
          <Pressable
            onPress={() => router.push("/dashboard")}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              padding: spacing[2],
              marginLeft: -spacing[2],
            })}
            accessibilityLabel="Go to dashboard"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </Pressable>
        )}
      </View>

      {/* Center - Title */}
      <Text
        style={[
          typography.h3,
          {
            color: colors.text.primary,
            textAlign: "center",
            flex: 1,
          },
        ]}
      >
        {title}
      </Text>

      {/* Right side - Action button or component */}
      <View style={{ width: 40, alignItems: "flex-end" }}>
        {rightComponent ??
          (rightButton && (
            <Pressable
              onPress={rightButton.onPress}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                padding: spacing[2],
                marginRight: -spacing[2],
              })}
              accessibilityLabel={rightButton.accessibilityLabel}
            >
              <Ionicons
                name={rightButton.icon}
                size={24}
                color={colors.text.primary}
              />
            </Pressable>
          ))}
      </View>
    </View>
  );
}
