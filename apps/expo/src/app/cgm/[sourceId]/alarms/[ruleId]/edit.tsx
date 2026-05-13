import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Bell, Chev, Info, Pulse } from "~/components/icons";
import { LevelSlider } from "~/components/cgm/AlarmDetail/LevelSlider";
import { LightColorPicker } from "~/components/cgm/AlarmDetail/LightColorPicker";
import { Stepper } from "~/components/ui/Stepper";
import { tabularNums, typographyV2 } from "~/styles/typographyV2";
import { tokens } from "~/styles/tokens";
import { trpc } from "~/utils/api";
import type { RouterOutputs } from "~/utils/api";
import { toMmolL } from "~/utils/glucose-units";

type Rule = RouterOutputs["rule"]["listForSource"][number];

interface MutationInput {
  ruleId: string;
  enabled?: boolean;
  threshold?: number;
  vibrationLevel?: number;
  audioLevel?: number;
  ledColor?: string | null;
  durationSec?: number;
  repeatAfterMin?: number | null;
  escalateAfterMin?: number | null;
}

const VIBRATION_LABELS: [string, string, string, string, string] = [
  "Off", "Soft", "Medium", "Strong", "Max",
];
const AUDIO_LABELS: [string, string, string, string, string] = [
  "Silent", "Quiet", "Mid", "Loud", "Loudest",
];

const KIND_LABELS: Record<string, string> = {
  low: "Low",
  critical_low: "Critical Low",
  high: "High",
  falling_fast: "Falling fast",
  rising_fast: "Rising fast",
  stale: "Stale reading",
  spike_above: "Spike above",
  sustained_above: "Sustained above",
  post_meal_unresolved: "Post-meal unresolved",
  tir_breach: "Time-in-range breach",
};

function kindToTint(kind: string): { bg: string; fg: string } {
  switch (kind) {
    case "critical_low": return { bg: tokens.color.coralBg, fg: tokens.color.coral };
    case "low":          return { bg: tokens.color.cyanBg, fg: tokens.color.cyanDeep };
    case "high":
    case "spike_above":
    case "sustained_above": return { bg: tokens.color.amberBg, fg: tokens.color.amber };
    case "falling_fast":
    case "rising_fast":  return { bg: tokens.color.amberBg, fg: tokens.color.amber };
    default:             return { bg: tokens.color.bg, fg: tokens.color.ink2 };
  }
}

function aboveOrBelow(kind: string): "ALERT WHEN ABOVE" | "ALERT WHEN BELOW" {
  switch (kind) {
    case "high":
    case "spike_above":
    case "sustained_above":
    case "rising_fast":   return "ALERT WHEN ABOVE";
    default:              return "ALERT WHEN BELOW";
  }
}

function tierDescription(kind: string): string {
  switch (kind) {
    case "critical_low":         return "Hardware-enforced safety floor";
    case "low":                  return "Sustained low blood sugar";
    case "high":                 return "Sustained high blood sugar";
    case "falling_fast":         return "Rapid drop in glucose";
    case "rising_fast":          return "Rapid rise in glucose";
    case "stale":                return "No reading received recently";
    case "spike_above":          return "Sharp rise above threshold";
    case "sustained_above":      return "Held above threshold";
    case "post_meal_unresolved": return "Glucose not recovering after meal";
    case "tir_breach":           return "Time-in-range below target";
    default:                     return kind;
  }
}

// Per plan Step 2 — tier-aware stepper bounds (all values stored as mg/dL)
function thresholdBounds(kind: string): { min: number; max: number; step: number } {
  switch (kind) {
    case "critical_low":     return { min: 50, max: 70, step: 1 };
    case "low":              return { min: 50, max: 100, step: 1 };
    case "high":
    case "spike_above":
    case "sustained_above":  return { min: 100, max: 400, step: 5 };
    case "falling_fast":
    case "rising_fast":      return { min: 50, max: 200, step: 5 };
    default:                 return { min: 50, max: 400, step: 5 };
  }
}

// Debounces fn calls; the ref keeps the latest fn without resetting the timer.
function useDebouncedFn<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number,
): T {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    ((...args: never[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fnRef.current(...args), delayMs);
    }) as T,
    [delayMs],
  );
}

export default function EditAlarmScreen() {
  const { sourceId, ruleId } = useLocalSearchParams<{
    sourceId: string;
    ruleId: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const rulesQ = useQuery({
    queryKey: ["rule", "listForSource", sourceId],
    queryFn: () => trpc.rule.listForSource.query({ sourceId }),
    enabled: !!sourceId,
  });

  const sourcesQ = useQuery({
    queryKey: ["dexcom", "list"],
    queryFn: () => trpc.dexcom.list.query(),
  });

  const serverRule = rulesQ.data?.find((r) => r.id === ruleId);
  const source = sourcesQ.data?.find((s) => s.id === sourceId);

  const [local, setLocal] = useState<Rule | null>(null);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // One-shot initialization from first server load; local owns state after that.
  useEffect(() => {
    if (serverRule && !local) setLocal(serverRule);
  }, [serverRule, local]);

  // Clear "saved" status after 2s.
  useEffect(() => {
    if (savingState !== "saved") return;
    const t = setTimeout(() => setSavingState("idle"), 2000);
    return () => clearTimeout(t);
  }, [savingState]);

  const testRule = useMutation({
    mutationFn: (input: {
      ruleId: string;
      override?: {
        vibrationLevel?: number;
        audioLevel?: number;
        ledColor?: string | null;
        durationSec?: number;
      };
    }) => trpc.rule.test.mutate(input),
  });

  const update = useMutation({
    mutationFn: (input: MutationInput) => trpc.rule.update.mutate(input),
    onMutate: () => {
      setSavingState("saving");
      setErrorMsg(null);
    },
    onError: () => {
      // Revert to last server-confirmed value on failure.
      if (serverRule) setLocal(serverRule);
      setSavingState("error");
      setErrorMsg("Couldn't save. Try again.");
    },
    onSuccess: () => {
      setSavingState("saved");
      void queryClient.invalidateQueries({
        queryKey: ["rule", "listForSource", sourceId],
      });
    },
  });

  function applyChange(patch: Partial<Rule>) {
    if (!local) return;
    setLocal({ ...local, ...patch });
    // Strip immutable fields and forward only the mutable patch to the mutation.
    update.mutate({
      ruleId: local.id,
      ...(patch as Omit<MutationInput, "ruleId">),
    });
  }

  // Threshold stepper: immediate local update, debounced save to batch rapid ± presses.
  const debouncedThresholdSave = useDebouncedFn((mgDl: number) => {
    if (!local) return;
    update.mutate({ ruleId: local.id, threshold: mgDl });
  }, 400);

  function handleThresholdChange(nextMgDl: number) {
    if (!local) return;
    setLocal({ ...local, threshold: nextMgDl }); // immediate UI
    debouncedThresholdSave(nextMgDl);             // debounced save
  }

  if (rulesQ.isLoading || sourcesQ.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <Text
          style={[
            typographyV2.body,
            { color: tokens.color.ink3, padding: tokens.spacing.pageHorizontal },
          ]}
        >
          Loading…
        </Text>
      </SafeAreaView>
    );
  }

  if (!serverRule || !source || !local) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <Text
          style={[
            typographyV2.body,
            { color: tokens.color.ink3, padding: tokens.spacing.pageHorizontal },
          ]}
        >
          Alarm not found.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      {/* App row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: tokens.spacing.pageHorizontal,
          paddingVertical: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityLabel="Back"
        >
          <Chev size={24} color={tokens.color.ink} strokeWidth={2} />
        </Pressable>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3 }]}>
            ALARM
          </Text>
          <Text style={[typographyV2.h1AlarmEdit, { color: tokens.color.inkH }]}>
            {KIND_LABELS[serverRule.kind] ?? serverRule.kind}
          </Text>
        </View>

        {/* Save indicator replaces the old Save button */}
        <View style={{ width: 60, alignItems: "flex-end", paddingVertical: 12 }}>
          {savingState === "saving" && (
            <Text style={{ fontSize: 12, color: tokens.color.ink3 }}>Saving…</Text>
          )}
          {savingState === "saved" && (
            <Text style={{ fontSize: 12, color: tokens.color.ink3 }}>Saved</Text>
          )}
          {savingState === "error" && (
            <Text style={{ fontSize: 12, color: tokens.color.coral }}>
              Couldn't save
            </Text>
          )}
        </View>
      </View>

      {/* Body */}
      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.pageHorizontal, gap: 12 }}
      >
        {/* Inline error pill shown below threshold card when a save fails */}
        {errorMsg && (
          <View
            style={{
              backgroundColor: tokens.color.coralBg,
              borderRadius: tokens.radius.list,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={[typographyV2.body, { color: tokens.color.coral, fontSize: 13 }]}>
              {errorMsg}
            </Text>
          </View>
        )}

        <ThresholdHeroCard
          kind={serverRule.kind}
          local={local}
          onEnabledChange={(v) => applyChange({ enabled: v })}
          onThresholdChange={handleThresholdChange}
          isMmol={source.unitOfMeasure === "mmol_l"}
        />

        {/* Vibration */}
        <View
          style={[
            tokens.shadow.card,
            {
              backgroundColor: tokens.color.card,
              borderRadius: tokens.radius.list,
              padding: tokens.spacing.cardInternal,
            },
          ]}
        >
          <Text
            style={[typographyV2.eyebrow, { color: tokens.color.ink3, marginBottom: 14 }]}
          >
            VIBRATION
          </Text>
          <LevelSlider
            labels={VIBRATION_LABELS}
            accent={tokens.color.cyanDeep}
            value={local.vibrationLevel ?? 0}
            onChange={(v) => applyChange({ vibrationLevel: v })}
            readOut={{
              value: String(local.vibrationLevel ?? 0),
              label: VIBRATION_LABELS[local.vibrationLevel ?? 0] ?? "",
            }}
          />
        </View>

        {/* Volume */}
        <View
          style={[
            tokens.shadow.card,
            {
              backgroundColor: tokens.color.card,
              borderRadius: tokens.radius.list,
              padding: tokens.spacing.cardInternal,
            },
          ]}
        >
          <Text
            style={[typographyV2.eyebrow, { color: tokens.color.ink3, marginBottom: 14 }]}
          >
            VOLUME
          </Text>
          <LevelSlider
            labels={AUDIO_LABELS}
            accent={tokens.color.cyanDeep}
            value={local.audioLevel ?? 0}
            onChange={(v) => applyChange({ audioLevel: v })}
            readOut={{
              value: String(local.audioLevel ?? 0),
              label: AUDIO_LABELS[local.audioLevel ?? 0] ?? "",
            }}
          />
        </View>

        {/* Light color */}
        <View
          style={[
            tokens.shadow.card,
            {
              backgroundColor: tokens.color.card,
              borderRadius: tokens.radius.list,
              padding: 14,
            },
          ]}
        >
          <LightColorPicker
            value={local.ledColor ?? null}
            onChange={(c) => applyChange({ ledColor: c })}
          />
        </View>

        {/* Test alarm CTA */}
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => {
              testRule.mutate({
                ruleId: serverRule.id,
                override: {
                  vibrationLevel: local.vibrationLevel ?? 0,
                  audioLevel: local.audioLevel ?? 0,
                  ledColor: local.ledColor ?? null,
                  durationSec: local.durationSec ?? 10,
                },
              });
            }}
            disabled={testRule.isPending}
            style={[
              tokens.shadow.primary,
              {
                backgroundColor: tokens.color.cyan,
                borderRadius: tokens.radius.cta,
                paddingVertical: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: testRule.isPending ? 0.7 : 1,
              },
            ]}
            accessibilityLabel="Test this alarm"
          >
            {testRule.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Pulse size={18} color="white" />
                <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                  Test this alarm
                </Text>
              </>
            )}
          </Pressable>

          <Text
            style={[
              typographyV2.body,
              { color: tokens.color.ink3, fontSize: 13, textAlign: "center" },
            ]}
          >
            Sends the pattern above to your bracelet right now.
          </Text>

          {testRule.error && (
            <Text
              style={[
                typographyV2.body,
                { color: tokens.color.coral, fontSize: 13, textAlign: "center" },
              ]}
            >
              {/rate_limit|too many/i.test(testRule.error.message)
                ? "Too many test alarms. Try again in a minute."
                : `Test failed: ${testRule.error.message}`}
            </Text>
          )}
        </View>

        {/* Timing */}
        <View
          style={[
            tokens.shadow.card,
            {
              backgroundColor: tokens.color.card,
              borderRadius: tokens.radius.list,
              paddingHorizontal: tokens.spacing.cardInternal,
            },
          ]}
        >
          <TimingRow
            label="Duration"
            value={local.durationSec}
            onChange={(v) => applyChange({ durationSec: v ?? 10 })}
            nullable={false}
            suffix="sec"
          />
          <View style={{ height: 1, backgroundColor: tokens.color.rule }} />
          <TimingRow
            label="Repeat after"
            value={local.repeatAfterMin ?? null}
            onChange={(v) => applyChange({ repeatAfterMin: v })}
            nullable
            suffix="min"
          />
          <View style={{ height: 1, backgroundColor: tokens.color.rule }} />
          <TimingRow
            label="Escalate after"
            value={local.escalateAfterMin ?? null}
            onChange={(v) => applyChange({ escalateAfterMin: v })}
            nullable
            suffix="min"
          />
        </View>

        {/* Footer */}
        <Text
          style={[
            typographyV2.body,
            {
              color: tokens.color.ink3,
              fontSize: 12,
              textAlign: "center",
              marginTop: 4,
              marginBottom: 16,
            },
          ]}
        >
          Secondary alert only. Keep your Dexcom alerts on — Gently is here to make
          sure you notice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ThresholdHeroCard({
  kind,
  local,
  onEnabledChange,
  onThresholdChange,
  isMmol,
}: {
  kind: string;
  local: Rule;
  onEnabledChange: (enabled: boolean) => void;
  onThresholdChange: (mgDl: number) => void;
  isMmol: boolean;
}) {
  const tint = kindToTint(kind);
  const { min, max, step } = thresholdBounds(kind);
  const rawValue = local.threshold ?? min;

  // mmol/L mode: display is converted; storage stays mg/dL.
  // Stepper operates in mg/dL throughout — onChange already delivers mg/dL — so no
  // back-conversion is needed; only the rendered label changes.
  const displayValue = isMmol ? toMmolL(rawValue).toFixed(1) : String(rawValue);

  return (
    <View
      style={[
        tokens.shadow.card,
        {
          backgroundColor: tokens.color.card,
          borderRadius: tokens.radius.cardLarge,
          padding: tokens.spacing.contentHorizontal,
          gap: 20,
        },
      ]}
    >
      {/* Top row: tier badge | text stack | enabled toggle */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {/* Tier badge */}
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: tint.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bell size={18} color={tint.fg} strokeWidth={1.8} />
        </View>

        {/* Text stack */}
        <View style={{ flex: 1 }}>
          <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3 }]}>
            {aboveOrBelow(kind)}
          </Text>
          <Text style={[typographyV2.body, { color: tokens.color.ink2 }]}>
            {tierDescription(kind)}
          </Text>
        </View>

        {/* Enabled toggle */}
        <Switch
          value={local.enabled}
          onValueChange={onEnabledChange}
          trackColor={{ false: "#D2D8E0", true: tokens.color.cyanDeep }}
          style={{ width: 52, height: 32 }}
          accessibilityLabel="Enable alarm"
        />
      </View>

      {/* Stepper row */}
      <View style={{ alignItems: "center" }}>
        <Stepper
          value={rawValue}
          onChange={onThresholdChange}
          min={min}
          max={max}
          step={step}
        >
          <Text
            style={[
              typographyV2.threshold,
              { color: tokens.color.inkH, minWidth: 72, textAlign: "center", fontVariant: tabularNums },
            ]}
          >
            {displayValue}
          </Text>
        </Stepper>
      </View>

      {/* Critical-low floor callout — hardware enforces 50 mg/dL minimum */}
      {kind === "critical_low" && (
        <View
          style={{
            backgroundColor: tokens.color.cyanBgSoft,
            borderRadius: tokens.radius.list,
            padding: 14,
            flexDirection: "row",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <Info size={18} color={tokens.color.cyanDeep} strokeWidth={1.8} />
          <Text style={[typographyV2.body, { color: tokens.color.ink2, flex: 1 }]}>
            The bracelet hardware enforces a{" "}
            <Text style={{ fontWeight: "600" }}>50 mg/dL floor</Text> on
            critical-low. You can&apos;t set this any lower — it&apos;s a safety stop.
          </Text>
        </View>
      )}
    </View>
  );
}

function TimingRow({
  label,
  value,
  onChange,
  nullable,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  nullable?: boolean;
  suffix: string;
}) {
  const [localDraft, setLocalDraft] = useState(value === null ? "" : String(value));

  useEffect(() => {
    setLocalDraft(value === null ? "" : String(value));
  }, [value]);

  function commit() {
    if (localDraft === "" && nullable) {
      onChange(null);
      return;
    }
    const n = parseInt(localDraft, 10);
    if (Number.isNaN(n)) {
      setLocalDraft(value === null ? "" : String(value));
      return;
    }
    onChange(n);
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14 }}>
      <Text style={[typographyV2.body, { flex: 1, color: tokens.color.ink }]}>{label}</Text>
      <TextInput
        value={localDraft}
        onChangeText={setLocalDraft}
        onBlur={commit}
        keyboardType="number-pad"
        placeholder={nullable ? "Off" : "0"}
        placeholderTextColor={tokens.color.ink3}
        style={{ minWidth: 60, textAlign: "right", color: tokens.color.ink, fontSize: 16 }}
      />
      <Text
        style={[typographyV2.body, { color: tokens.color.ink3, marginLeft: 4 }]}
      >
        {suffix}
      </Text>
    </View>
  );
}
