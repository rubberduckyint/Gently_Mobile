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
  const [isSignUp, setIsSignUp] = useState(false);

  const handleEmailAuth = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    setIsLoading(true);
    try {
      if (isSignUp) {
        await authClient.signUp.email({
          email: email.trim(),
          password: "temporary-password", // In a real app, you'd collect this
          name: email.split("@")[0] || "User", // Use email prefix as name
        });
        Alert.alert(
          "Success", 
          "Account created! Please check your email for verification.",
          [{ text: "OK", onPress: () => router.replace("/") }]
        );
      } else {
        await authClient.signIn.email({
          email: email.trim(),
          password: "temporary-password", // In a real app, you'd collect this
        });
        router.replace("/");
      }
    } catch (error: any) {
      Alert.alert(
        "Authentication Failed",
        error.message || `Failed to ${isSignUp ? "create account" : "sign in"}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      router.replace("/");
    } catch (error: any) {
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
              {isSignUp ? "Create your account" : "Sign in to your account"}
            </Text>
          </View>

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
                  {isSignUp ? "Create Account" : "Sign In"}
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

            <Pressable
              style={styles.switchButton}
              onPress={() => setIsSignUp(!isSignUp)}
              disabled={isLoading}
            >
              <Text style={styles.switchButtonText}>
                {isSignUp
                  ? "Already have an account? Sign in"
                  : "Don't have an account? Sign up"}
              </Text>
            </Pressable>
          </View>

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
  switchButton: {
    alignItems: "center",
  },
  switchButtonText: {
    color: "#3b82f6",
    fontSize: 14,
    fontWeight: "600",
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
