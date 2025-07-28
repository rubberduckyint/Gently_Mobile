import { useEffect } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";

import { authClient } from "~/utils/auth";

export default function AuthCallbackPage() {
  const params = useLocalSearchParams();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the token from URL params or local search params
        const token = (params.token as string) || null;
        
        if (token) {
          // Verify the magic link token with better-auth
          await authClient.$fetch("/magic-link/verify", {
            method: "POST",
            body: { token },
          });
          
          // Redirect to main app
          router.replace("/");
        } else {
          // If no token in params, try to get it from the initial URL
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            const parsedUrl = Linking.parse(initialUrl);
            const urlToken = parsedUrl.queryParams?.token as string;
            
            if (urlToken) {
              await authClient.$fetch("/magic-link/verify", {
                method: "POST",
                body: { token: urlToken },
              });
              router.replace("/");
              return;
            }
          }
          
          throw new Error("No token found in callback URL");
        }
      } catch (error) {
        console.error("Auth callback failed:", error);
        Alert.alert(
          "Authentication Failed",
          "Failed to sign in. Please try again.",
          [{ text: "OK", onPress: () => router.replace("/login") }]
        );
      }
    };

    // Small delay to ensure navigation is ready
    setTimeout(handleAuthCallback, 100);
  }, [params]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.text}>Signing you in...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
  },
});
