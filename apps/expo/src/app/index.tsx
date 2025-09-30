import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import {
  buttons,
  buttonText,
  colors,
  commonStyles,
  containers,
  dividers,
  flex,
  inputs,
  spacing,
  typography,
} from "~/styles";
import { authClient, GoogleSignin } from "~/utils/auth";

export default function LoginPage() {
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (session?.user) {
      router.replace("/dashboard");
    }
  }, [session]);

  const handleEmailAuth = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    setIsLoading(true);
    try {
      // Use better-auth magic link
      await authClient.$fetch("/magic-link/send", {
        method: "POST",
        body: {
          email: email.trim(),
          callbackURL: "gently://", // Use expo scheme for callback
        },
      });

      setEmailSent(true);
      Alert.alert(
        "Check Your Email",
        "We've sent a sign-in link to your email address. Click the link to continue.",
        [{ text: "OK" }],
      );
    } catch (error: unknown) {
      Alert.alert(
        "Failed to Send Magic Link",
        (error as Error).message || "Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    console.log("Google auth button pressed");
    setIsLoading(true);
    try {
      // Check if Google Play Services are available
      console.log("Checking Google Play Services...");
      const hasPlayServices = await GoogleSignin.hasPlayServices();
      console.log("Play Services available:", hasPlayServices);

      // Sign in with Google (regular Google Sign-In, not Universal)
      console.log("Starting Google sign-in...");
      const userInfo = await GoogleSignin.signIn();
      console.log("Google sign-in result:", userInfo);

      // For regular Google Sign-In, idToken is directly on userInfo
      if (userInfo.data?.idToken) {
        // Use the idToken with better-auth's social signin method
        await authClient.signIn.social({
          provider: "google",
          idToken: {
            token: userInfo.data.idToken,
            // Note: serverAuthCode is for server-side token exchange, not nonce
            // If better-auth needs a nonce, it should be generated cryptographically
          },
          callbackURL: "/dashboard",
        });

        console.log("Better-auth Google signin successful");
        router.replace("/dashboard");
      } else {
        throw new Error("No ID token received from Google");
      }
    } catch (error: unknown) {
      console.error("Google auth error:", error);

      // Handle specific Google Sign-In errors
      const googleError = error as { code?: string };
      if (googleError.code === "SIGN_IN_CANCELLED") {
        console.log("User cancelled Google sign-in");
        return; // Don't show error for user cancellation
      } else if (googleError.code === "IN_PROGRESS") {
        console.log("Google sign-in already in progress");
        return;
      } else if (googleError.code === "PLAY_SERVICES_NOT_AVAILABLE") {
        Alert.alert(
          "Google Play Services Required",
          "Please update Google Play Services to continue.",
        );
        return;
      }

      Alert.alert(
        "Authentication Failed",
        (error as Error).message || "Failed to sign in with Google",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while checking authentication status
  if (isPending) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View style={commonStyles.fullScreenLoading}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text
            style={[
              typography.body,
              { marginTop: spacing[4], color: colors.text.secondary },
            ]}
          >
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={containers.screen}
      >
        <View style={containers.contentCentered}>
          {/* Header */}
          <View style={commonStyles.headerSection}>
            <Text style={typography.h1}>Welcome to Gently</Text>
            <Text style={[typography.subtitle, { textAlign: "center" }]}>
              {emailSent
                ? "Check your email for a sign-in link"
                : "Sign in to your account"}
            </Text>
          </View>

          {!emailSent && (
            <>
              {/* Email input */}
              <View style={inputs.container}>
                <Text style={inputs.label}>Email</Text>
                <TextInput
                  style={inputs.base}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                />
              </View>

              {/* Magic Link Button */}
              <Pressable
                style={[
                  buttons.base,
                  buttons.large,
                  buttons.primary,
                  isLoading && buttons.disabled,
                ]}
                onPress={handleEmailAuth}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.text.inverse} />
                ) : (
                  <Text style={buttonText.primary}>Send Sign-In Link</Text>
                )}
              </Pressable>

              {/* Divider */}
              <View
                style={[
                  commonStyles.dividerWithText,
                  { marginVertical: spacing[6] },
                ]}
              >
                <View style={dividers.line} />
                <Text
                  style={[
                    typography.caption,
                    { paddingHorizontal: spacing[4] },
                  ]}
                >
                  or
                </Text>
                <View style={dividers.line} />
              </View>

              {/* Google Sign In Button */}
              <Pressable
                style={[
                  buttons.base,
                  buttons.large,
                  buttons.secondary,
                  isLoading && buttons.disabled,
                ]}
                onPress={handleGoogleAuth}
                disabled={isLoading}
              >
                <Text style={buttonText.secondary}>Continue with Google</Text>
              </Pressable>
            </>
          )}

          {emailSent && (
            <View style={[flex.itemsCenter, { paddingVertical: spacing[8] }]}>
              <Text
                style={[
                  typography.h5,
                  {
                    color: colors.success[600],
                    textAlign: "center",
                    marginBottom: spacing[3],
                  },
                ]}
              >
                A sign-in link has been sent to {email}
              </Text>
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.text.secondary,
                    textAlign: "center",
                    lineHeight: 24,
                    marginBottom: spacing[6],
                  },
                ]}
              >
                Click the link in your email to complete sign-in. You can close
                this screen.
              </Text>
              <Pressable
                style={[buttons.base, buttons.medium, buttons.ghost]}
                onPress={() => {
                  setEmailSent(false);
                  setEmail("");
                }}
              >
                <Text style={buttonText.ghost}>Try with different email</Text>
              </Pressable>
            </View>
          )}

          {/* Footer */}
          <View style={[flex.itemsCenter, { marginTop: spacing[12] }]}>
            <Text
              style={[
                typography.caption,
                { textAlign: "center", color: colors.text.tertiary },
              ]}
            >
              Manage your devices and gentle alarms with ease
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
