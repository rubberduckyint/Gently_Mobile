# Alert configuration UI + onboarding flow simplification — v1 design

**Date:** 2026-05-12
**Status:** Design approved, ready for implementation planning
**Scope:** Cross-repo (`Gently_Mobile` + `Gently_SRF`)

## Summary

Make Gently shippable for v1 by (1) building a per-source alert-rule configuration UI so users can tune thresholds and alarm style, (2) adding a critical-low threshold with a hardware-enforced safety floor of 50 mg/dL, (3) adding a unit-of-measure setting (mg/dL or mmol/L) on each Dexcom source, and (4) restructuring the app's information architecture for a single-device-per-user v1 (sign up → bracelet pair → Dexcom connect, with multi-source UI hidden behind a feature flag).

## Why

The product currently has hardcoded default thresholds (Low <70, High >250, etc.) and no user-facing way to tune them or their alarm style. Users with different glucose patterns or sensitivity tolerances cannot tailor the system to their needs. A configurable threshold UI is a v1 ship blocker.

The "very simple v1" framing also means hiding multi-device complexity (followers, multiple sources) behind a feature flag. This simplifies the onboarding journey to the three steps a single-CGM user actually goes through, with Dexcom connection as a prominent hero CTA after device pairing.

## Architecture and decomposition

Four coordinated sub-projects, sequenced. Each is independently shippable after the previous lands.

- **A. Unit of measure on Dexcom source.** Schema + form additions. Foundational; threshold display depends on it.
- **B. Critical-low threshold + safety floor.** New `kind` enum value, schema migration, alert-engine integration, hardware-minimum (50 mg/dL) validation.
- **C. Source edit screen + alert-rule config UI.** New screen exposes all 9 rules (segmented by user's preset pack) with modality-based alarm style. Replaces the existing per-source nav model.
- **D. IA / onboarding flow.** Sign up → bracelet pair → Dexcom hero CTA. Multi-device UI feature-flagged off. Hamburger menu shows "Dexcom Source" (singular).

Sub-projects share a common data model and tRPC surface, so the team should plan them together but ship them in this order.

## Data model changes — SRF

All schema work is in `Gently_SRF/packages/db/src/schema/`.

### `cgm_source`

Add `unit_of_measure` column.

```sql
ALTER TABLE cgm_source
  ADD COLUMN unit_of_measure text NOT NULL DEFAULT 'mg_dl'
  CHECK (unit_of_measure IN ('mg_dl', 'mmol_l'));
```

Drizzle schema: extend the existing `cgmSource` definition in `packages/db/src/schema/cgm-source.ts` with `unitOfMeasure: text("unit_of_measure", { enum: ["mg_dl", "mmol_l"] }).notNull().default("mg_dl")`.

### `alert_rule`

Three changes:

1. Add `'critical_low'` to the `kind` enum.
2. Replace the per-rule pattern IDs (`vibration_pattern_id`, `audio_pattern_id`) with per-rule levels (`vibration_level`, `audio_level`). LED stays as it was (`led_color` nullable, `led_on_ms`, `led_off_ms`).
3. Add a CHECK constraint enforcing the critical-low safety floor.

```sql
-- 1. Add 'critical_low' to kind enum
-- (Drizzle migration handles the enum extension)

-- 2. Levels replace pattern IDs
ALTER TABLE alert_rule DROP COLUMN vibration_pattern_id;
ALTER TABLE alert_rule DROP COLUMN audio_pattern_id;
ALTER TABLE alert_rule
  ADD COLUMN vibration_level integer NOT NULL DEFAULT 0,
  ADD COLUMN audio_level     integer NOT NULL DEFAULT 0;

-- 3. Safety floor
ALTER TABLE alert_rule
  ADD CONSTRAINT alert_rule_critical_low_floor
  CHECK (kind != 'critical_low' OR threshold >= 50);
```

Drizzle schema: in `packages/db/src/schema/alert-rule.ts`, extend the `kind` enum array with `"critical_low"`, drop `vibrationPatternId` and `audioPatternId`, add `vibrationLevel` and `audioLevel` as `integer().notNull().default(0)`.

### Why drop the pattern IDs, not keep both

The user-facing model is "level," not "pattern." Each modality has an independent on/off + intensity. Storing both pattern ID and level would create data redundancy and conflict (which one wins if they disagree?). The translator that maps user intent to firmware-specific patterns lives server-side (see "AlertPayload contract" below); the firmware-specific pattern selection is no longer user-facing.

There are no production users with non-default rules right now, so dropping the pattern ID columns is safe. If this work shipped post-launch we'd back up the columns first.

## Modality independence (user-facing behavior)

**Users can enable any combination of vibrate, audio, and light per rule.** Each modality is independent:

- `vibration_level = 0` means vibration is off for this rule. Any value 1-4 means on at that intensity.
- `audio_level = 0` means audio is off. Any value 1-4 means on at that intensity.
- `led_color = null` means light is off. A non-null color value means light is on with that color (with `led_on_ms` / `led_off_ms` controlling the blink pattern).

So a "silent visual-only" alarm sets vibration_level=0, audio_level=0, led_color=Red. A "tactile-only" alarm sets vibration_level=3, audio_level=0, led_color=null. All combinations are valid; the UI exposes all three as independent controls per rule.

## AlertPayload contract — no v1 wire change

`Gently_SRF/packages/contract/src/alert-payload.ts` and its Mobile-vendored copy (`Gently_Mobile/apps/expo/src/types/alert-payload.ts`) are **not modified in v1**.

The SRF worker translates `vibration_level` → `vibrationPatternId` (existing payload field) at AlertPayload construction time using a lookup table in `Gently_SRF/packages/alert-engine/`. Same for `audio_level`. The Mobile-vendored schema and Mobile's `apps/expo/src/services/alerts/translator.ts` continue working unchanged.

This avoids the Mobile-SRF version-lockstep dance for the v1 build. If a future version needs richer wire-format support (e.g., explicit intensity fields), we can update the contract then.

The translator lookup table should be reviewed for sensible defaults — for example:
- `vibration_level=4` → a strongly-perceived "urgent" pattern at intensity 4
- `vibration_level=1` → a single-pulse low-intensity pattern at intensity 1
- `audio_level=4` → the most attention-grabbing audio pattern
- `audio_level=0` → no audio (worker emits `audioPatternId: null` in payload)

Implementation note: the lookup table is the single source of truth for level → firmware-params mapping. Document it inline in code with comments referencing the bracelet capabilities listed in `Gently_Mobile/CLAUDE.md`.

## tRPC additions — SRF

In `Gently_SRF/packages/api/src/router/`:

- **`cgmSource.create`** — extend input schema to accept `unitOfMeasure: z.enum(["mg_dl", "mmol_l"]).default("mg_dl").optional()`.
- **`cgmSource.update`** — accept `unitOfMeasure` as an optional partial. (If this endpoint does not currently exist, add it. See `project_srf_deferred_threads.md` for the deferred `dexcom.update / dexcom.delete` UI brief.)
- **New `rule` router** in `packages/api/src/router/rule.ts`:
  - `rule.listForSource(input: { sourceId: uuid })` → `AlertRule[]` for the current subscriber on that source, filtered by user's `UserPreferences.segment` (diabetes shows diabetes rules; metabolic shows metabolic rules).
  - `rule.update(input: { ruleId: uuid, ...Partial<AlertRule> })` → updated row. Server-side Zod refine validates `critical_low → threshold >= 50` (defense in depth with the DB CHECK constraint). Refine also clamps `vibration_level` and `audio_level` to 0-4.
  - `rule.test(input: { ruleId: uuid })` — constructs a synthetic AlertPayload from the named rule and dispatches it as an Expo push to the calling user's registered token. Rate-limited server-side to 3 calls per user per minute via Better-Auth's rate limiter or a simple in-memory map. Used by the Test alarm button in the source edit screen.

Wire `rule` into `appRouter` in `packages/api/src/root.ts`.

## Mobile UI

### Onboarding flow

New onboarding screens land at `apps/expo/src/app/(onboarding)/...` (route group).

1. **Sign up / sign in** — existing flow unchanged. Lands on (onboarding) entry after auth completes if the user has no paired bracelet and no Dexcom source.
2. **Pair your Gently bracelet** — BLE pairing flow. Uses the existing BLE pairing screens, just re-routed inside the onboarding group. No "skip for now" option in v1.
3. **Connect Dexcom Share** — a new screen with a centered hero CTA, large primary button: "Connect Dexcom Share." No other content competing for attention. No skip affordance in v1.
4. Tap CTA → existing `cgm/add.tsx` form, now extended with the unit-of-measure picker (see Sub-project A).
5. After source creation, lands on the new source edit screen (Sub-project C) with default alert rules pre-populated and tweakable.

### Hamburger menu

Restructured to:
- **Dexcom Source** (singular) — routes to source edit screen.
- (Other existing entries remain.)
- Anything implying multiple sources, follower flow, "Add another device," etc. hidden via `MULTI_DEVICE_ENABLED = false` feature flag in `apps/expo/src/config/feature-flags.ts` (new module — single source of truth).

The plural "Dexcom Sources" list view in `apps/expo/src/app/cgm/index.tsx` is gated behind `MULTI_DEVICE_ENABLED`. In v1, navigating to "Dexcom Source" goes straight to the single user's source's edit screen.

### Source edit screen

New file: `apps/expo/src/app/cgm/[sourceId]/edit.tsx`.

Top-to-bottom layout:

1. **Header** — source displayName (editable text input).
2. **Connection section**:
   - Region (read-only label)
   - Username (read-only label)
   - **Unit of measure** — segmented picker: mg/dL or mmol/L. On change, all threshold values in the Alerts section redisplay in the new unit; underlying mg/dL storage is unchanged.

   Note: password rotation and region change are **not** in v1 scope here. They are tracked as separate deferred work (`dexcom.update` UI in coordinator memory at `project_srf_deferred_threads.md`) and will land in a follow-up alongside the broader credential-rotation flow.
3. **Alerts section** — one card per applicable rule kind. Rule kinds shown are segmented by the user's `UserPreferences.segment`:
   - **Diabetes pack**: Low, **Critical-Low**, High, Falling-fast, Stale.
   - **Metabolic pack**: Spike-above, Sustained-above, Post-meal unresolved, TIR breach, Low.

   Each rule card contains:
   - **Enabled** toggle
   - **Threshold** input — numeric. Displayed and edited in the source's chosen unit. For mmol/L: 1 decimal place, conversion `mg_dl / 18.018 = mmol_l`. Critical-Low is clamped to ≥ 50 mg/dL (or the mmol/L equivalent ≈ 2.8 mmol/L), with helper text "Minimum 50 — hardware safety limit."
   - **Alarm style** sub-block:
     - **Vibrate level** — slider, 0 (off) through 4 (max). Labels: Off / Light / Medium / Strong / Max.
     - **Audio level** — slider, 0 (off) through 4 (max). Same label scheme.
     - **Light** — "None" radio + 7 color chips: Red, Yellow, Green, Blue, Purple, Orange, White (matching the bracelet's 7 LED colors per `Gently_Mobile/CLAUDE.md`).
     - **Duration** — seconds input, 10–60 default range.
     - **Repeat after** / **Escalate after** — minute inputs (optional; null = no repeat/escalation).
   - **Test alarm** button — calls `rule.test`. Bracelet (or mock) reflects the chosen style live for the duration.
4. **Footer** — "Delete this source" button with confirmation modal.

Form state management uses React Query mutations with optimistic updates. Each rule card is independently submittable. Saving a rule fires `rule.update` and refetches `rule.listForSource` on success.

### Feature flag module

New file: `Gently_Mobile/apps/expo/src/config/feature-flags.ts`:

```ts
export const FEATURE_FLAGS = {
  MULTI_DEVICE_ENABLED: false,
} as const;
```

All v1 single-device gating reads from this module. Flipping `MULTI_DEVICE_ENABLED` to `true` later re-enables the multi-source UI without rewiring.

## Defaults

Default alert rule values inserted for new Dexcom sources, per pack.

### Diabetes pack

| Kind | Threshold | Vibrate | Audio | Light | Duration | Repeat | Escalate |
|---|---|---|---|---|---|---|---|
| low          | 70 mg/dL    | 2 | 2 | Yellow | 10s | 5min  | — |
| critical_low | 55 mg/dL    | 4 | 4 | Red    | 30s | 2min  | 5min |
| high         | 250 mg/dL   | 2 | 2 | Yellow | 10s | 10min | — |
| falling_fast | 3 mg/dL/min | 3 | 2 | Orange | 10s | —     | — |
| stale        | 20 min      | 1 | 1 | Blue   | 5s  | —     | — |

### Metabolic pack

Threshold defaults sourced from `Gently_SRF/CLAUDE.md`. Alarm style is intentionally less aggressive than the diabetes pack — metabolic users are tuning long-term patterns, not responding to acute hypoglycemia.

| Kind | Threshold | Vibrate | Audio | Light | Duration | Repeat | Escalate |
|---|---|---|---|---|---|---|---|
| spike_above       | 140 mg/dL          | 2 | 1 | Yellow | 8s  | —     | — |
| sustained_above   | 120 mg/dL for 90min| 2 | 1 | Orange | 10s | 30min | — |
| post_meal_unresolved | (engine-driven)  | 2 | 1 | Yellow | 8s  | —     | — |
| tir_breach        | (engine-driven)    | 1 | 1 | Blue   | 5s  | —     | — |
| low               | 70 mg/dL           | 3 | 3 | Yellow | 10s | 5min  | — |

`post_meal_unresolved` and `tir_breach` are evaluated by the alert engine over a window rather than a simple `threshold` integer; their `threshold` column may be null or encode the window parameters. Implementation will follow whatever convention the existing engine already uses for these kinds.

## Migrations

Sequenced Drizzle migrations (`Gently_SRF/packages/db/migrations/`):

1. Add `unit_of_measure` to `cgm_source` with `'mg_dl'` default.
2. Add `'critical_low'` to the `kind` enum.
3. Drop `vibration_pattern_id` and `audio_pattern_id` from `alert_rule` (safe: no production rows have non-default values yet).
4. Add `vibration_level` and `audio_level` to `alert_rule` with `0` default.
5. Insert default `critical_low` rules for any existing `(user_id, cgm_source_id)` that has a `low` rule. (Currently zero rows, but the migration is idempotent.)
6. Add CHECK constraint `alert_rule_critical_low_floor`.

Each migration is generated via `pnpm -F @gently/db generate`. Run locally against the dev DB, then chained into the api boot command on Railway as already configured.

## Error handling and safety

- **Threshold validation:** defense in depth — client-side input clamps, server-side Zod refine in `rule.update`, DB-level CHECK constraint.
- **Unit conversion:** mg/dL is canonical storage. mmol/L display converts via `value / 18.018`, rounded to 1 decimal. On save in mmol/L mode, round back to mg/dL integer; if the rounded result differs from the original entry by more than 1 mg/dL, show a small "rounded to nearest whole mg/dL" toast.
- **`rule.test` rate limiting:** server-side limit 3 calls per user per minute. Returns 429 with a friendly error message when exceeded.
- **Pack mismatch:** if a user's `segment` field changes, their existing alert rules are not auto-deleted. UI shows rules matching the current pack. Hidden-pack rules remain in the DB but are not displayed.
- **`MULTI_DEVICE_ENABLED` feature flag:** single source of truth in `apps/expo/src/config/feature-flags.ts`; flipping it back on later does not require rewiring.

## Testing strategy

- Schema migration covered in `packages/db/src/schema/schema.test.ts`.
- New tRPC `rule.update` and `rule.test` covered in `packages/api/src/router/__tests__/rule.test.ts` (create the file).
- Alert-engine logic for `critical_low` firing independently of `low` covered in `packages/alert-engine/src/__tests__/`.
- Level → firmware-params translator lookup table unit-tested standalone.
- Mobile: form validation snapshot tests for the source edit screen. Existing `apps/expo/src/app/cgm/add.tsx` test (if present) is updated for the new unit-of-measure field.
- E2E manual QA: the Test alarm button on the edit screen serves as built-in manual verification.

## Out of scope for this design

- Multi-source / follower scenarios (feature-flagged off).
- Custom preset packs beyond diabetes + metabolic.
- Per-time-of-day rule scheduling (e.g., quieter alerts at night).
- Audio volume control as a field separate from `audio_level` (deferred until firmware exposes one explicitly).
- Replacing the existing AlertPayload wire schema (no contract change in v1).
- The `dexcom.update` / `dexcom.delete` UI broader than the source edit screen here — see deferred-threads tracker.

## Cross-repo handoff

Implementation crosses Mobile and SRF; coordinator owns sequencing. Suggested order:

1. **SRF schema + migrations** (sub-project A + B) — adds unit_of_measure to cgm_source, critical_low enum, level columns, CHECK constraint. tRPC additions in same SRF commit window.
2. **SRF alert-engine integration** for critical_low + level → firmware-params translator. Update the worker's AlertPayload construction.
3. **Mobile feature-flag module + onboarding flow rewrite** (sub-project D) — can run in parallel with SRF work since it does not depend on the schema changes for routing.
4. **Mobile source edit screen** (sub-project C) — depends on SRF tRPC additions being live in production.
5. **Mobile `cgm/add.tsx` unit-of-measure picker** — depends on SRF schema being deployed.

Per-repo agents own implementation. Coordinator audits the cross-repo contract surface (`AppRouter` types stay in sync via `Gently_SRF/packages/api`).
