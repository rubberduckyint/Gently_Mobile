/**
 * CGM Sources List
 *
 * Lists Dexcom Share connections owned by the current user. Empty state
 * routes to the connect-Dexcom form; populated state still surfaces an
 * "+ Add" affordance because the SRF schema permits multiple sources
 * per user.
 */

import { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router, useFocusEffect } from "expo-router";
import type { RelativePathString } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { FEATURE_FLAGS } from "~/config/feature-flags";
import { EmptyState } from "~/components/ui/EmptyState";
import { Header } from "~/components/ui/Header";
import {
  buttons,
  buttonText,
  colors,
  commonStyles,
  containers,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

type Source = RouterOutputs["dexcom"]["list"][number];

const REGION_LABELS: Record<"us" | "ous" | "jp", string> = {
  us: "United States",
  ous: "Outside US",
  jp: "Japan",
};

type StatusKind = "active" | "paused" | "attention" | "unconfigured";

function deriveStatus(source: Source): StatusKind {
  if (source.dexcom === null) return "unconfigured";
  if (!source.dexcom.active) return "paused";
  if (source.dexcom.consecutiveFailures > 0) return "attention";
  return "active";
}

function StatusBadge({ kind }: { kind: StatusKind }) {
  const palette: Record<StatusKind, { bg: string; fg: string; label: string }> =
    {
      active: {
        bg: colors.success[50],
        fg: colors.success[700],
        label: "Active",
      },
      paused: {
        bg: colors.gray[100],
        fg: colors.text.secondary,
        label: "Paused",
      },
      attention: {
        bg: colors.warning[50],
        fg: colors.warning[700],
        label: "Needs attention",
      },
      unconfigured: {
        bg: colors.gray[100],
        fg: colors.text.secondary,
        label: "Not configured",
      },
    };
  const p = palette[kind];
  return (
    <View
      style={{
        backgroundColor: p.bg,
        paddingHorizontal: spacing[2],
        paddingVertical: spacing[1],
        borderRadius: 6,
      }}
    >
      <Text style={[typography.caption, { color: p.fg, fontWeight: "600" }]}>
        {p.label}
      </Text>
    </View>
  );
}

function SourceRow({ source }: { source: Source }) {
  const status = deriveStatus(source);
  const region =
    source.dexcom !== null ? REGION_LABELS[source.dexcom.region] : null;
  return (
    <View
      style={{
        backgroundColor: colors.background.primary,
        borderRadius: 12,
        padding: spacing[4],
        marginBottom: spacing[3],
        borderWidth: 1,
        borderColor: colors.border.light,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: spacing[2],
        }}
      >
        <Text style={[typography.h4, { color: colors.text.primary, flex: 1 }]}>
          {source.displayName}
        </Text>
        <StatusBadge kind={status} />
      </View>
      {source.dexcom !== null && (
        <>
          <Text
            style={[typography.body, { color: colors.text.secondary }]}
            numberOfLines={1}
          >
            {source.dexcom.username}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.text.secondary, marginTop: spacing[1] },
            ]}
          >
            {region}
          </Text>
        </>
      )}
    </View>
  );
}

export default function CgmSourcesPage() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dexcom", "list"],
    queryFn: () => trpc.dexcom.list.query(),
    enabled: !!session?.user,
  });

  useFocusEffect(
    useCallback(() => {
      if (session?.user) {
        void queryClient.invalidateQueries({ queryKey: ["dexcom", "list"] });
      }
    }, [session, queryClient]),
  );

  const goAdd = () => router.push("/cgm/add");

  if (!session?.user) {
    // Defensive — the route should be reached only post-auth, but the
    // session can transition to null mid-render on sign-out.
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="Dexcom Sources" />
        <View style={commonStyles.fullScreenLoading}>
          <Text style={[typography.body, { color: colors.text.secondary }]}>
            Sign in to view your Dexcom connections.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="Dexcom Sources" />
        <View style={commonStyles.fullScreenLoading}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    const message =
      error instanceof Error && error.message.toLowerCase().includes("unauth")
        ? "Please sign in again."
        : "Couldn't load your Dexcom connections. Try again.";
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="Dexcom Sources" />
        <View style={commonStyles.fullScreenLoading}>
          <Text style={[typography.h4, { color: colors.error[600] }]}>
            Something went wrong
          </Text>
          <Text
            style={[
              typography.body,
              {
                color: colors.text.secondary,
                marginTop: spacing[2],
                marginBottom: spacing[6],
                textAlign: "center",
              },
            ]}
          >
            {message}
          </Text>
          <Pressable
            style={[buttons.base, buttons.medium, buttons.primary]}
            onPress={() => {
              void refetch();
            }}
          >
            <Text style={buttonText.primary}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!FEATURE_FLAGS.MULTI_DEVICE_ENABLED) {
    const first = (data ?? [])[0];
    if (first) {
      return (
        <Redirect
          href={{
            pathname: "/cgm/[sourceId]/edit",
            params: { sourceId: first.id },
          }}
        />
      );
    }
    // No source yet — send back to the onboarding connect step.
    return (
      <Redirect href={"/(onboarding)/connect-dexcom" as RelativePathString} />
    );
  }

  const sources = data ?? [];

  if (sources.length === 0) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="Dexcom Sources" />
        <View style={containers.content}>
          <EmptyState
            icon="pulse-outline"
            title="No Dexcom Share account connected yet"
            description="Connect a Dexcom Share account so Gently can send you bracelet alerts when your glucose crosses a threshold."
            actionTitle="Connect Dexcom Share"
            onAction={goAdd}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header
        title="Dexcom Sources"
        rightButton={{
          icon: "add",
          onPress: goAdd,
          accessibilityLabel: "Connect another Dexcom Share account",
        }}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing[4] }}
      >
        {sources.map((source) => (
          <SourceRow key={source.id} source={source} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

