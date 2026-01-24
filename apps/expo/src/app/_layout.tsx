import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { vexo } from "vexo-analytics";

import "react-native-reanimated";

import { AlarmNotificationModal } from "~/components/AlarmNotificationModal";
import { BLEProvider } from "~/contexts/BLEContext";
import { NotificationService } from "~/services/notifications";
import { queryClient } from "~/utils/api";

// Initialize Vexo Analytics at module level (before component renders)
// Only run in production to avoid polluting analytics during development
if (!__DEV__) {
  const vexoApiKey = process.env.EXPO_PUBLIC_VEXO_API_KEY;
  if (vexoApiKey) {
    vexo(vexoApiKey);
    console.log("📊 Vexo Analytics initialized");
  } else {
    console.warn("📊 Vexo Analytics: EXPO_PUBLIC_VEXO_API_KEY not set");
  }
}

// This is the main layout of the app
// It wraps your pages with the providers they need
export default function RootLayout() {
  // Initialize push notifications on app start
  useEffect(() => {
    NotificationService.initialize()
      .then((token) => {
        if (token) {
          console.log(
            "📱 Push notifications initialized with token:",
            token.substring(0, 30) + "...",
          );
        } else {
          console.log(
            "⚠️ Push notifications not available (may need physical device)",
          );
        }
      })
      .catch((error) => {
        console.error("❌ Failed to initialize push notifications:", error);
      });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BLEProvider>
        {/*
            The Stack component displays the current page.
            It also allows you to configure your screens 
          */}
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: "#f8fafc",
            },
            headerTintColor: "#1f2937",
            contentStyle: {
              backgroundColor: "#f8fafc",
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              title: "Login",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="dashboard"
            options={{
              title: "Dashboard",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              title: "Settings",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="add-device/index"
            options={{
              title: "Add Device",
              headerShown: false,
            }}
          />

          <Stack.Screen
            name="devices/[deviceId]/alarms/add"
            options={{
              title: "Add Alarm",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="devices/[deviceId]/alarms/edit/[alarmId]"
            options={{
              title: "Edit Alarm",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="devices/[deviceId]/index"
            options={{
              title: "Device Details",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="devices/[deviceId]/delete/index"
            options={{
              title: "Delete Device",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="devices/[deviceId]/edit/index"
            options={{
              title: "Edit Device",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="devices/[deviceId]/ble-test"
            options={{
              title: "BLE Test",
              headerShown: false,
            }}
          />
        </Stack>
        <StatusBar style="dark" />
        {/* Global alarm notification modal - shows when BLE context has activeAlarm */}
        <AlarmNotificationModal />
      </BLEProvider>
    </QueryClientProvider>
  );
}
