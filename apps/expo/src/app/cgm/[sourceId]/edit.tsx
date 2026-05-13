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

import { UnitOfMeasurePicker } from "~/components/cgm/UnitOfMeasurePicker";
import { buttons, buttonText, colors, containers } from "~/styles";
import { tokens } from "~/styles/tokens";
import { typographyV2 } from "~/styles/typographyV2";
import { trpc } from "~/utils/api";
import type { GlucoseUnit } from "~/utils/glucose-units";

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

  if (sourcesQ.isLoading) {
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
          <Text style={{ fontSize: 15, color: tokens.color.ink2 }}>
            Source not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentUnit: GlucoseUnit = source.unitOfMeasure ?? "mg_dl";

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
        contentContainerStyle={{
          paddingHorizontal: tokens.spacing.pageHorizontal,
          paddingTop: 16,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Connection card */}
        <View
          style={[
            {
              backgroundColor: tokens.color.card,
              borderRadius: tokens.radius.card,
              padding: tokens.spacing.cardInternal,
              marginBottom: 24,
            },
            tokens.shadow.card,
          ]}
        >
          {/* Region row */}
          <Text
            style={[
              typographyV2.eyebrow,
              { color: tokens.color.ink3, marginBottom: 4 },
            ]}
          >
            Region
          </Text>
          <Text
            style={{ fontSize: 15, color: tokens.color.ink, marginBottom: 16 }}
          >
            {source.dexcom?.region
              ? REGION_LABELS[source.dexcom.region]
              : "—"}
          </Text>

          {/* Hairline */}
          <View
            style={{
              height: 1,
              backgroundColor: tokens.color.rule,
              marginBottom: 16,
            }}
          />

          {/* Username row */}
          <Text
            style={[
              typographyV2.eyebrow,
              { color: tokens.color.ink3, marginBottom: 4 },
            ]}
          >
            Username
          </Text>
          <Text
            style={{ fontSize: 15, color: tokens.color.ink, marginBottom: 16 }}
          >
            {source.dexcom?.username ?? "—"}
          </Text>

          {/* Hairline */}
          <View
            style={{
              height: 1,
              backgroundColor: tokens.color.rule,
              marginBottom: 16,
            }}
          />

          {/* Glucose units row */}
          <Text
            style={[
              typographyV2.eyebrow,
              { color: tokens.color.ink3, marginBottom: 8 },
            ]}
          >
            Glucose Units
          </Text>
          <UnitOfMeasurePicker
            value={currentUnit}
            onChange={(next) => {
              updateSource.mutate({ sourceId, unitOfMeasure: next });
            }}
            disabled={updateSource.isPending || disconnectMutation.isPending}
          />
        </View>

        {/* Disconnect */}
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
      </ScrollView>
    </SafeAreaView>
  );
}
