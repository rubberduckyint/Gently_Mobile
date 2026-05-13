import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { LevelSlider } from "./LevelSlider";
import { LightColorPicker } from "./AlarmDetail/LightColorPicker";
import type { RouterOutputs } from "~/utils/api";
import { trpc } from "~/utils/api";
import type { GlucoseUnit } from "~/utils/glucose-units";
import {
  clampCriticalLow,
  formatGlucose,
  toMgDl,
  toMmolL,
  CRITICAL_LOW_FLOOR_MG_DL,
} from "~/utils/glucose-units";
import { colors, typography } from "~/styles";

type Rule = RouterOutputs["rule"]["listForSource"][number];

interface Props {
  rule: Rule;
  unit: GlucoseUnit;
}

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

export function AlertRuleCard({ rule, unit }: Props) {
  const [local, setLocal] = useState(rule);
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: (input: {
      ruleId: string;
      enabled?: boolean;
      threshold?: number;
      vibrationLevel?: number;
      audioLevel?: number;
      ledColor?: string | null;
      durationSec?: number;
      repeatAfterMin?: number | null;
      escalateAfterMin?: number | null;
    }) => trpc.rule.update.mutate(input),
    onError: () => setLocal(rule),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["rule", "listForSource", rule.cgmSourceId],
      });
    },
  });

  const test = useMutation({
    mutationFn: (input: { ruleId: string }) => trpc.rule.test.mutate(input),
  });

  function patch(next: Partial<Rule>) {
    setLocal((prev) => ({ ...prev, ...next }));
    const { threshold, ...rest } = next;
    update.mutate({
      ruleId: rule.id,
      ...rest,
      ...(threshold !== undefined && threshold !== null ? { threshold } : {}),
    });
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border.medium,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        opacity: local.enabled ? 1 : 0.6,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text style={typography.h5}>
          {KIND_LABELS[local.kind] ?? local.kind}
        </Text>
        <Switch
          value={local.enabled}
          onValueChange={(v) => patch({ enabled: v })}
          trackColor={{
            false: colors.border.medium,
            true: colors.primary[500],
          }}
        />
      </View>

      {local.threshold !== null && local.threshold !== undefined && (
        <ThresholdRow
          kind={local.kind}
          mgDl={local.threshold}
          unit={unit}
          onChange={(nextMgDl) => patch({ threshold: nextMgDl })}
        />
      )}

      <LevelSlider
        label="Vibrate"
        value={local.vibrationLevel}
        onChange={(v) => patch({ vibrationLevel: v })}
      />
      <LevelSlider
        label="Audio"
        value={local.audioLevel}
        onChange={(v) => patch({ audioLevel: v })}
      />
      <LightColorPicker
        value={local.ledColor ?? null}
        onChange={(c) => patch({ ledColor: c })}
      />

      <DurationInputs
        durationSec={local.durationSec}
        repeatAfterMin={local.repeatAfterMin ?? null}
        escalateAfterMin={local.escalateAfterMin ?? null}
        onChange={(next) => patch(next)}
      />

      <Pressable
        onPress={() => test.mutate({ ruleId: rule.id })}
        disabled={test.isPending}
        style={{
          marginTop: 12,
          paddingVertical: 10,
          alignItems: "center",
          backgroundColor: colors.background.secondary,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border.medium,
          opacity: test.isPending ? 0.6 : 1,
        }}
        accessibilityLabel="Test alarm"
      >
        {test.isPending ? (
          <ActivityIndicator size="small" color={colors.text.primary} />
        ) : (
          <Text style={[typography.label, { color: colors.text.primary }]}>
            Test alarm
          </Text>
        )}
      </Pressable>
      {test.error instanceof Error && (
        <Text
          style={{
            color: colors.error[500],
            marginTop: 8,
            fontSize: 12,
          }}
        >
          {test.error.message}
        </Text>
      )}
    </View>
  );
}

function ThresholdRow({
  kind,
  mgDl,
  unit,
  onChange,
}: {
  kind: string;
  mgDl: number;
  unit: GlucoseUnit;
  onChange: (nextMgDl: number) => void;
}) {
  const display = unit === "mmol_l" ? toMmolL(mgDl).toFixed(1) : String(mgDl);
  const [draft, setDraft] = useState(display);

  useEffect(() => {
    setDraft(unit === "mmol_l" ? toMmolL(mgDl).toFixed(1) : String(mgDl));
  }, [unit, mgDl]);

  function commit() {
    const parsed = parseFloat(draft);
    if (Number.isNaN(parsed)) {
      setDraft(unit === "mmol_l" ? toMmolL(mgDl).toFixed(1) : String(mgDl));
      return;
    }
    let next = unit === "mmol_l" ? toMgDl(parsed) : Math.round(parsed);
    if (kind === "critical_low") next = clampCriticalLow(next);
    onChange(next);
    setDraft(unit === "mmol_l" ? toMmolL(next).toFixed(1) : String(next));
  }

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[typography.label, { marginBottom: 4 }]}>
        Threshold ({unit === "mmol_l" ? "mmol/L" : "mg/dL"})
      </Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        keyboardType="decimal-pad"
        style={{
          borderWidth: 1,
          borderColor: colors.border.medium,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          fontSize: 16,
          color: colors.text.primary,
          backgroundColor: colors.background.secondary,
        }}
      />
      {kind === "critical_low" && (
        <Text
          style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 4 }}
        >
          Minimum {formatGlucose(CRITICAL_LOW_FLOOR_MG_DL, unit)} — hardware safety limit.
        </Text>
      )}
    </View>
  );
}

function DurationInputs({
  durationSec,
  repeatAfterMin,
  escalateAfterMin,
  onChange,
}: {
  durationSec: number;
  repeatAfterMin: number | null;
  escalateAfterMin: number | null;
  onChange: (next: Partial<Rule>) => void;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <NumericRow
        label="Duration (sec)"
        value={durationSec}
        onChange={(v) => {
          if (v === null) return;
          onChange({ durationSec: Math.max(1, Math.min(60, v)) });
        }}
      />
      <NumericRow
        label="Repeat every (min)"
        nullable
        value={repeatAfterMin}
        onChange={(v) => onChange({ repeatAfterMin: v })}
      />
      <NumericRow
        label="Escalate after (min)"
        nullable
        value={escalateAfterMin}
        onChange={(v) => onChange({ escalateAfterMin: v })}
      />
    </View>
  );
}

function NumericRow({
  label,
  value,
  onChange,
  nullable = false,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  nullable?: boolean;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
    >
      <Text style={[typography.label, { flex: 1 }]}>{label}</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={() => {
          if (draft === "" && nullable) {
            onChange(null);
            return;
          }
          const n = parseInt(draft, 10);
          if (Number.isNaN(n)) {
            setDraft(value === null ? "" : String(value));
            return;
          }
          onChange(n);
        }}
        keyboardType="number-pad"
        style={{
          width: 80,
          borderWidth: 1,
          borderColor: colors.border.medium,
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 6,
          textAlign: "right",
          color: colors.text.primary,
          backgroundColor: colors.background.secondary,
        }}
      />
    </View>
  );
}
