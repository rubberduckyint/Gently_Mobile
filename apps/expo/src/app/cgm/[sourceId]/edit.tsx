import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AlertRuleCard } from "~/components/cgm/AlertRuleCard";
import { UnitOfMeasurePicker } from "~/components/cgm/UnitOfMeasurePicker";
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

const DIABETES_KINDS = [
  "low",
  "critical_low",
  "high",
  "falling_fast",
  "stale",
];
const METABOLIC_KINDS = [
  "spike_above",
  "sustained_above",
  "post_meal_unresolved",
  "tir_breach",
  "low",
];

const REGION_LABELS: Record<"us" | "ous" | "jp", string> = {
  us: "United States",
  ous: "Outside US",
  jp: "Japan",
};

export default function SourceEditScreen() {
  const { sourceId } = useLocalSearchParams<{ sourceId: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();

  const sourcesQ = useQuery({
    queryKey: ["dexcom", "list"],
    queryFn: () => trpc.dexcom.list.query(),
  });

  const rulesQ = useQuery({
    queryKey: ["rule", "listForSource", sourceId],
    queryFn: () => trpc.rule.listForSource.query({ sourceId }),
    enabled: !!sourceId,
  });

  const prefsQ = useQuery({
    queryKey: ["userPreferences", "get"],
    queryFn: () => trpc.userPreferences.get.query({}),
  });

  const updateSource = useMutation({
    mutationFn: (input: {
      sourceId: string;
      unitOfMeasure?: GlucoseUnit;
      active?: boolean;
    }) => trpc.dexcom.update.mutate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dexcom", "list"] });
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

  if (sourcesQ.isLoading || rulesQ.isLoading || prefsQ.isLoading) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Stack.Screen options={{ title: "Edit Source" }} />
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  const source = sourcesQ.data?.find((s) => s.id === sourceId);

  if (!source) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Stack.Screen options={{ title: "Edit Source" }} />
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Text style={[typography.body, { color: colors.text.secondary }]}>
            Source not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const segment = prefsQ.data?.segment ?? "diabetes";
  const visibleKinds =
    segment === "metabolic_health" ? METABOLIC_KINDS : DIABETES_KINDS;
  const visibleRules = (rulesQ.data ?? []).filter((r) =>
    visibleKinds.includes(r.kind),
  );

  // unitOfMeasure is not returned from dexcom.list (the field is stored on
  // cgmSource but sourceListSelect doesn't project it). Default to "mg_dl"
  // so the picker is usable and mutations go through normally. When SRF adds
  // the projection, change this to `source.unitOfMeasure ?? "mg_dl"` —
  // otherwise the picker keeps snapping back to mg/dL after each save.
  const currentUnit: GlucoseUnit = "mg_dl";

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
            disconnectMutation.mutate({ sourceId, active: false });
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={containers.safeArea}>
      <Stack.Screen options={{ title: source.displayName }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing[4] }}
      >
        <View style={{ marginBottom: spacing[6] }}>
          <Text style={[typography.h5, { marginBottom: spacing[1] }]}>
            {source.displayName}
          </Text>
          {source.dexcom !== null && (
            <>
              <Text
                style={[
                  typography.body,
                  { color: colors.text.secondary, marginBottom: spacing[1] },
                ]}
              >
                {source.dexcom.username}
              </Text>
              <Text
                style={[typography.caption, { color: colors.text.tertiary }]}
              >
                {REGION_LABELS[source.dexcom.region]}
              </Text>
            </>
          )}
        </View>

        <View style={{ marginBottom: spacing[6] }}>
          <Text style={[typography.label, { marginBottom: spacing[2] }]}>
            Glucose units
          </Text>
          <UnitOfMeasurePicker
            value={currentUnit}
            onChange={(next) => {
              updateSource.mutate({ sourceId, unitOfMeasure: next });
            }}
            disabled={updateSource.isPending || disconnectMutation.isPending}
          />
        </View>

        <Text
          style={[
            typography.h5,
            { marginBottom: spacing[4] },
          ]}
        >
          Alert rules
        </Text>

        {visibleRules.length === 0 ? (
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, marginBottom: spacing[6] },
            ]}
          >
            No alert rules yet. They are created automatically when a Dexcom
            source is added. If you don{"'"}t see any here, remove and re-add
            this source.
          </Text>
        ) : (
          visibleRules.map((rule) => (
            <AlertRuleCard key={rule.id} rule={rule} unit={currentUnit} />
          ))
        )}

        <View style={{ marginTop: spacing[4], marginBottom: spacing[8] }}>
          <Pressable
            style={[
              buttons.base,
              buttons.large,
              buttons.error,
              disconnectMutation.isPending && { opacity: 0.6 },
            ]}
            onPress={confirmDisconnect}
            disabled={disconnectMutation.isPending}
            accessibilityLabel="Disconnect Dexcom source"
          >
            <Text style={[buttonText.primary]}>Disconnect Dexcom source</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
