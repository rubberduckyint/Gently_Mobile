import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type { RelativePathString } from "expo-router";

import { trpc } from "~/utils/api";
import { nextOnboardingRoute } from "~/utils/onboarding-gate";
import { colors } from "~/styles";

export default function OnboardingEntry() {
  const sourcesQ = useQuery({
    queryKey: ["dexcom", "list"],
    queryFn: () => trpc.dexcom.list.query(),
  });
  const devicesQ = useQuery({
    queryKey: ["device", "getAll"],
    queryFn: () => trpc.device.getAll.query({}),
  });

  useEffect(() => {
    if (sourcesQ.isLoading || devicesQ.isLoading) return;
    const next = nextOnboardingRoute({
      hasBracelet: (devicesQ.data ?? []).length > 0,
      sources: (sourcesQ.data ?? []).map((s) => ({
        id: s.id,
        displayName: s.displayName,
        active: s.dexcom?.active ?? true,
      })),
    });
    if (next) router.replace(next as RelativePathString);
    else router.replace("/dashboard");
  }, [sourcesQ.isLoading, devicesQ.isLoading, sourcesQ.data, devicesQ.data]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color={colors.primary[500]} />
    </View>
  );
}
