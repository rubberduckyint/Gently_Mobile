import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing, typography } from "~/styles";

interface MenuOption {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}

interface HamburgerMenuProps {
  options: MenuOption[];
}

export function HamburgerMenu({ options }: HamburgerMenuProps) {
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const handleOptionPress = (option: MenuOption) => {
    setIsMenuVisible(false);
    if (option.destructive) {
      // Add a small delay to let modal close before showing alert
      setTimeout(() => option.onPress(), 100);
    } else {
      option.onPress();
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setIsMenuVisible(true)}
        style={({ pressed }) => ({
          opacity: pressed ? 0.7 : 1,
          padding: spacing[2],
          marginRight: -spacing[2],
        })}
        accessibilityLabel="More options"
      >
        <Ionicons name="menu" size={24} color={colors.text.primary} />
      </Pressable>

      <Modal
        visible={isMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: colors.background.overlay,
            justifyContent: "flex-start",
            paddingTop: 100, // Adjust based on header height
            paddingRight: spacing[4],
          }}
          onPress={() => setIsMenuVisible(false)}
        >
          <View
            style={{
              alignSelf: "flex-end",
              backgroundColor: colors.background.secondary,
              borderRadius: spacing[2],
              paddingVertical: spacing[2],
              minWidth: 200,
              elevation: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
            }}
          >
            {options.map((option, index) => (
              <Pressable
                key={option.label}
                onPress={() => handleOptionPress(option)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: spacing[4],
                  paddingVertical: spacing[3],
                  backgroundColor: pressed
                    ? colors.background.tertiary
                    : "transparent",
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: colors.border.light,
                })}
              >
                <Ionicons
                  name={option.icon}
                  size={20}
                  color={
                    option.destructive ? colors.error[500] : colors.text.primary
                  }
                  style={{ marginRight: spacing[3] }}
                />
                <Text
                  style={[
                    typography.body,
                    {
                      color: option.destructive
                        ? colors.error[500]
                        : colors.text.primary,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
