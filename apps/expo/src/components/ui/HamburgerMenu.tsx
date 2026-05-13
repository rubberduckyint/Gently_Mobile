import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing, typography } from "~/styles";

export interface MenuOption {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  badge?: number;
}

interface HamburgerMenuProps {
  options: MenuOption[];
}

export function HamburgerMenu({ options }: HamburgerMenuProps) {
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  // Calculate if any option has a badge (for the hamburger icon)
  const totalBadges = options.reduce((sum, opt) => sum + (opt.badge ?? 0), 0);

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
          position: "relative",
        })}
        accessibilityLabel="More options"
      >
        <Ionicons name="menu" size={24} color={colors.text.primary} />
        {/* Badge indicator on hamburger icon */}
        {totalBadges > 0 && (
          <View
            style={{
              position: "absolute",
              top: 4,
              right: -2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: colors.error[500],
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 4,
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 10,
                fontWeight: "700",
              }}
            >
              {totalBadges > 9 ? "9+" : totalBadges}
            </Text>
          </View>
        )}
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
                <View style={{ position: "relative", marginRight: spacing[3] }}>
                  <Ionicons
                    name={option.icon}
                    size={20}
                    color={
                      option.destructive
                        ? colors.error[500]
                        : colors.text.primary
                    }
                  />
                  {/* Badge on individual menu item icon */}
                  {option.badge && option.badge > 0 && (
                    <View
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -6,
                        minWidth: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: colors.error[500],
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 2,
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 9,
                          fontWeight: "700",
                        }}
                      >
                        {option.badge > 9 ? "9+" : option.badge}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    typography.body,
                    {
                      color: option.destructive
                        ? colors.error[500]
                        : colors.text.primary,
                      flex: 1,
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
