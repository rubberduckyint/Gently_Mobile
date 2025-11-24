/**
 * Google Calendar OAuth Connection Screen
 * Handles the OAuth flow for connecting Google Calendar
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as AuthSession from "expo-auth-session";

import { Header } from "~/components/ui/Header";
import {
  buttons,
  buttonText,
  cards,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";
import {
  getOAuthDiscovery,
  getOAuthRequest,
  exchangeCodeForToken,
  getUserEmail,
} from "~/services/googleCalendar";
import { trpc } from "~/utils/api";

export default function ConnectGooglePage() {
  const queryClient = useQueryClient();
  const params = useLocalSearchParams();
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<"initial" | "authorizing" | "saving">(
    "initial",
  );

  // Setup OAuth
  const discovery = getOAuthDiscovery();
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    getOAuthRequest(),
    discovery,
  );

  // Save connection mutation
  const saveConnectionMutation = useMutation({
    mutationFn: (data: {
      provider: "google";
      accountEmail: string;
      accessToken: string;
      refreshToken: string;
      tokenExpiresAt: Date;
    }) => trpc.calendar.createConnection.mutate(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["calendarConnections"] });
      Alert.alert("Success", "Google Calendar connected successfully!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (error: Error) => {
      Alert.alert("Error", `Failed to save connection: ${error.message}`);
      setIsProcessing(false);
      setStep("initial");
    },
  });

  // Handle OAuth redirect
  useEffect(() => {
    const code = params.code as string | undefined;

    if (code && request?.codeVerifier && !isProcessing) {
      void handleOAuthCallback(code, request.codeVerifier);
    }
  }, [params.code, request]);

  const handleOAuthCallback = async (code: string, codeVerifier: string) => {
    setIsProcessing(true);
    setStep("saving");

    try {
      // Exchange code for tokens
      const tokenData = await exchangeCodeForToken(code, codeVerifier);

      // Get user's email
      const email = await getUserEmail(tokenData.accessToken);

      // Calculate token expiration
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expiresIn);

      // Ensure we have a refresh token
      if (!tokenData.refreshToken) {
        throw new Error("No refresh token received from Google");
      }

      // Save to database
      saveConnectionMutation.mutate({
        provider: "google",
        accountEmail: email,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        tokenExpiresAt: expiresAt,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      Alert.alert("Authentication Failed", errorMessage);
      setIsProcessing(false);
      setStep("initial");
    }
  };

  const handleConnect = async () => {
    if (!request) {
      Alert.alert("Error", "OAuth request not ready. Please try again.");
      return;
    }

    setIsProcessing(true);
    setStep("authorizing");

    try {
      const result = await promptAsync();

      if (result.type === "success") {
        // OAuth flow completed - the redirect will trigger handleOAuthCallback
        // via useEffect when the page reloads with the code parameter
      } else if (result.type === "cancel") {
        Alert.alert("Cancelled", "Google Calendar connection was cancelled");
        setIsProcessing(false);
        setStep("initial");
      } else {
        throw new Error("OAuth flow failed");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to start OAuth flow";
      Alert.alert("Error", errorMessage);
      setIsProcessing(false);
      setStep("initial");
    }
  };

  const getStepMessage = () => {
    switch (step) {
      case "authorizing":
        return "Opening Google sign-in...";
      case "saving":
        return "Saving your connection...";
      default:
        return "";
    }
  };

  return (
    <SafeAreaView style={containers.screen}>
      <Header title="Connect Google Calendar" showBackButton />

      <View
        style={[
          containers.content,
          containers.contentCentered,
          { padding: spacing[4] },
        ]}
      >
        <View style={{ alignItems: "center", maxWidth: 400 }}>
          {/* Icon */}
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: colors.primary[50],
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing[6],
            }}
          >
            <Ionicons name="logo-google" size={64} color={colors.primary[500]} />
          </View>

          {/* Title */}
          <Text
            style={[
              typography.h3,
              { textAlign: "center", marginBottom: spacing[3] },
            ]}
          >
            Connect Your Calendar
          </Text>

          {/* Description */}
          <Text
            style={[
              typography.body,
              {
                textAlign: "center",
                color: colors.text.secondary,
                marginBottom: spacing[6],
              },
            ]}
          >
            Sign in with Google to access your calendar events and create alarms
            automatically.
          </Text>

          {/* Permissions Info */}
          <View style={[cards.base, { marginBottom: spacing[6], width: "100%" }]}>
            <Text
              style={[
                typography.h6,
                { marginBottom: spacing[3], color: colors.text.primary },
              ]}
            >
              This app will be able to:
            </Text>

            {[
              "View your calendar events",
              "Read event details (title, time, location)",
              "Access your Google account email",
            ].map((permission, index) => (
              <View
                key={index}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  marginBottom: spacing[2],
                }}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.success[500]}
                  style={{ marginRight: spacing[2], marginTop: 2 }}
                />
                <Text
                  style={[
                    typography.body,
                    { flex: 1, color: colors.text.secondary },
                  ]}
                >
                  {permission}
                </Text>
              </View>
            ))}
          </View>

          {/* Status Message */}
          {isProcessing && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing[4],
              }}
            >
              <ActivityIndicator
                color={colors.primary[500]}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={[typography.body, { color: colors.text.secondary }]}>
                {getStepMessage()}
              </Text>
            </View>
          )}

          {/* Connect Button */}
          <Pressable
            style={[
              buttons.base,
              buttons.large,
              buttons.primary,
              { width: "100%" },
            ]}
            onPress={handleConnect}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <>
                <Ionicons
                  name="logo-google"
                  size={24}
                  color={colors.text.inverse}
                  style={{ marginRight: spacing[2] }}
                />
                <Text style={buttonText.primary}>Sign in with Google</Text>
              </>
            )}
          </Pressable>

          {/* Privacy Note */}
          <Text
            style={[
              typography.caption,
              {
                textAlign: "center",
                color: colors.text.secondary,
                marginTop: spacing[4],
              },
            ]}
          >
            Your calendar data is stored securely and will never be shared with
            third parties.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
