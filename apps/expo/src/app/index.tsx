import React, { useEffect, useRef, useState } from "react";
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
import { completeAppleSignIn, isAppleAuthAvailable } from "~/utils/appleAuth";

export default function LoginPage() {
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const otpRefs = useRef<TextInput[]>([]);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (session?.user) {
      router.replace("/dashboard");
    }
  }, [session]);

  const handleSendOTP = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    setIsLoading(true);
    console.log("🔐 Sending OTP to:", email.trim());

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: "sign-in",
      });

      console.log("✅ OTP send result:", result);
      setOtpSent(true);
    } catch (error: unknown) {
      console.error("❌ Failed to send OTP:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      Alert.alert(
        "Failed to Send OTP",
        `Could not send verification code to ${email.trim()}.\n\nError: ${errorMessage}\n\n🔧 For development: Make sure MailHog is running with 'docker-compose up'`,
        [
          { text: "Retry", onPress: () => void handleSendOTP() },
          { text: "Cancel", style: "cancel" },
        ],
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    // Clear any previous errors
    setOtpError("");

    const otpString = otp.join("");

    if (!otpString.trim()) {
      setOtpError("Please enter the verification code");
      return;
    }

    setOtpLoading(true);
    console.log("🔐 Verifying OTP:", {
      email: email.trim(),
      otpLength: otpString.length,
    });

    try {
      const { data, error } = await authClient.signIn.emailOtp({
        email: email.trim(),
        otp: otpString,
      });

      console.log("🔐 OTP verification result:", { data, error });

      if (error) {
        console.error("❌ OTP verification failed:", error);

        const errorMessage = error.message ?? "Unknown error occurred";

        // Handle specific error messages
        if (errorMessage.toLowerCase().includes("expired")) {
          setOtpError("This code has expired. Please request a new one.");
        } else if (
          errorMessage.toLowerCase().includes("invalid") ||
          errorMessage.toLowerCase().includes("incorrect") ||
          error.code === "INVALID_OTP"
        ) {
          setOtpError("Invalid verification code. Please check and try again.");
        } else if (errorMessage.toLowerCase().includes("too many attempts")) {
          setOtpError("Too many attempts. Please request a new code.");
        } else {
          setOtpError(`Verification failed: ${errorMessage}`);
        }
        return; // Don't proceed to dashboard on error
      }

      console.log("✅ OTP verification successful:", data);
      router.replace("/dashboard");
    } catch (error: unknown) {
      console.error("❌ Unexpected error during OTP verification:", error);
      setOtpError("An unexpected error occurred. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only allow numeric input
    if (value && !/^\d$/.test(value)) return;

    // Clear error when user starts typing
    setOtpError("");

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next field when digit is entered
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (value && newOtp.every((digit) => digit !== "")) {
      // Small delay to ensure state is updated
      setTimeout(() => {
        void handleVerifyOTP();
      }, 100);
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    // Move to previous field on backspace if current field is empty
    if (key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
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

  const handleAppleAuth = async () => {
    console.log("Apple auth button pressed");
    setIsLoading(true);

    try {
      // Check if Apple Sign In is available
      const isAvailable = await isAppleAuthAvailable();
      if (!isAvailable) {
        Alert.alert(
          "Apple Sign In Unavailable",
          "Apple Sign In is not available on this device.",
        );
        return;
      }

      // Complete Apple Sign In flow
      const result = await completeAppleSignIn();
      
      if (result.success) {
        console.log("✅ Apple Sign In successful, navigating to dashboard");
        router.replace("/dashboard");
      } else {
        console.error("❌ Apple Sign In failed:", result.error);
        Alert.alert("Sign In Failed", result.error ?? "Apple Sign In failed");
      }
    } catch (error: unknown) {
      console.error("Apple auth error:", error);
      Alert.alert(
        "Authentication Failed",
        (error as Error).message || "Failed to sign in with Apple",
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
              {otpSent
                ? "Enter the verification code from your email"
                : "Sign in to your account"}
            </Text>
          </View>

          {!otpSent && (
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

              {/* OTP Button */}
              <Pressable
                style={[
                  buttons.base,
                  buttons.large,
                  buttons.primary,
                  isLoading && buttons.disabled,
                ]}
                onPress={handleSendOTP}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.text.inverse} />
                ) : (
                  <Text style={buttonText.primary}>Send Verification Code</Text>
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

              {/* Apple Sign In Button */}
              {Platform.OS === 'ios' && (
                <Pressable
                  style={[
                    buttons.base,
                    buttons.large,
                    buttons.secondary,
                    isLoading && buttons.disabled,
                    { marginTop: spacing[4] }
                  ]}
                  onPress={handleAppleAuth}
                  disabled={isLoading}
                >
                  <Text style={buttonText.secondary}>Continue with Apple</Text>
                </Pressable>
              )}
            </>
          )}

          {/* OTP Input Screen */}
          {otpSent && (
            <View style={[flex.itemsCenter, { paddingVertical: spacing[4] }]}>
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
                We've sent a 6-digit verification code to {email}
              </Text>

              {/* OTP Input */}
              <View style={inputs.container}>
                <Text style={inputs.label}>Verification Code</Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: spacing[2],
                    gap: spacing[2],
                  }}
                >
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => {
                        if (ref) {
                          otpRefs.current[index] = ref;
                        }
                      }}
                      style={[
                        {
                          width: 50,
                          height: 56,
                          borderWidth: 2,
                          borderColor: digit
                            ? colors.primary[500]
                            : otpError
                              ? colors.error[500]
                              : colors.border.light,
                          borderRadius: 12,
                          textAlign: "center",
                          fontSize: 20,
                          fontWeight: "700",
                          color: colors.text.primary,
                          backgroundColor: colors.background.secondary,
                          shadowColor: colors.gray[900],
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 2,
                          elevation: 1,
                        },
                        otpLoading && { opacity: 0.6 },
                      ]}
                      value={digit}
                      onChangeText={(value) => handleOtpChange(index, value)}
                      onKeyPress={({ nativeEvent }) =>
                        handleOtpKeyPress(index, nativeEvent.key)
                      }
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                      editable={!otpLoading}
                      autoFocus={index === 0}
                    />
                  ))}
                </View>
              </View>

              {/* Error Message */}
              {otpError ? (
                <View
                  style={{ marginTop: spacing[2], marginBottom: spacing[4] }}
                >
                  <Text
                    style={[
                      typography.bodySmall,
                      {
                        color: colors.error[600],
                        textAlign: "center",
                        lineHeight: 20,
                        paddingHorizontal: spacing[4],
                      },
                    ]}
                  >
                    {otpError}
                  </Text>
                </View>
              ) : null}

              {/* Verify Button */}
              <Pressable
                style={[
                  buttons.base,
                  buttons.large,
                  buttons.primary,
                  otpLoading && buttons.disabled,
                ]}
                onPress={handleVerifyOTP}
                disabled={otpLoading}
              >
                {otpLoading ? (
                  <ActivityIndicator color={colors.text.inverse} />
                ) : (
                  <Text style={buttonText.primary}>Verify & Sign In</Text>
                )}
              </Pressable>

              {/* Back Button */}
              <Pressable
                style={[
                  buttons.base,
                  buttons.medium,
                  buttons.ghost,
                  { marginTop: spacing[4] },
                ]}
                onPress={() => {
                  setOtpSent(false);
                  setOtp(["", "", "", "", "", ""]);
                  setEmail("");
                  setOtpError("");
                }}
              >
                <Text style={buttonText.ghost}>Back to sign-in options</Text>
              </Pressable>

              {/* Resend Code */}
              <Pressable
                style={[
                  buttons.base,
                  buttons.medium,
                  buttons.ghost,
                  { marginTop: spacing[2] },
                ]}
                onPress={() => {
                  setOtpError("");
                  setOtp(["", "", "", "", "", ""]);
                  void handleSendOTP();
                }}
                disabled={isLoading}
              >
                <Text style={buttonText.ghost}>
                  {isLoading ? "Sending..." : "Resend code"}
                </Text>
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
