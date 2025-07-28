import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { authClient } from "~/utils/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

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
        [{ text: "OK" }]
      );
    } catch (error: any) {
      Alert.alert(
        "Failed to Send Magic Link",
        error.message || "Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    console.log("Google auth button pressed");
    setIsLoading(true);
    try {
      console.log("Starting Google social sign-in...");
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "gently://", // Use expo scheme for callback
      });
      console.log("Google sign-in result:", result);
      router.replace("/");
    } catch (error: any) {
      console.error("Google auth error:", error);
      Alert.alert("Authentication Failed", error.message || "Failed to sign in with Google");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Welcome to Gently</Text>
            <Text style={styles.subtitle}>
              {emailSent ? "Check your email for a sign-in link" : "Sign in to your account"}
            </Text>
          </View>

          {!emailSent && (
            <>
              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.textInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter your email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                  />
                </View>

                <Pressable
                  style={[styles.primaryButton, isLoading && styles.disabledButton]}
                  onPress={handleEmailAuth}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Send Sign-In Link
                    </Text>
                  )}
                </Pressable>

                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Pressable
                  style={[styles.googleButton, isLoading && styles.disabledButton]}
                  onPress={handleGoogleAuth}
                  disabled={isLoading}
                >
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </Pressable>
              </View>
            </>
          )}

          {emailSent && (
            <View style={styles.emailSentContainer}>
              <Text style={styles.emailSentText}>
                A sign-in link has been sent to {email}
              </Text>
              <Text style={styles.emailSentDescription}>
                Click the link in your email to complete sign-in. You can close this screen.
              </Text>
              <Pressable
                style={styles.tryAgainButton}
                onPress={() => {
                  setEmailSent(false);
                  setEmail("");
                }}
              >
                <Text style={styles.tryAgainButtonText}>
                  Try with different email
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Manage your devices and gentle alarms with ease
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
  },
  form: {
    width: "100%",
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    color: "#1f2937",
  },
  primaryButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 24,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#d1d5db",
  },
  dividerText: {
    paddingHorizontal: 16,
    color: "#6b7280",
    fontSize: 14,
  },
  googleButton: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 24,
  },
  googleButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  emailSentContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emailSentText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#059669",
    textAlign: "center",
    marginBottom: 12,
  },
  emailSentDescription: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  tryAgainButton: {
    backgroundColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tryAgainButtonText: {
    color: "#3b82f6",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  footer: {
    alignItems: "center",
    marginTop: 48,
  },
  footerText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
});
