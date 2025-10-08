import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";

import { BLEProvider } from "~/contexts/BLEContext";
import { queryClient } from "~/utils/api";

// This is the main layout of the app
// It wraps your pages with the providers they need
export default function RootLayout() {
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
      </BLEProvider>
    </QueryClientProvider>
  );
}
