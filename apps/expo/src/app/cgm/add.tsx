/**
 * Connect Dexcom Share — credential entry form.
 *
 * Security boundaries (per CLAUDE.md):
 * - Password is held in component state only for as long as it takes to
 *   submit the mutation. It is scrubbed immediately after the mutation
 *   resolves (success or failure), before navigation.
 * - The password is never logged. Error paths intentionally avoid logging
 *   form state. If you add a debug log here, redact the password field
 *   explicitly.
 * - No persistence: nothing in this file writes to AsyncStorage,
 *   SecureStore, or any other client-side store. The mutation is the only
 *   sink, and SRF stores the password AES-256-GCM-encrypted.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { GentlyHeader } from "~/components/brand/GentlyHeader";
import { Shield } from "~/components/icons/Shield";
import { Segmented } from "~/components/ui/Segmented";
import { StepIndicator } from "~/components/ui/StepIndicator";
import { tokens } from "~/styles/tokens";
import { typographyV2 } from "~/styles/typographyV2";
import { trpc } from "~/utils/api";
import type { GlucoseUnit } from "~/utils/glucose-units";

type Region = "us" | "ous" | "jp";

const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: "us", label: "US" },
  { value: "ous", label: "Outside US" },
  { value: "jp", label: "Japan" },
];

const UNIT_OPTIONS: { value: GlucoseUnit; label: string }[] = [
  { value: "mg_dl", label: "mg/dL" },
  { value: "mmol_l", label: "mmol/L" },
];

const SHOW_HIDE_OPTIONS: { value: "hide" | "show"; label: string }[] = [
  { value: "hide", label: "Hide" },
  { value: "show", label: "Show" },
];

const DISPLAY_NAME_MAX = 50;

interface FormErrors {
  region?: string;
  username?: string;
  password?: string;
  displayName?: string;
}

export default function ConnectDexcomPage() {
  const queryClient = useQueryClient();

  const [region, setRegion] = useState<Region>("us");
  const [unitOfMeasure, setUnitOfMeasure] = useState<GlucoseUnit>("mg_dl");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (input: {
      region: Region;
      username: string;
      password: string;
      displayName?: string;
      unitOfMeasure: GlucoseUnit;
    }) => trpc.dexcom.create.mutate(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dexcom", "list"] });
      router.replace("/cgm");
    },
  });

  const validate = (): { ok: true; region: Region } | { ok: false } => {
    const next: FormErrors = {};
    if (!username.trim()) next.username = "Enter your Dexcom Share username.";
    if (!password) next.password = "Enter your Dexcom Share password.";
    if (displayName.length > DISPLAY_NAME_MAX)
      next.displayName = `Keep it under ${DISPLAY_NAME_MAX} characters.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return { ok: false };
    return { ok: true, region };
  };

  const handleSubmit = () => {
    setSubmitError(null);
    const validation = validate();
    if (!validation.ok) return;

    const payload = {
      region: validation.region,
      username: username.trim(),
      password,
      displayName: displayName.trim() ? displayName.trim() : undefined,
      unitOfMeasure,
    };

    createMutation.mutate(payload, {
      onSettled: (_data, error) => {
        // Scrub the password from local state immediately, regardless of
        // outcome. Don't wait for unmount — the route may stay mounted
        // briefly during navigation.
        setPassword("");

        if (error) {
          setSubmitError(mapMutationError(error));
        }
      },
    });
  };

  const placeholderName = username.trim()
    ? `Dexcom (${username.trim()})`
    : "Dexcom (your-username)";

  const inputStyle = {
    ...typographyV2.body,
    color: tokens.color.inkH,
    height: 44,
    paddingHorizontal: 0,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }} edges={["top", "bottom"]}>
      <GentlyHeader showBack onBack={() => router.back()} />

      <View style={{ alignItems: "center", marginTop: 10, marginBottom: 6 }}>
        <StepIndicator current={1} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: tokens.spacing.pageHorizontal,
            paddingTop: 20,
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* H1 */}
          <Text
            style={[
              typographyV2.h1Onboarding,
              { color: tokens.color.inkH, marginBottom: 8 },
            ]}
          >
            Connect Dexcom Share
          </Text>

          {/* Subtitle */}
          <Text
            style={[
              typographyV2.body,
              {
                color: tokens.color.ink2,
                lineHeight: 22,
                marginBottom: tokens.spacing.section,
              },
            ]}
          >
            Use the same credentials as the Dexcom Share / Follow app.
          </Text>

          {/* Region card */}
          <View style={[cardStyle, { marginBottom: tokens.spacing.section }]}>
            <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3, marginBottom: 12 }]}>
              Region
            </Text>
            <Segmented<Region>
              value={region}
              onChange={(v) => {
                setRegion(v);
                setErrors((e) => ({ ...e, region: undefined }));
              }}
              options={REGION_OPTIONS}
              disabled={createMutation.isPending}
            />
            {errors.region && (
              <Text style={[typographyV2.body, { fontSize: 13, color: tokens.color.coral, marginTop: 8 }]}>
                {errors.region}
              </Text>
            )}
          </View>

          {/* Username card */}
          <View style={[cardStyle, { marginBottom: tokens.spacing.section }]}>
            <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3, marginBottom: 12 }]}>
              Username
            </Text>
            <TextInput
              style={inputStyle}
              value={username}
              onChangeText={(t) => {
                setUsername(t);
                if (errors.username) setErrors((e) => ({ ...e, username: undefined }));
              }}
              placeholder="you@example.com"
              placeholderTextColor={tokens.color.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!createMutation.isPending}
            />
            <View
              style={{
                height: 1,
                backgroundColor: errors.username ? tokens.color.coral : tokens.color.rule2,
                marginTop: 6,
              }}
            />
            {errors.username ? (
              <Text style={[typographyV2.body, { fontSize: 13, color: tokens.color.coral, marginTop: 6 }]}>
                {errors.username}
              </Text>
            ) : (
              <Text style={[typographyV2.body, { fontSize: 13, color: tokens.color.ink3, marginTop: 6 }]}>
                Use your Dexcom Share username (or email).
              </Text>
            )}
          </View>

          {/* Password card */}
          <View style={[cardStyle, { marginBottom: tokens.spacing.section }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3 }]}>
                Password
              </Text>
              <View style={{ width: 140 }}>
                <Segmented<"hide" | "show">
                  value={showPassword ? "show" : "hide"}
                  onChange={(v) => setShowPassword(v === "show")}
                  options={SHOW_HIDE_OPTIONS}
                  disabled={createMutation.isPending}
                />
              </View>
            </View>
            <TextInput
              style={inputStyle}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
              }}
              placeholder="Your Dexcom Share password"
              placeholderTextColor={tokens.color.ink3}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!createMutation.isPending}
            />
            <View
              style={{
                height: 1,
                backgroundColor: errors.password ? tokens.color.coral : tokens.color.rule2,
                marginTop: 6,
              }}
            />
            {errors.password && (
              <Text style={[typographyV2.body, { fontSize: 13, color: tokens.color.coral, marginTop: 6 }]}>
                {errors.password}
              </Text>
            )}
          </View>

          {/* Trust line */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 8,
              marginBottom: tokens.spacing.section,
            }}
          >
            <Shield size={16} color={tokens.color.ink3} strokeWidth={1.6} />
            <Text style={[typographyV2.body, { fontSize: 13, color: tokens.color.ink3, flex: 1, lineHeight: 18 }]}>
              {"Encrypted with AES-256-GCM. Your password is never returned by our API. "}
              <Text style={{ color: tokens.color.cyanDeep }}>Privacy details</Text>
            </Text>
          </View>

          {/* Display name card (optional) */}
          <View style={[cardStyle, { marginBottom: tokens.spacing.section }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3 }]}>
                Name for this connection
              </Text>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: tokens.radius.pill,
                  backgroundColor: tokens.color.bgDeep,
                }}
              >
                <Text style={[typographyV2.body, { fontSize: 11, color: tokens.color.ink3 }]}>
                  optional
                </Text>
              </View>
            </View>
            <TextInput
              style={inputStyle}
              value={displayName}
              onChangeText={(t) => {
                setDisplayName(t);
                if (errors.displayName) setErrors((e) => ({ ...e, displayName: undefined }));
              }}
              placeholder={placeholderName}
              placeholderTextColor={tokens.color.ink3}
              autoCapitalize="words"
              maxLength={DISPLAY_NAME_MAX}
              editable={!createMutation.isPending}
            />
            <View
              style={{
                height: 1,
                backgroundColor: errors.displayName ? tokens.color.coral : tokens.color.rule2,
                marginTop: 6,
              }}
            />
            {errors.displayName ? (
              <Text style={[typographyV2.body, { fontSize: 13, color: tokens.color.coral, marginTop: 6 }]}>
                {errors.displayName}
              </Text>
            ) : (
              <Text style={[typographyV2.body, { fontSize: 13, color: tokens.color.ink3, marginTop: 6 }]}>
                {`Defaults to "${placeholderName}".`}
              </Text>
            )}
          </View>

          {/* Glucose units card */}
          <View style={[cardStyle, { marginBottom: tokens.spacing.section }]}>
            <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3, marginBottom: 12 }]}>
              Glucose units
            </Text>
            <Segmented<GlucoseUnit>
              value={unitOfMeasure}
              onChange={setUnitOfMeasure}
              options={UNIT_OPTIONS}
              disabled={createMutation.isPending}
            />
          </View>

          {/* Inline error card */}
          {submitError && (
            <View
              style={{
                backgroundColor: tokens.color.coralBg,
                borderRadius: tokens.radius.list,
                padding: 12,
                marginBottom: tokens.spacing.section,
              }}
            >
              <Text style={[typographyV2.body, { color: tokens.color.coral }]}>
                {submitError}
              </Text>
            </View>
          )}

          {/* Primary CTA */}
          <Pressable
            style={{
              backgroundColor: tokens.color.cyan,
              borderRadius: tokens.radius.cta,
              paddingVertical: 16,
              alignItems: "center",
              ...tokens.shadow.primary,
              opacity: createMutation.isPending ? 0.6 : 1,
            }}
            onPress={handleSubmit}
            disabled={createMutation.isPending}
            accessibilityLabel="Connect Dexcom Share"
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                style={{
                  ...typographyV2.body,
                  fontSize: 16,
                  fontWeight: "600",
                  color: "#fff",
                }}
              >
                Connect
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const cardStyle = {
  backgroundColor: tokens.color.card,
  borderRadius: tokens.radius.card,
  padding: tokens.spacing.cardInternal,
  ...tokens.shadow.card,
} as const;

function mapMutationError(error: unknown): string {
  // Intentionally narrow — never include the request body in the surfaced
  // string. Match a few well-known tRPC error codes from the message.
  const raw = error instanceof Error ? error.message : "";
  const msg = raw.toLowerCase();
  if (msg.includes("unauthorized")) {
    Alert.alert(
      "Session expired",
      "Please sign in again.",
      [{ text: "OK", onPress: () => router.replace("/") }],
      { cancelable: false },
    );
    return "Please sign in again.";
  }
  if (
    msg.includes("accountpasswordinvalid") ||
    msg.includes("invalid credentials") ||
    msg.includes("login failed")
  ) {
    return "Username or password is incorrect.";
  }
  if (msg.includes("region") || msg.includes("wrong region")) {
    return "That doesn't look like the right region. Try a different one.";
  }
  if (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("internal server error")
  ) {
    return "Couldn't connect to Gently. Try again.";
  }
  return "Something went wrong. Try again.";
}
