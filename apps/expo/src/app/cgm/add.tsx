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
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { SelectionOption } from "~/components/ui/SelectionGroup";
import { UnitOfMeasurePicker } from "~/components/cgm/UnitOfMeasurePicker";
import { FormField } from "~/components/ui/FormField";
import { Header } from "~/components/ui/Header";
import { SelectionGroup } from "~/components/ui/SelectionGroup";
import {
  buttons,
  buttonText,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";
import type { GlucoseUnit } from "~/utils/glucose-units";

type Region = "us" | "ous" | "jp";

const REGION_OPTIONS: SelectionOption<Region>[] = [
  { value: "us", label: "United States" },
  { value: "ous", label: "Outside US (Europe, etc.)" },
  { value: "jp", label: "Japan" },
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

  const [region, setRegion] = useState<Region | null>(null);
  const [unitOfMeasure, setUnitOfMeasure] = useState<GlucoseUnit>("mg_dl");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    if (region === null) next.region = "Select the region your CGM uses.";
    if (!username.trim()) next.username = "Enter your Dexcom Share username.";
    if (!password) next.password = "Enter your Dexcom Share password.";
    if (displayName.length > DISPLAY_NAME_MAX)
      next.displayName = `Keep it under ${DISPLAY_NAME_MAX} characters.`;
    setErrors(next);
    if (Object.keys(next).length > 0 || region === null) return { ok: false };
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

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header title="Connect Dexcom Share" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing[4] }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            style={[
              typography.body,
              {
                color: colors.text.secondary,
                marginBottom: spacing[6],
              },
            ]}
          >
            Use your Dexcom Share username (or email) and password — the same
            ones you use to sign in to the Dexcom Share / Follow app. Gently
            encrypts your password before storing it.
          </Text>

          <Text
            style={[
              typography.label,
              { marginBottom: spacing[2] },
              errors.region ? { color: colors.error[500] } : null,
            ]}
          >
            Region
            <Text style={{ color: colors.error[500] }}> *</Text>
          </Text>
          <SelectionGroup<Region>
            options={REGION_OPTIONS}
            value={region ?? ("" as Region)}
            onChange={(v) => {
              const next = Array.isArray(v) ? v[0] : v;
              if (next) {
                setRegion(next);
                setErrors((e) => ({ ...e, region: undefined }));
              }
            }}
            orientation="vertical"
            disabled={createMutation.isPending}
          />
          {errors.region && (
            <Text
              style={[
                typography.caption,
                {
                  color: colors.error[500],
                  marginTop: spacing[1],
                  marginBottom: spacing[2],
                },
              ]}
            >
              {errors.region}
            </Text>
          )}

          <View style={{ marginTop: spacing[6] }}>
            <Text style={[typography.label, { marginBottom: spacing[2] }]}>
              Glucose units
            </Text>
            <UnitOfMeasurePicker
              value={unitOfMeasure}
              onChange={setUnitOfMeasure}
            />
          </View>

          <View style={{ marginTop: spacing[6] }}>
            <FormField
              label="Username"
              required
              value={username}
              onChangeText={(t) => {
                setUsername(t);
                if (errors.username)
                  setErrors((e) => ({ ...e, username: undefined }));
              }}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              disabled={createMutation.isPending}
              error={errors.username}
            />
          </View>

          <FormField
            label="Password"
            required
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (errors.password)
                setErrors((e) => ({ ...e, password: undefined }));
            }}
            placeholder="Your Dexcom Share password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            disabled={createMutation.isPending}
            error={errors.password}
          />

          <FormField
            label="Name for this connection"
            value={displayName}
            onChangeText={(t) => {
              setDisplayName(t);
              if (errors.displayName)
                setErrors((e) => ({ ...e, displayName: undefined }));
            }}
            placeholder={placeholderName}
            helperText={`Optional — defaults to "${placeholderName}".`}
            autoCapitalize="words"
            maxLength={DISPLAY_NAME_MAX}
            disabled={createMutation.isPending}
            error={errors.displayName}
          />

          {submitError && (
            <Text
              style={[
                typography.body,
                {
                  color: colors.error[500],
                  marginTop: spacing[2],
                  marginBottom: spacing[4],
                },
              ]}
            >
              {submitError}
            </Text>
          )}

          <Pressable
            style={[
              buttons.base,
              buttons.large,
              buttons.primary,
              { marginTop: spacing[4] },
              createMutation.isPending && { opacity: 0.6 },
            ]}
            onPress={handleSubmit}
            disabled={createMutation.isPending}
            accessibilityLabel="Connect Dexcom Share"
          >
            <Text style={buttonText.primary}>
              {createMutation.isPending ? "Connecting…" : "Connect"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("internal server error")
  ) {
    return "Couldn't connect to Gently. Try again.";
  }
  if (msg.includes("zoderror")) {
    return "Some details look invalid. Double-check the form and try again.";
  }
  return "Something went wrong. Try again.";
}
