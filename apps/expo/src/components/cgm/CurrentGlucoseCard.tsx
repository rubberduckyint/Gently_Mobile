import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { tokens } from "~/styles/tokens";
import { typographyV2, tabularNums } from "~/styles/typographyV2";
import { trpc } from "~/utils/api";
import { trendArrow, trendLabel } from "~/utils/glucose-trend";
import type { GlucoseUnit } from "~/utils/glucose-units";
import { toMmolL } from "~/utils/glucose-units";
import { relativeTime } from "~/utils/relative-time";

// 60s matches the SRF worker polling cadence — no point polling faster
const POLL_INTERVAL_MS = 60_000;

interface Props {
  sourceId: string;
  unit: GlucoseUnit;
}

export function CurrentGlucoseCard({ sourceId, unit }: Props) {
  const q = useQuery({
    queryKey: ["readings", "latest", sourceId],
    queryFn: () => trpc.readings.latest.query({ sourceId }),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  if (q.isLoading) {
    return (
      <Card>
        <ActivityIndicator color={tokens.color.cyan} />
      </Card>
    );
  }

  if (q.isError) {
    return (
      <Card>
        <Text style={[typographyV2.eyebrow, { color: tokens.color.coral }]}>
          Couldn't load reading
        </Text>
        <Text style={{ color: tokens.color.ink3, fontSize: 12, marginTop: 4 }}>
          {q.error instanceof Error ? q.error.message : "Unknown error"}
        </Text>
      </Card>
    );
  }

  if (!q.data) {
    return (
      <Card>
        <Text style={[typographyV2.eyebrow, { color: tokens.color.ink2 }]}>
          No reading yet
        </Text>
        <Text style={{ color: tokens.color.ink3, marginTop: 4, fontSize: 13 }}>
          The first reading will appear within a few minutes after connecting
          your Dexcom source.
        </Text>
      </Card>
    );
  }

  const { value, trend, wallTime } = q.data;
  const displayValue =
    unit === "mmol_l" ? toMmolL(value).toFixed(1) : String(value);
  const unitLabel = unit === "mmol_l" ? "mmol/L" : "mg/dL";

  return (
    <Card>
      {/* Eyebrow row: label left, relative time right */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <Text style={[typographyV2.eyebrow, { color: tokens.color.ink3 }]}>
          Current Glucose
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: tokens.color.ink3,
            fontVariant: tabularNums,
          }}
        >
          {relativeTime(new Date(wallTime))}
        </Text>
      </View>

      {/* Hero value row with trend inline */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
        <Text
          style={[typographyV2.glucoseHero, { color: tokens.color.inkH, fontVariant: tabularNums }]}
        >
          {displayValue}
        </Text>
        <View style={{ paddingBottom: 22, gap: 2 }}>
          <Text style={{ fontSize: 28, color: tokens.color.ink2 }}>
            {trendArrow(trend)}
          </Text>
          <Text
            style={[typographyV2.eyebrow, { color: tokens.color.ink3 }]}
          >
            {unitLabel}
          </Text>
        </View>
      </View>

      {/* Status line */}
      <Text style={{ fontSize: 13, color: tokens.color.ink2, marginTop: 2 }}>
        {"• "}{trendLabel(trend)}
      </Text>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={[
        {
          borderRadius: tokens.radius.card,
          padding: tokens.spacing.cardInternal,
          marginBottom: 16,
          backgroundColor: tokens.color.card,
        },
        tokens.shadow.card,
      ]}
    >
      {children}
    </View>
  );
}
