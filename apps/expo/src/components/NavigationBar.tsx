/**
 * Navigation Bar Component
 *
 * Reusable navigation bar with back button, title, and hamburger menu
 */

import React, { useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { colors, spacing, typography } from "~/styles";
import { authClient } from "~/utils/auth";

interface NavigationBarProps {
  title: string;
  showBack?: boolean;
  showMenu?: boolean;
}

export function NavigationBar({
  title,
  showBack = true,
  showMenu = true,
}: NavigationBarProps) {
  const [showMenuModal, setShowMenuModal] = useState(false);

  const handleBack = () => {
    router.back();
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          authClient
            .signOut()
            .then(() => {
              router.replace("/");
            })
            .catch(() => {
              Alert.alert("Error", "Failed to sign out. Please try again.");
            });
        },
      },
    ]);
    setShowMenuModal(false);
  };

  const handleSettings = () => {
    setShowMenuModal(false);
    router.push("./settings" as "/settings"); // Fixed typing for settings route
  };

  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing[4], // 16px
          paddingVertical: spacing[3], // 12px
          backgroundColor: colors.background.secondary,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          minHeight: 56,
        }}
      >
        {/* Left Side - Back Button or Spacer */}
        <View style={{ width: 40 }}>
          {showBack && (
            <Pressable
              onPress={handleBack}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather
                name="arrow-left"
                size={22}
                color={colors.text.primary}
              />
            </Pressable>
          )}
        </View>

        {/* Center - Title */}
        <Text
          style={[
            typography.h6,
            {
              flex: 1,
              textAlign: "center",
              marginHorizontal: spacing[2],
            },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>

        {/* Right Side - Menu Button */}
        <View style={{ width: 40 }}>
          {showMenu && (
            <Pressable
              onPress={() => setShowMenuModal(true)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="menu" size={22} color={colors.text.primary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Menu Modal */}
      <Modal
        visible={showMenuModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-start",
            alignItems: "flex-end",
          }}
          onPress={() => setShowMenuModal(false)}
        >
          <SafeAreaView style={{ marginTop: 8 }}>
            <View
              style={{
                backgroundColor: colors.background.secondary,
                marginHorizontal: spacing[4],
                borderRadius: 8,
                padding: spacing[2],
                minWidth: 160,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              {/* Settings Option */}
              <Pressable
                onPress={handleSettings}
                style={{
                  paddingVertical: spacing[3],
                  paddingHorizontal: spacing[3],
                  borderRadius: 4,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing[2],
                  }}
                >
                  <Feather
                    name="settings"
                    size={20}
                    color={colors.text.primary}
                  />
                  <Text
                    style={[typography.body, { color: colors.text.primary }]}
                  >
                    Settings
                  </Text>
                </View>
              </Pressable>

              {/* Divider */}
              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border.light,
                  marginVertical: spacing[1],
                }}
              />

              {/* Logout Option */}
              <Pressable
                onPress={handleLogout}
                style={{
                  paddingVertical: spacing[3],
                  paddingHorizontal: spacing[3],
                  borderRadius: 4,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing[2],
                  }}
                >
                  <Feather name="log-out" size={20} color={colors.error[600]} />
                  <Text style={[typography.body, { color: colors.error[600] }]}>
                    Sign Out
                  </Text>
                </View>
              </Pressable>
            </View>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </>
  );
}
