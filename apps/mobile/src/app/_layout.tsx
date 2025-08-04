import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "~/utils/api";
import { useDeepLinkAuth } from "~/hooks/useDeepLinkAuth";

// This is the main layout of the app
// It wraps your pages with the providers they need
export default function RootLayout() {
  // Initialize deep link handling
  useDeepLinkAuth();

  return (
    <QueryClientProvider client={queryClient}>
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
            headerShown: false 
          }} 
        />
        <Stack.Screen 
          name="dashboard" 
          options={{ 
            title: "Dashboard",
            headerShown: false 
          }} 
        />
        <Stack.Screen 
          name="devices/[id]" 
          options={{ 
            title: "Device Details",
            headerShown: true 
          }} 
        />        
      </Stack>
      <StatusBar style="dark" />
    </QueryClientProvider>
  );
}
