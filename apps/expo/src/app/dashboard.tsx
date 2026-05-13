import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router, useFocusEffect } from "expo-router";
import type { RelativePathString } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { HamburgerMenu } from "~/components/ui/HamburgerMenu";
import { sourceMenuItem } from "~/components/ui/hamburger-items";
import { YearOfBirthModal } from "~/components/ui/YearOfBirthModal";
import { GentlyHeader } from "~/components/brand/GentlyHeader";
import { CurrentGlucoseCard } from "~/components/cgm/CurrentGlucoseCard";
import { StatusPill } from "~/components/ui/StatusPill";
import { Watch } from "~/components/icons/Watch";
import { Cloud } from "~/components/icons/Cloud";
import { Chev } from "~/components/icons/Chev";
import { FEATURE_FLAGS } from "~/config/feature-flags";
import { tokens } from "~/styles/tokens";
import { typographyV2 } from "~/styles/typographyV2";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { nextOnboardingRoute } from "~/utils/onboarding-gate";
import { devicesBeingDeleted } from "~/utils/deviceDeletionTracker";
import {
  clearUserIdentity,
  identifyUser,
  trackLogout,
} from "~/services/analytics";
import { useBLE } from "~/contexts/BLEContext";
// Range bar deferred per coordinator decision 2026-05-13

type Rule = RouterOutputs["rule"]["listForSource"][number];

const FLOOR_50_KINDS = new Set(["critical_low"]);

const KIND_LABELS: Record<string, string> = {
  critical_low: "Critical Low",
  low: "Low",
  high: "High",
  falling_fast: "Falling Fast",
  stale: "Stale",
  spike_above: "Spike Above",
  sustained_above: "Sustained Above",
  post_meal_unresolved: "Post-Meal Unresolved",
  tir_breach: "TIR Breach",
};

// Diabetes-pack display order: high first, then severity-ascending lows.
// Unlisted kinds (metabolic pack, etc.) fall to the end in tRPC order.
const KIND_ORDER: Record<string, number> = {
  high: 0,
  low: 1,
  critical_low: 2,
};

function kindToTint(kind: string): { bg: string; fg: string } {
  switch (kind) {
    case "critical_low":
      return { bg: tokens.color.coralBg, fg: tokens.color.coral };
    case "low":
      return { bg: tokens.color.cyanBg, fg: tokens.color.cyanDeep };
    case "high":
      return { bg: tokens.color.amberBg, fg: tokens.color.amber };
    case "falling_fast":
      return { bg: tokens.color.amberBg, fg: tokens.color.amber };
    case "stale":
      return { bg: tokens.color.bg, fg: tokens.color.ink2 };
    default:
      return { bg: tokens.color.bg, fg: tokens.color.ink2 };
  }
}

function AlarmRuleRow({
  rule,
  sourceId,
}: {
  rule: Rule;
  sourceId: string;
}) {
  const tint = kindToTint(rule.kind);
  const label = KIND_LABELS[rule.kind] ?? rule.kind;
  const thresholdText =
    rule.threshold !== null && rule.threshold !== undefined
      ? `${rule.threshold} mg/dL`
      : "—";

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/cgm/[sourceId]/alarms/[ruleId]/edit" as RelativePathString,
          params: { sourceId, ruleId: rule.id },
        })
      }
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: tokens.color.card,
          borderRadius: tokens.radius.list,
          paddingHorizontal: tokens.spacing.cardInternal,
          paddingVertical: 14,
          marginBottom: 8,
        },
        tokens.shadow.card,
        pressed && { opacity: 0.75 },
      ]}
    >
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
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: tint.fg,
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
          numberOfLines={1}
        >
          {rule.kind === "critical_low"
            ? "!"
            : rule.kind === "high"
              ? "H"
              : rule.kind === "low"
                ? "L"
                : "~"}
        </Text>
      </View>

      {/* Center */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[typographyV2.eyebrow, { color: tint.fg }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={{ fontSize: 15, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}
        >
          {thresholdText}
        </Text>
        {FLOOR_50_KINDS.has(rule.kind) && (
          <View
            style={{
              alignSelf: "flex-start",
              backgroundColor: tokens.color.coralBg,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
              marginTop: 2,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: tokens.color.coral,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Floor 50
            </Text>
          </View>
        )}
      </View>

      {/* Chevron */}
      <Chev size={18} color={tokens.color.ink3} />
    </Pressable>
  );
}

export default function DashboardPage() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const [showYearOfBirthModal, setShowYearOfBirthModal] = useState(false);

  const { connectionState } = useBLE();

  // Fetch user profile to check year of birth
  const { data: userProfile } = useQuery({
    queryKey: ["userProfile"],
    queryFn: () => trpc.auth.getProfile.query(),
    enabled: !!session?.user,
  });

  // Identify user for analytics when session is available
  useEffect(() => {
    if (session?.user?.id) {
      void identifyUser(session.user.id);
    }
  }, [session?.user?.id]);

  // Show year-of-birth modal once the profile loads if it's missing
  useEffect(() => {
    if (!userProfile) return;
    if (!userProfile.yearOfBirth) {
      setShowYearOfBirthModal(true);
    }
  }, [userProfile]);

  const devicesQ = useQuery({
    queryKey: ["device", "getAll"],
    queryFn: () => trpc.device.getAll.query({}),
    enabled: !!session?.user,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });

  const sourcesQ = useQuery({
    queryKey: ["dexcom", "list"],
    queryFn: () => trpc.dexcom.list.query(),
    enabled: !!session?.user,
  });

  const primarySource = sourcesQ.data?.[0];

  const rulesQ = useQuery({
    queryKey: ["rule", "listForSource", primarySource?.id],
    queryFn: () => trpc.rule.listForSource.query({ sourceId: primarySource?.id ?? "" }),
    enabled: !!primarySource?.id,
  });

  // Onboarding gate
  useEffect(() => {
    if (devicesQ.isLoading || sourcesQ.isLoading) return;
    const next = nextOnboardingRoute({
      hasBracelet: (devicesQ.data ?? []).length > 0,
      sources: (sourcesQ.data ?? []).map((s) => ({
        id: s.id,
        displayName: s.displayName,
        active: s.dexcom?.active ?? true,
      })),
    });
    if (next) router.replace(next as RelativePathString);
  }, [devicesQ.isLoading, sourcesQ.isLoading, devicesQ.data, sourcesQ.data]);

  const signOutMutation = useMutation({
    mutationFn: async () => {
      trackLogout();
      await clearUserIdentity();
      await authClient.signOut();
    },
    onSuccess: () => {
      router.replace("/");
    },
    onError: (error) => {
      console.error("Failed to sign out:", error);
      Alert.alert("Error", "Failed to sign out. Please try again.");
    },
  });

  const updateYearOfBirthMutation = useMutation({
    mutationFn: async (yearOfBirth: number) => {
      return await trpc.auth.update.mutate({ yearOfBirth });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      setShowYearOfBirthModal(false);
    },
    onError: (error) => {
      console.error("Failed to update year of birth:", error);
      Alert.alert("Error", "Failed to save year of birth. Please try again.");
    },
  });

  const handleYearOfBirthComplete = (yearOfBirth: number) => {
    updateYearOfBirthMutation.mutate(yearOfBirth);
  };

  useFocusEffect(
    useCallback(() => {
      if (session?.user) {
        if (devicesBeingDeleted.size > 0) {
          console.log(
            "Skipping dashboard refetch - device deletion in progress",
          );
          return;
        }
        void queryClient.invalidateQueries({ queryKey: ["device", "getAll"] });
      }
    }, [session, queryClient]),
  );

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", onPress: () => signOutMutation.mutate() },
    ]);
  };

  const handleUserProfile = () => {
    router.push("/settings");
  };

  const handleAddDevice = () => {
    router.push("/add-device");
  };

  const dexcomItem = sourceMenuItem({ primarySourceId: primarySource?.id });

  // BLE pill value
  const bleConnected = connectionState === "connected";
  const braceletPillValue = bleConnected ? "Connected" : "Disconnected";
  const braceletPillAccent = bleConnected
    ? tokens.color.cyanDeep
    : tokens.color.ink3;

  // Dexcom pill value
  const dexcomActive = primarySource?.dexcom?.active;
  const dexcomPillValue =
    primarySource == null
      ? "Not configured"
      : dexcomActive === false
        ? "Paused"
        : "Syncing";
  const dexcomPillAccent =
    primarySource != null && dexcomActive !== false
      ? tokens.color.cyanDeep
      : tokens.color.ink3;

  const armedRules = (rulesQ.data ?? []).filter((r) => r.enabled);
  const orderedRules = [...armedRules].sort(
    (a, b) => (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99),
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.bg }}
      edges={["top"]}
    >
      <GentlyHeader
        right={
          <HamburgerMenu
            options={[
              ...(dexcomItem ? [dexcomItem] : []),
              {
                label: "User Settings",
                onPress: handleUserProfile,
                icon: "settings",
              },
              {
                label: "Sign Out",
                onPress: handleSignOut,
                icon: "log-out",
                destructive: true,
              },
            ]}
          />
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tokens.spacing.pageHorizontal,
          paddingBottom: 40,
          paddingTop: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Glucose hero card */}
        {primarySource && (
          <CurrentGlucoseCard
            sourceId={primarySource.id}
            unit={primarySource.unitOfMeasure ?? "mg_dl"}
          />
        )}

        {/* Status pills row */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 22 }}>
          <View style={{ flex: 1 }}>
            <StatusPill
              icon={<Watch size={18} color={braceletPillAccent} />}
              label="Bracelet"
              value={braceletPillValue}
              accentColor={braceletPillAccent}
              dot={
                bleConnected
                  ? { color: tokens.color.cyan }
                  : undefined
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <StatusPill
              icon={<Cloud size={18} color={dexcomPillAccent} />}
              label="Dexcom"
              value={dexcomPillValue}
              accentColor={dexcomPillAccent}
            />
          </View>
        </View>

        {/* Alarms armed section */}
        {primarySource && (
          <View>
            {/* Section header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <Text
                style={[typographyV2.eyebrow, { color: tokens.color.ink3 }]}
              >
                Alarms Armed
              </Text>
              <Link
                href={{
                  pathname: "/cgm/[sourceId]/edit",
                  params: { sourceId: primarySource.id },
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: tokens.color.cyanDeep,
                  }}
                >
                  Edit
                </Text>
              </Link>
            </View>

            {armedRules.length === 0 && !rulesQ.isLoading && (
              <Text
                style={{ fontSize: 13, color: tokens.color.ink3, marginBottom: 12 }}
              >
                No alarms armed yet.
              </Text>
            )}

            {orderedRules.map((rule) => (
              <AlarmRuleRow
                key={rule.id}
                rule={rule}
                sourceId={primarySource.id}
              />
            ))}
          </View>
        )}

        {/* Add Another Gently button — behind feature flag */}
        {FEATURE_FLAGS.MULTI_DEVICE_ENABLED && (
          <Pressable
            onPress={handleAddDevice}
            style={({ pressed }) => ({
              marginTop: 16,
              paddingVertical: 14,
              borderRadius: tokens.radius.cta,
              borderWidth: 1.5,
              borderColor: tokens.color.rule2,
              alignItems: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{ fontSize: 15, fontWeight: "600", color: tokens.color.ink2 }}
            >
              + Add Another Gently
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Year of Birth Modal */}
      <YearOfBirthModal
        visible={showYearOfBirthModal}
        onComplete={handleYearOfBirthComplete}
        isLoading={updateYearOfBirthMutation.isPending}
      />
    </SafeAreaView>
  );
}
