/**
 * Edit Dexcom source — region, password rotation, and glucose units.
 *
 * Security boundaries (per CLAUDE.md):
 * - Password is held in component state only for as long as it takes to
 *   submit the mutation. It is scrubbed immediately after the mutation
 *   resolves (success or failure), before navigation.
 * - The password is never logged.
 * - No persistence: nothing here writes to AsyncStorage or SecureStore.
 */

import { useEffect, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GentlyHeader } from "~/components/brand/GentlyHeader";
import { Shield } from "~/components/icons/Shield";
import { Segmented } from "~/components/ui/Segmented";
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

export default function SourceEditScreen() {
  const { sourceId } = useLocalSearchParams<{ sourceId: string }>();
  const queryClient = useQueryClient();

  // Editable fields — null until initialized from server data
  const [region, setRegion] = useState<Region | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [unitOfMeasure, setUnitOfMeasure] = useState<GlucoseUnit | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sourcesQ = useQuery({
    queryKey: ["dexcom", "list"],
    queryFn: () => trpc.dexcom.list.query(),
  });

  const source = sourcesQ.data?.find((s) => s.id === sourceId);

  // Initialize pickers from server once. The null guards are intentional:
  // region/unitOfMeasure start null so we can distinguish "not yet loaded"
  // from "user picked the same value as saved". Including them in the dep
  // array would reset user edits whenever the query re-fetches.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!source) return;
    if (region === null) setRegion(source.dexcom?.region ?? "us");
    if (unitOfMeasure === null) setUnitOfMeasure(source.unitOfMeasure ?? "mg_dl");
  }, [source]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const savedRegion: Region = source?.dexcom?.region ?? "us";
  const savedUnit: GlucoseUnit = source?.unitOfMeasure ?? "mg_dl";

  const regionDirty = region !== null && region !== savedRegion;
  const unitDirty = unitOfMeasure !== null && unitOfMeasure !== savedUnit;
  const passwordDirty = password.length > 0;
  const dirty = regionDirty || unitDirty || passwordDirty;
  // Region change requires re-auth against Dexcom — SRF enforces this server-side too,
  // but we gate the button to give immediate feedback before the round-trip.
  const canSave = dirty && !(regionDirty && !passwordDirty);

  const updateMutation = useMutation({
    mutationFn: (input: {
      sourceId: string;
      region?: Region;
      password?: string;
      unitOfMeasure?: GlucoseUnit;
    }) => trpc.dexcom.update.mutate(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dexcom", "list"] });
      setPassword(""); // scrub before navigation
      router.replace("/dashboard");
    },
    onError: (error) => {
      setPassword(""); // scrub on error too
      setSubmitError(mapMutationError(error));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (input: { sourceId: string; active: boolean }) =>
      trpc.dexcom.update.mutate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dexcom", "list"] });
      router.replace("/dashboard");
    },
    onError: (error: unknown) => {
      Alert.alert(
        "Couldn't disconnect",
        error instanceof Error ? error.message : "Please try again.",
      );
    },
  });

  function confirmDisconnect() {
    Alert.alert(
      "Disconnect Dexcom source",
      "Your Dexcom Share will stop syncing and alerts for this source will pause. You can reconnect later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => {
            if (sourceId) disconnectMutation.mutate({ sourceId, active: false });
          },
        },
      ],
    );
  }

  function handleSave() {
    setSubmitError(null);
    if (!canSave || !sourceId) return;
    const payload: {
      sourceId: string;
      region?: Region;
      password?: string;
      unitOfMeasure?: GlucoseUnit;
    } = { sourceId };
    if (regionDirty && region) payload.region = region;
    if (passwordDirty) payload.password = password;
    if (unitDirty && unitOfMeasure) payload.unitOfMeasure = unitOfMeasure;
    updateMutation.mutate(payload);
  }

  const isPending = updateMutation.isPending || disconnectMutation.isPending;

  const inputStyle = {
    ...typographyV2.body,
    color: tokens.color.inkH,
    height: 44,
    paddingHorizontal: 0,
  };

  if (sourcesQ.isLoading || !source) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }} edges={["top", "bottom"]}>
        <GentlyHeader showBack onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          {sourcesQ.isLoading ? (
            <ActivityIndicator size="large" color={tokens.color.cyan} />
          ) : (
            <Text style={[typographyV2.body, { color: tokens.color.ink2 }]}>
              Source not found.
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }} edges={["top", "bottom"]}>
      <GentlyHeader showBack onBack={() => router.back()} />

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
            Dexcom Source
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
            Update your Dexcom Share connection.
          </Text>

          {/* Region card */}
          <View style={[cardStyle, { marginBottom: tokens.spacing.section }]}>
            <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3, marginBottom: 12 }]}>
              Region
            </Text>
            <Segmented<Region>
              value={region ?? savedRegion}
              onChange={(v) => setRegion(v)}
              options={REGION_OPTIONS}
              disabled={isPending}
            />
          </View>

          {/* Username card — read-only, username is account identity */}
          <View style={[cardStyle, { marginBottom: tokens.spacing.section }]}>
            <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3, marginBottom: 4 }]}>
              Username
            </Text>
            <Text style={[typographyV2.body, { fontSize: 12, color: tokens.color.ink3, marginBottom: 8 }]}>
              Dexcom Share account
            </Text>
            <Text style={[typographyV2.body, { color: tokens.color.ink2 }]}>
              {source.dexcom?.username ?? "—"}
            </Text>
          </View>

          {/* Password card */}
          <View style={[cardStyle, { marginBottom: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3 }]}>
                Password
              </Text>
              <View style={{ width: 140 }}>
                <Segmented<"hide" | "show">
                  value={showPassword ? "show" : "hide"}
                  onChange={(v) => setShowPassword(v === "show")}
                  options={SHOW_HIDE_OPTIONS}
                  disabled={isPending}
                />
              </View>
            </View>
            <TextInput
              style={inputStyle}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter to update"
              placeholderTextColor={tokens.color.ink3}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isPending}
            />
            <View
              style={{
                height: 1,
                backgroundColor: tokens.color.rule2,
                marginTop: 6,
                marginBottom: 8,
              }}
            />
            <Text style={[typographyV2.body, { fontSize: 13, color: tokens.color.ink3, lineHeight: 18 }]}>
              Leave blank to keep current. Required when changing region.
            </Text>
          </View>

          {/* Trust line — outside the card, matches cgm/add */}
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
              Encrypted with AES-256-GCM. Your password is never returned by our API.
            </Text>
          </View>

          {/* Glucose units card */}
          <View style={[cardStyle, { marginBottom: tokens.spacing.section }]}>
            <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3, marginBottom: 12 }]}>
              Glucose units
            </Text>
            <Segmented<GlucoseUnit>
              value={unitOfMeasure ?? savedUnit}
              onChange={(v) => setUnitOfMeasure(v)}
              options={UNIT_OPTIONS}
              disabled={isPending}
            />
          </View>

          {/* Inline error pill */}
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
              opacity: !canSave || updateMutation.isPending ? 0.4 : 1,
              marginBottom: tokens.spacing.section,
            }}
            onPress={handleSave}
            disabled={!canSave || updateMutation.isPending}
            accessibilityLabel="Save changes"
          >
            {updateMutation.isPending ? (
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
                Save changes
              </Text>
            )}
          </Pressable>

          {/* Disconnect — destructive secondary CTA */}
          <Pressable
            style={{
              backgroundColor: tokens.color.coralBg,
              borderRadius: tokens.radius.cta,
              paddingVertical: 16,
              alignItems: "center",
              opacity: disconnectMutation.isPending ? 0.6 : 1,
            }}
            onPress={confirmDisconnect}
            disabled={disconnectMutation.isPending}
            accessibilityLabel="Disconnect Dexcom source"
          >
            {disconnectMutation.isPending ? (
              <ActivityIndicator color={tokens.color.coral} />
            ) : (
              <Text
                style={{
                  ...typographyV2.body,
                  fontSize: 16,
                  fontWeight: "600",
                  color: tokens.color.coral,
                }}
              >
                Disconnect Dexcom source
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
