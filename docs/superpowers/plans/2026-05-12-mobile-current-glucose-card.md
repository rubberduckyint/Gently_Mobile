# Mobile current-glucose dashboard card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the user's current glucose value, trend, and last-update time prominently on the Mobile dashboard. Closes the "Mobile can't see in-range data" UX gap surfaced during smoke testing. Without this, Gently feels like a black box that only beeps on breach — competitors (SugarPixel, Glucose Projector, Blose Watch Face) show the value continuously.

**Architecture:** A self-contained `CurrentGlucoseCard` component reads the source's unit-of-measure and polls `trpc.readings.latest({ sourceId })` every 60 seconds (matching SRF's worker cadence) plus on app focus. Trend codes from Dexcom map to arrow glyphs via a pure helper. Empty state (no readings yet) and error state both render explicitly rather than failing silently. Threshold-coloring (in-range green, low red, high yellow) uses fixed clinical defaults — no per-user rule lookup in v1.

**Tech Stack:** Expo SDK 55, Expo Router, React Native, React Query via tRPC v11, existing `glucose-units.ts` helper from Plan 3 for display conversion.

**Spec reference:** Implied by the design spec's "users can see their data" requirement; recorded explicitly in coordinator memory during the smoke-test debugging conversation 2026-05-12.

**Dependencies:**
- **Hard:** SRF Plan 1.5 (`readings.latest`) must be deployed. Verify with a curl to `/api/trpc/readings.latest` before starting Task 5.
- Independent of Mobile Plan 2 (onboarding flow) and Plan 3 (alert-config UI). Plan 3 ships the `glucose-units.ts` helper this plan reuses — verify it exists before Task 3.

---

## File map

**New files:**
- `apps/expo/src/components/cgm/CurrentGlucoseCard.tsx` — the dashboard card
- `apps/expo/src/utils/glucose-trend.ts` — `trendToArrow(code)` mapping helper
- `apps/expo/src/utils/glucose-trend.test.ts`
- `apps/expo/src/utils/relative-time.ts` — small "X min ago" formatter
- `apps/expo/src/utils/relative-time.test.ts`

**Modified files:**
- `apps/expo/src/app/dashboard.tsx` — render `<CurrentGlucoseCard>` near the top

---

## Task 1: Trend arrow mapping helper

**Files:**
- Create: `apps/expo/src/utils/glucose-trend.ts`
- Create: `apps/expo/src/utils/glucose-trend.test.ts`

Per `Gently_SRF/CLAUDE.md`, Dexcom emits these trend codes: `DoubleUp`, `SingleUp`, `FortyFiveUp`, `Flat`, `FortyFiveDown`, `SingleDown`, `DoubleDown`, `None`, `NotComputable`, `RateOutOfRange`. Map each to an arrow glyph and a human-readable label.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { trendArrow, trendLabel } from "./glucose-trend";

describe("trendArrow", () => {
  it.each([
    ["DoubleUp",       "⇈"],
    ["SingleUp",       "↑"],
    ["FortyFiveUp",    "↗"],
    ["Flat",           "→"],
    ["FortyFiveDown",  "↘"],
    ["SingleDown",     "↓"],
    ["DoubleDown",     "⇊"],
  ] as const)("maps %s to %s", (code, arrow) => {
    expect(trendArrow(code)).toBe(arrow);
  });

  it("renders None / unknown trends with a dash", () => {
    expect(trendArrow("None")).toBe("—");
    expect(trendArrow("NotComputable")).toBe("—");
    expect(trendArrow("RateOutOfRange")).toBe("—");
    expect(trendArrow("UnknownGarbage")).toBe("—");
  });
});

describe("trendLabel", () => {
  it("renders a human label", () => {
    expect(trendLabel("Flat")).toBe("Steady");
    expect(trendLabel("SingleUp")).toBe("Rising");
    expect(trendLabel("DoubleDown")).toBe("Falling fast");
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm -F @gently/expo test -- glucose-trend
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

In `apps/expo/src/utils/glucose-trend.ts`:

```ts
const ARROWS: Record<string, string> = {
  DoubleUp:      "⇈",
  SingleUp:      "↑",
  FortyFiveUp:   "↗",
  Flat:          "→",
  FortyFiveDown: "↘",
  SingleDown:    "↓",
  DoubleDown:    "⇊",
};

const LABELS: Record<string, string> = {
  DoubleUp:      "Rising fast",
  SingleUp:      "Rising",
  FortyFiveUp:   "Rising slowly",
  Flat:          "Steady",
  FortyFiveDown: "Falling slowly",
  SingleDown:    "Falling",
  DoubleDown:    "Falling fast",
  None:          "Unknown",
  NotComputable: "Unknown",
  RateOutOfRange: "Unknown",
};

export function trendArrow(code: string | null | undefined): string {
  if (!code) return "—";
  return ARROWS[code] ?? "—";
}

export function trendLabel(code: string | null | undefined): string {
  if (!code) return "Unknown";
  return LABELS[code] ?? "Unknown";
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm -F @gently/expo test -- glucose-trend
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/src/utils/glucose-trend.ts apps/expo/src/utils/glucose-trend.test.ts
git commit -m "$(cat <<'EOF'
Add glucose-trend arrow + label helpers

Maps Dexcom trend codes (DoubleUp/SingleUp/...) to UI arrows and human
labels. Unknown / non-computable trends render as a dash.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Relative-time formatter

**Files:**
- Create: `apps/expo/src/utils/relative-time.ts`
- Create: `apps/expo/src/utils/relative-time.test.ts`

A small "X seconds/minutes ago" helper. Avoids pulling a dependency like `date-fns` just for this one use; we already YAGNI-ed any time-series tooling out of Plan 1.5.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
  const now = new Date("2026-05-12T20:00:00Z").getTime();

  it("renders 'just now' under 15 seconds", () => {
    expect(relativeTime(new Date(now - 5_000), now)).toBe("just now");
  });

  it("renders seconds 15s..59s", () => {
    expect(relativeTime(new Date(now - 30_000), now)).toBe("30s ago");
    expect(relativeTime(new Date(now - 59_000), now)).toBe("59s ago");
  });

  it("renders minutes 1m..59m", () => {
    expect(relativeTime(new Date(now - 90_000), now)).toBe("1m ago");
    expect(relativeTime(new Date(now - 60 * 30 * 1000), now)).toBe("30m ago");
  });

  it("renders hours+ for older", () => {
    expect(relativeTime(new Date(now - 60 * 60 * 1000), now)).toBe("1h ago");
    expect(relativeTime(new Date(now - 60 * 60 * 1000 * 5), now)).toBe("5h ago");
  });
});
```

- [ ] **Step 2: Verify fail**

```bash
pnpm -F @gently/expo test -- relative-time
```

Expected: FAIL.

- [ ] **Step 3: Implement**

In `apps/expo/src/utils/relative-time.ts`:

```ts
export function relativeTime(then: Date, nowMs: number = Date.now()): string {
  const diffMs = nowMs - then.getTime();
  if (diffMs < 15_000) return "just now";
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  return `${Math.floor(diffMs / 3_600_000)}h ago`;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm -F @gently/expo test -- relative-time
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/src/utils/relative-time.ts apps/expo/src/utils/relative-time.test.ts
git commit -m "$(cat <<'EOF'
Add relative-time formatter

Tiny "just now" / "Xs ago" / "Xm ago" / "Xh ago" helper. Used by the
current-glucose card to show data freshness.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Glucose range-coloring helper

**Files:**
- Modify: `apps/expo/src/utils/glucose-units.ts` (add `rangeColor`)
- Modify: `apps/expo/src/utils/glucose-units.test.ts`

Pick a color based on absolute clinical ranges — no per-user rule lookup in v1, just standard defaults:
- below 70 mg/dL → low (red)
- 70-180 mg/dL → in range (green)
- above 180 mg/dL → high (yellow)
- below 55 mg/dL → critical low (deeper red, optional)

- [ ] **Step 1: Add tests**

```ts
// extend glucose-units.test.ts
import { rangeColor } from "./glucose-units";

describe("rangeColor", () => {
  it("returns 'low' below 70 mg/dL", () => {
    expect(rangeColor(50)).toBe("low");
    expect(rangeColor(69)).toBe("low");
  });
  it("returns 'in_range' 70-180", () => {
    expect(rangeColor(70)).toBe("in_range");
    expect(rangeColor(120)).toBe("in_range");
    expect(rangeColor(180)).toBe("in_range");
  });
  it("returns 'high' above 180", () => {
    expect(rangeColor(181)).toBe("high");
    expect(rangeColor(300)).toBe("high");
  });
});
```

- [ ] **Step 2: Verify fail**

```bash
pnpm -F @gently/expo test -- glucose-units
```

Expected: FAIL — `rangeColor` not exported.

- [ ] **Step 3: Implement**

In `apps/expo/src/utils/glucose-units.ts`, add:

```ts
export type GlucoseRange = "low" | "in_range" | "high";

export function rangeColor(mgDl: number): GlucoseRange {
  if (mgDl < 70) return "low";
  if (mgDl > 180) return "high";
  return "in_range";
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm -F @gently/expo test -- glucose-units
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/src/utils/glucose-units.ts apps/expo/src/utils/glucose-units.test.ts
git commit -m "$(cat <<'EOF'
Add rangeColor helper for dashboard tinting

Classifies a mg/dL value as low (<70), in_range (70-180), or high (>180).
Used by the current-glucose card; later versions can swap to per-user
thresholds, but v1 uses absolute clinical defaults.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Build the `CurrentGlucoseCard` component

**Files:**
- Create: `apps/expo/src/components/cgm/CurrentGlucoseCard.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { trpc } from "~/utils/api";
import { colors, typography } from "~/styles";  // adjust to existing pattern
import {
  type GlucoseUnit,
  formatGlucose,
  rangeColor,
  toMmolL,
} from "~/utils/glucose-units";
import { trendArrow, trendLabel } from "~/utils/glucose-trend";
import { relativeTime } from "~/utils/relative-time";

interface Props {
  sourceId: string;
  unit: GlucoseUnit;
}

// Worker polls Dexcom every 60s; matching that gives sub-minute freshness on
// the dashboard. App-focus refetch covers wake-from-background.
const POLL_INTERVAL_MS = 60_000;

const RANGE_BG: Record<ReturnType<typeof rangeColor>, string> = {
  low: "#FDECEA",       // light red
  in_range: "#E8F5E9",  // light green
  high: "#FFF8E1",      // light yellow
};
const RANGE_FG: Record<ReturnType<typeof rangeColor>, string> = {
  low: "#B71C1C",
  in_range: "#1B5E20",
  high: "#F57F17",
};

export function CurrentGlucoseCard({ sourceId, unit }: Props) {
  const q = trpc.readings.latest.useQuery(
    { sourceId },
    {
      refetchInterval: POLL_INTERVAL_MS,
      refetchOnWindowFocus: true,
    },
  );

  // Loading
  if (q.isLoading) {
    return (
      <Card>
        <ActivityIndicator />
      </Card>
    );
  }

  // Error
  if (q.isError) {
    return (
      <Card>
        <Text style={{ color: colors.error }}>Couldn't load reading</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
          {q.error.message}
        </Text>
      </Card>
    );
  }

  // No reading yet
  if (!q.data) {
    return (
      <Card>
        <Text style={typography.heading}>No reading yet</Text>
        <Text style={{ color: colors.muted, marginTop: 4 }}>
          The first reading will appear within a few minutes after connecting your Dexcom source.
        </Text>
      </Card>
    );
  }

  const { value, trend, wallTime } = q.data;
  const range = rangeColor(value);
  const displayValue = unit === "mmol_l"
    ? toMmolL(value).toFixed(1)
    : String(value);
  const unitLabel = unit === "mmol_l" ? "mmol/L" : "mg/dL";

  return (
    <Card style={{ backgroundColor: RANGE_BG[range] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ fontSize: 56, fontWeight: "700", color: RANGE_FG[range] }}>
          {displayValue}
        </Text>
        <View>
          <Text style={{ fontSize: 32, color: RANGE_FG[range] }}>
            {trendArrow(trend)}
          </Text>
          <Text style={{ fontSize: 12, color: RANGE_FG[range], fontWeight: "600" }}>
            {trendLabel(trend)}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
        <Text style={{ color: RANGE_FG[range], fontWeight: "600" }}>{unitLabel}</Text>
        <Text style={{ color: RANGE_FG[range], fontSize: 12 }}>
          {relativeTime(new Date(wallTime))}
        </Text>
      </View>
    </Card>
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: { backgroundColor?: string };
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
        ...(style ?? {}),
      }}
    >
      {children}
    </View>
  );
}
```

Adapt the `~/styles` import to match this app's pattern. If `colors.error` / `colors.muted` / etc. don't exist with those names, use whatever the design system exports (the dashboard.tsx file imports from `~/styles` — same pattern works here).

- [ ] **Step 2: Commit**

```bash
git add apps/expo/src/components/cgm/CurrentGlucoseCard.tsx
git commit -m "$(cat <<'EOF'
Add CurrentGlucoseCard component

Polls readings.latest every 60s + on focus. Shows value, trend arrow,
last-update relative time, and uses absolute range colors (low/in/high)
for the background tint. Empty and error states render explicitly
rather than collapsing to nothing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Render the card on the dashboard

**Files:**
- Modify: `apps/expo/src/app/dashboard.tsx`

The dashboard currently renders devices and other content. Add `<CurrentGlucoseCard>` at the top of the scrollable area, pulling the user's first source from `trpc.dexcom.list`.

- [ ] **Step 1: Verify SRF readings.latest is live**

```bash
curl -sS https://srf.gentlyus.com/api/health
```

Expected: `{"ok":true}`. If the readings.latest endpoint isn't available yet, hold this task and ping coordinator — Plan 1.5 needs to ship first.

```bash
# Optional probe — replace sourceId and cookie:
curl -sS https://srf.gentlyus.com/api/trpc/readings.latest \
  -H 'Content-Type: application/json' \
  -H 'expo-origin: gently://' \
  -H 'Cookie: <session-cookie>' \
  -d '{"sourceId": "<your-source-uuid>"}' | jq
```

- [ ] **Step 2: Integrate the card**

In `apps/expo/src/app/dashboard.tsx`, near the top of the rendered content (inside the `ScrollView` if there is one), add:

```tsx
import { CurrentGlucoseCard } from "~/components/cgm/CurrentGlucoseCard";

// inside the component:
const { data: sources } = trpc.dexcom.list.useQuery();
const primarySource = sources?.[0];

// in the JSX, at the top of the scroll content:
{primarySource && (
  <CurrentGlucoseCard
    sourceId={primarySource.id}
    unit={primarySource.unitOfMeasure ?? "mg_dl"}
  />
)}
```

If `dexcom.list` is already queried elsewhere in the component (likely), reuse that data instead of duplicating the query — React Query dedupes by key, but cleaner to read once.

- [ ] **Step 3: Smoke test**

Open the app on the emulator. After sign-in lands on dashboard, you should see:
- If no readings exist yet: the "No reading yet" empty state
- If readings exist: the value, trend arrow, range-tinted background, and "X min ago" timestamp

Within 60s, the card should auto-refresh — backgrounding and foregrounding the app should also trigger a refetch.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/src/app/dashboard.tsx
git commit -m "$(cat <<'EOF'
Show CurrentGlucoseCard on dashboard

Closes the "users can't see their data" gap. Card renders the user's
primary source's most recent reading, refreshes every 60s + on focus,
uses absolute range coloring for low/in/high.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Push + final verification

- [ ] **Step 1: Typecheck + lint + tests**

```bash
pnpm -F @gently/expo typecheck
pnpm -F @gently/expo lint
pnpm -F @gently/expo test
```

Expected: PASS (with the pre-existing settings.tsx errors continuing to be ignored).

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Manual smoke test**

In the emulator:
1. Sign in as test user, navigate to dashboard.
2. If you have a Dexcom source connected with readings present, confirm the card shows current value, trend, timestamp.
3. Wait 60s; observe the value refreshes automatically.
4. Background the app, foreground it; observe a refetch fires.
5. Disconnect the source; the card should disappear (since there's no primarySource).
6. Reconnect; card reappears, eventually populates after the first worker poll.

- [ ] **Step 4: Notify coordinator**

Reply: "Mobile Plan 2.5 merged at HEAD `<sha>`. Current-glucose card live on dashboard; readings.latest polling and on-focus refetch verified."

---

## What this plan does NOT cover

- **Time-series chart** — a recent-readings sparkline on the dashboard. YAGNI for v1; needs a `readings.recent` SRF endpoint that this plan's prereq (1.5) explicitly skips. Plan in v1.5.
- **Per-user threshold-based coloring** — uses absolute clinical defaults (70 / 180). Swap to user rules in v1.5 when per-user thresholds are more contextual.
- **WebSocket / live push of glucose value** — polling is good enough for v1; live push is v1.5.
- **Multi-source / follower dashboards** — feature-flagged off per the design spec.
- **Stale-data warning** — if the last reading is older than 15 minutes, show a warning. v1.5 polish.
- **Unit conversion of color thresholds** — `rangeColor` operates on canonical mg/dL; UI displays in the source's chosen unit but coloring stays based on mg/dL. No conversion needed for the coloring logic.

## Coordination notes

- Hard dependency on SRF Plan 1.5 (`readings.latest`). Verify the endpoint is live (Task 5 Step 1) before integrating the card.
- Reuses `glucose-units.ts` from Mobile Plan 3 — verify that file exists and exports `formatGlucose`, `toMmolL`, etc. before Task 3.
- Independent of Mobile Plan 2 (onboarding) — either can ship first.
