import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Chev } from "~/components/icons";
import { tokens } from "~/styles/tokens";
import { typographyV2 } from "~/styles/typographyV2";
import { trpc } from "~/utils/api";
import type { RouterOutputs } from "~/utils/api";

type Rule = RouterOutputs["rule"]["listForSource"][number];

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

export default function EditAlarmScreen() {
  const { sourceId, ruleId } = useLocalSearchParams<{
    sourceId: string;
    ruleId: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
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

  const rule = rulesQ.data?.find((r) => r.id === ruleId);
  const source = sourcesQ.data?.find((s) => s.id === sourceId);

  const [draft, setDraft] = useState<Rule | null>(null);

  // Copy server rule into draft once loaded; never re-seed (draft owns the state).
  useEffect(() => {
    if (rule && !draft) setDraft(rule);
  }, [rule, draft]);

  const dirty = useMemo(() => {
    if (!draft || !rule) return false;
    return !shallowEqualRule(draft, rule);
  }, [draft, rule]);

  const updateRule = useMutation({
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
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["rule", "listForSource", sourceId],
      });
      router.back();
    },
  });

  // Warn before back navigation when there are unsaved changes.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsub = navigation.addListener("beforeRemove", (e: any) => {
      if (!dirty || updateRule.isSuccess) return;
      e.preventDefault();
      Alert.alert("Discard changes?", "Your unsaved changes will be lost.", [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });
    return unsub;
  }, [navigation, dirty, updateRule.isSuccess]);

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

  if (!rule || !source || !draft) {
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

  function handleSave() {
    if (!draft || !dirty) return;
    // Strip identity/immutable fields — the SRF mutation only accepts mutable fields + ruleId.
    const { id, cgmSourceId: _cgmSourceId, kind: _kind, userId: _userId, ...mutable } = draft;
    updateRule.mutate({
      ruleId: id,
      ...mutable,
      // threshold is number | null on the Rule; mutation expects number | undefined.
      threshold: mutable.threshold ?? undefined,
    });
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
            {KIND_LABELS[rule.kind] ?? rule.kind}
          </Text>
        </View>

        <Pressable
          onPress={handleSave}
          disabled={!dirty || updateRule.isPending}
          style={{ width: 60, alignItems: "flex-end", paddingVertical: 12 }}
          accessibilityLabel="Save alarm"
        >
          <Text
            style={{
              color: dirty ? tokens.color.cyanDeep : tokens.color.ink3,
              fontSize: 17,
              fontWeight: "600",
            }}
          >
            Save
          </Text>
        </Pressable>
      </View>

      {/* Body — Tasks 13-15 fill this in */}
      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.pageHorizontal }}
      >
        <Text style={[typographyV2.body, { color: tokens.color.ink3 }]}>
          Body sections rendered in Tasks 13-15 (threshold hero, sliders, color
          picker, test alarm, timing, footer).
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function shallowEqualRule(a: Rule, b: Rule): boolean {
  return (
    a.enabled === b.enabled &&
    a.threshold === b.threshold &&
    a.vibrationLevel === b.vibrationLevel &&
    a.audioLevel === b.audioLevel &&
    a.ledColor === b.ledColor &&
    a.durationSec === b.durationSec &&
    a.repeatAfterMin === b.repeatAfterMin &&
    a.escalateAfterMin === b.escalateAfterMin
  );
}
