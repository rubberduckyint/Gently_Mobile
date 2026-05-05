# Gently CGM × Dexcom — Phase 2 Integration Plan (v2)

**Date:** 2026-05-05
**Companion to:** `01_dexcom_share_architecture_map.md` and `03_separated_cloud_architecture.md`
**Scope:** How the Dexcom Share path drops into a new, independent CGM Cloud (separate repo, separate CC project) that talks to the existing Gently mobile app.

---

## Audience reminder

Gently CGM serves multiple segments — T1D/T2D/gestational diabetes, pre-diabetics, and metabolic-health/wellness users on Stelo/Lingo/Levels. Architecture is identical for all; only the alert preset pack and onboarding copy differ. See doc #1 for full segment list.

---

## What changed now that we've seen the existing app + the separated-cloud decision

Three updates to fold in:

1. **Bracelet is BLE-only** (Service `F021` over react-native-ble-manager). The phone has to be the BLE bridge. SugarPixel-style device-direct-to-cloud doesn't apply.
2. **CGM Cloud is its own repo + own CC project.** Not in the existing Turborepo. Its own Postgres, hosting, secret store, observability. Tied to Gently Core only by a JWT auth seam (doc #3).
3. **Dexcom Share is real-time (~5 min cadence).** The 1hr/3hr delay applies only to the official Web API v3, not Share.

---

## End-to-end architecture (BLE-bridge variant)

```
[Sensor] ──5 min──▶ [Dexcom Cloud] ◀── poll 60s ── [CGM Cloud: Node + Postgres]
                                                          │
                                                          │  alert engine: thresholds,
                                                          │  rate-of-change, spike,
                                                          │  return-to-baseline,
                                                          │  stale-data, dedupe by WT,
                                                          │  escalation timers
                                                          │
                                                          ▼
                                                     APNs / FCM via Expo
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │ Expo app (BG)   │
                                                 │ wakes, decrypts │
                                                 │ payload         │
                                                 └────────┬────────┘
                                                          │
                                                          │ BLE write to F023
                                                          ▼
                                                 ┌─────────────────┐
                                                 │ Gently bracelet │
                                                 │ vibrate / LED / │
                                                 │ buzzer pattern  │
                                                 └─────────────────┘
```

**Cardinal principle:** the *brain* lives on the server, the *hand* is the phone, the *output* is the bracelet. Threshold decisions, dedupe, and escalation timers all happen server-side. The phone is a dumb relay that decrypts a push and writes a BLE command. Only design that survives iOS background BLE constraints + sleeping phones.

---

## Where each piece lives

| Concern | Location | New / Existing |
|---|---|---|
| Dexcom Share client | `gently-cgm-cloud` repo, `packages/dexcom` | NEW — TS port of `pydexcom` |
| Cloud poller worker | `gently-cgm-cloud`, `apps/worker` | NEW — Node 22 process, 60s loop |
| Alert engine | `gently-cgm-cloud`, `packages/alert-engine` | NEW — pure functions, easy to unit test |
| API (tRPC) | `gently-cgm-cloud`, `apps/api` | NEW — separate from Gently Core's tRPC |
| DB schema | `gently-cgm-cloud`, `packages/db` | NEW — own Postgres instance |
| Web dashboard | `gently-cgm-cloud`, `apps/web` | NEW — separate Next.js, separate domain |
| Auth-seam contract types | `gently-cgm-cloud`, `packages/contract` | NEW — JWT verifier, alert payload Zod schema |
| Push delivery | `gently-cgm-cloud`, `apps/worker` | NEW — Expo Push API |
| Mobile app shell + BLE service | Gently Core repo, `apps/expo` | EXISTING |
| Mobile CGM feature module | Gently Core repo, `apps/expo/src/features/cgm/` | NEW in existing repo |
| Mobile CGM API client | Gently Core repo, `apps/expo/src/services/api/cgm.ts` | NEW in existing repo |

The mobile app is the *only* place code lives in both worlds. Everything else is cleanly separated.

---

## DB schema (Drizzle, in CGM Cloud's own Postgres)

Five tables, all keyed on `userId` (a UUID issued by Gently Core's Better-Auth, mirrored verbatim — no FK across DBs, just trust the JWT):

```ts
// packages/db/src/schema/index.ts in gently-cgm-cloud

export const cgmUser = pgTable('cgm_user', {
  userId: uuid('user_id').primaryKey(),                  // mirrors Gently Core's user.id
  segment: text('segment', { enum: ['diabetes', 'metabolic_health', 'unspecified'] })
    .notNull().default('unspecified'),
  expoPushToken: text('expo_push_token'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const dexcomCredential = pgTable('dexcom_credential', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => cgmUser.userId, { onDelete: 'cascade' }),
  region: text('region', { enum: ['us', 'ous', 'jp'] }).notNull().default('us'),
  username: text('username').notNull(),                  // Dexcom Share username
  encryptedPassword: text('encrypted_password').notNull(),// AES-GCM, key in env/KMS
  accountId: uuid('account_id'),                         // cached from Auth endpoint
  sessionId: uuid('session_id'),                         // cached, refreshed on expiry
  sessionRefreshedAt: timestamp('session_refreshed_at'),
  lastPolledAt: timestamp('last_polled_at'),
  lastSuccessAt: timestamp('last_success_at'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const glucoseReading = pgTable('glucose_reading', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  value: integer('value').notNull(),                     // mg/dL
  trend: text('trend').notNull(),
  wallTime: timestamp('wall_time').notNull(),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
}, (t) => ({
  userTimeIdx: uniqueIndex('user_walltime_idx').on(t.userId, t.wallTime),
}));

export const alertRule = pgTable('alert_rule', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  kind: text('kind', {
    enum: [
      // diabetes pack
      'low', 'high', 'falling_fast', 'rising_fast', 'stale',
      // metabolic-health pack
      'spike_above', 'sustained_above', 'post_meal_unresolved', 'tir_breach',
    ],
  }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  threshold: integer('threshold'),
  durationMin: integer('duration_min'),                  // for sustained / post_meal / tir
  vibrationPatternId: integer('vibration_pattern_id'),
  ledColor: text('led_color'),
  ledOnMs: integer('led_on_ms'),
  ledOffMs: integer('led_off_ms'),
  audioPatternId: integer('audio_pattern_id'),
  durationSec: integer('duration_sec').notNull().default(10),
  repeatAfterMin: integer('repeat_after_min'),
  escalateAfterMin: integer('escalate_after_min'),
});

export const alertEvent = pgTable('alert_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  ruleId: uuid('rule_id').notNull(),
  glucoseReadingId: uuid('glucose_reading_id'),
  firedAt: timestamp('fired_at').defaultNow().notNull(),
  pushedAt: timestamp('pushed_at'),
  acknowledgedAt: timestamp('acknowledged_at'),
  escalatedAt: timestamp('escalated_at'),
});
```

Encryption: AES-256-GCM at write, key in env (`DEXCOM_CRED_KEY`). Add a `keyVersion` column when migrating to KMS.

---

## The poller worker

Single Node 22 process on Fly.io. Loop:

```ts
// apps/worker/src/poll.ts (sketch)
import cron from 'node-cron';
import { db } from '@cgm/db';
import { fetchLatest } from '@cgm/dexcom';
import { evaluateRules } from '@cgm/alert-engine';

cron.schedule('* * * * *', async () => {     // every 60s
  const creds = await db.query.dexcomCredential.findMany({ where: eq(active, true) });

  await Promise.all(creds.map(async (c) => {
    try {
      const reading = await fetchLatest(c);
      if (!reading) return;

      const inserted = await db.insert(glucoseReading)
        .values({ userId: c.userId, value: reading.value, trend: reading.trend, wallTime: reading.wallTime })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) return;

      const rules = await db.query.alertRule.findMany({ where: eq(c.userId) });
      const fires = evaluateRules(rules, reading, recentReadings);
      for (const fire of fires) await dispatchAlert(c.userId, fire, inserted[0]);
    } catch (e) {
      await markFailure(c.id, e);
    }
  }));
});
```

At single-digit thousands of users, one Postgres + one worker is fine. Beyond that, swap `node-cron` for `pg-boss` or `Inngest` for retries, durable scheduling, observability. Don't pre-optimize.

---

## Push transport: Expo's push service

Use **Expo Push Notifications** (`expo-server-sdk` on the worker, `expo-notifications` on device).

- Free, unified API for both APNs and FCM.
- **Solves the personal-team Apple constraint:** Expo's relay handles APNs server-side; you don't need APNs auth keys on a personal Apple Dev account.
- Notification = high-priority data payload (`content-available: 1` on iOS) so the app wakes silently, plus a fallback alert UI if BLE delivery fails.

Mobile handler in the existing Expo app:

```ts
// apps/expo/src/features/cgm/notifications.ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: false, shouldPlaySound: false }),
});

Notifications.addNotificationReceivedListener(async (n) => {
  const payload = n.request.content.data as AlertPayload;
  if (payload.type === 'cgm_alert') {
    await BLEContext.dispatchAlert(payload);                 // existing BLE builders
    await cgmApi.alert.acknowledgeDelivered.mutate({ id: payload.id });
  }
});
```

The mobile side already has the BLE command builders; the CGM module just wires `dispatchAlert` to them.

---

## Alert preset packs

### Diabetes management pack

| Rule | Default | LED | Vibration | Audio | Duration |
|---|---|---|---|---|---|
| Low | < 70 mg/dL | Red | Pattern 12, max | Pattern A | 30s, repeat every 2 min |
| High | > 250 mg/dL | Yellow | Pattern 5, mid | none | 15s, repeat every 5 min |
| Falling fast | > 3 mg/dL/min | Magenta | Pattern 8, high | none | 10s, repeat 1× after 1 min |
| Stale data | > 20 min | Cyan | Pattern 3, low | none | 5s |

### Metabolic-health pack

| Rule | Default | LED | Vibration | Audio | Duration |
|---|---|---|---|---|---|
| Spike above | > 140 mg/dL | Yellow | Pattern 4, low | none | 5s, no repeat |
| Sustained above | > 120 for 90 min | Yellow | Pattern 6, low | none | 8s, repeat 1× after 30 min |
| Post-meal unresolved | not back to ≤ 110 within 120 min | Magenta | Pattern 7, mid | none | 8s, no repeat |
| Time-in-range breach | < 70% TIR over rolling 24 hr | Cyan | Pattern 2, low | none | 5s, daily summary |
| Low (safety) | < 70 mg/dL | Red | Pattern 12, max | Pattern A | 30s, repeat every 2 min |

The "Low" rule appears in both packs — it's a baseline safety alert regardless of segment.

### UX

Onboarding asks: *"How will you primarily use Gently CGM?"* with two cards (Diabetes management / Metabolic health) and an "Other / let me customize" option. Selection sets the segment + applies the pack defaults. Each rule remains fully customizable (LED color, on/off ms, vibration pattern + intensity + duration, audio pattern + duration, repeat config) from the rules screen.

---

## Answers to the original nine open questions

### 1. Data source(s)
**v1: Dexcom Share** (covers G6, G7, Stelo).
**v1.1 priority: Abbott Libre via LibreLinkUp.** Bumped from afterthought to high priority because Libre dominates the wellness/metabolic-health segments — Stelo and Lingo both run on Libre-style sensors, and skipping Libre would lose roughly half of the non-diabetic audience.
**v1.1 also: Nightscout URL** as an additional input — de-facto standard in the T1D community, cheap to add, earns trust.
**Future: Dexcom Real-Time Partner API**, slotted in as a swap behind the same alert engine when partnership lands.
Apple Health is not a real fallback for live alerts (batch-synced and laggy); treat it as a "view your history" feature in the web dashboard, not a data source for alerts.

### 2. Where does threshold logic run?
**Server-side (CGM Cloud), full stop.** iOS will kill a backgrounded Expo app within ~30 sec; you cannot rely on phone-side polling for a 3 a.m. low alert. Server-side state machines make escalation and dedupe trivial. The phone is a transport, not a decision-maker.

### 3. Alert mapping UX
Two preset packs (above) selectable in onboarding, plus full customization. Web dashboard mirrors the same UI.

### 4. Repeat / escalation
Server-side timer per `alertEvent`:

```
fire → push → wait acknowledgedAt
  ├── ack within X min → done
  └── no ack
       └── after repeatAfterMin → re-fire (same payload)
            └── after escalateAfterMin → escalate (max intensity + buzzer)
                 └── (optional v1.5) after Y min → SMS to emergency contact via Twilio
```

### 5. Acknowledgement
The bracelet has no input. Ack via:
1. **Tap the push notification** (iOS / Android action button) → `alert.acknowledge` mutation on CGM Cloud.
2. **Open the app** → "I'm OK" button on the alert screen.
3. **(Future)** Accelerometer-based tap detection on the bracelet firmware — separate firmware project, right long-term design.

For v1, ship #1 and #2.

### 6. Offline behavior
- **Phone offline (sensor → phone → Dexcom cloud broken):** the cloud poller stops getting fresh readings → the **stale-data alert** fires. Frame in onboarding: "Gently CGM can only see your glucose when your phone has internet."
- **Phone online but our cloud unreachable:** Expo push queues; delivers on reconnect. Mobile app shows a "last seen" timestamp on the dashboard so the user can spot a broken chain.

### 7. Auth with Dexcom
Share doesn't use OAuth, so:
- Onboarding screen: "Sign in to Dexcom Share" with username + password.
- Submit → CGM Cloud attempts `AuthenticatePublisherAccount` + `LoginPublisherAccountById` immediately.
- On success: store username + encrypted password + accountId + sessionId. Tell the user the credentials are encrypted and only used to fetch readings.
- "Disconnect Dexcom" in settings → deletes the row.

Better-Auth handles the *Gently* user (in Gently Core); this is a separate per-user secret for an external service in CGM Cloud's own DB.

### 8. Latency budget

| Hop | Time |
|---|---|
| Sensor → Dexcom cloud (5-min cadence) | up to 5 min |
| Dexcom cloud → our poll (60s cadence) | up to 60s |
| Alert engine + Expo push dispatch | < 1s |
| Push transit | 1–10s |
| Phone wake + BLE command | < 1s |
| **Worst case from threshold cross to bracelet buzz** | **~6–7 min** |

Consistent with Dexcom Follow's own latency. Acceptable as a *secondary* alert; **not** a primary alarm — that needs Real-Time Partner API + FDA framing.

### 9. Liability / regulatory
Frame carefully:

- Always "alert accessory" / "secondary informational alert." Never "replaces Dexcom alarms."
- Onboarding screen: "Gently CGM shows you Dexcom data with a short delay. Keep your Dexcom alarms enabled."
- TOS: not a medical device, no diagnosis, no treatment recommendations.
- File for Dexcom Strategic Partnership in parallel — denial is informative, acceptance unlocks Real-Time API later.
- Don't reference FDA clearance unless/until Dexcom partner status comes through.
- Regulatory exposure concentrates on the diabetes segment; the wellness segment carries lower stakes — but conservative copy applies to all users for safety.

---

## Phase 2 build order

Each step shippable; total ~3–4 weeks of focused solo dev.

1. **POC (1 day):** TS port of pydexcom in `packages/dexcom`. CLI prints latest reading from your test account.
2. **Auth seam (1–2 days):** `apps/api` `whoami` endpoint, Better-Auth scoped JWT mint on Gently Core, JWKS verify on CGM Cloud. (Doc #3.)
3. **Schema migrations (1 day):** five tables above. Cred encryption helper. Worker skeleton.
4. **Onboarding flow + tRPC routes (2 days):** `dexcom.connect`, `dexcom.disconnect`, `dexcom.status`, `cgm.setSegment`. Mobile + web screens.
5. **Alert engine (2–3 days):** pure functions in `packages/alert-engine`. Unit-tested against fixture readings (CSV from your test account, both diabetes and metabolic-health style traces).
6. **Expo push wiring (1 day):** worker dispatches push, mobile handler decodes payload and calls existing BLE command builders.
7. **Rules UI (3–4 days):** preset cards (both packs) + custom mapper. Web dashboard parity (read-only history is enough for v1).
8. **Escalation + ack (2 days):** server-side timers, push action buttons, acknowledge route.
9. **Stale-data + offline UX (1–2 days):** stale-data alert, "last seen" indicator, copy.
10. **Disclaimer / TOS / onboarding copy (1 day):** real legalese; consider a paid hour with a regulatory lawyer for Class II accessory framing.
11. **(Parallel)** File the Dexcom Strategic Partnership Interest Questionnaire.

---

## Risks specific to this stack

- **Personal-team Apple builds:** Expo push relay sidesteps direct APNs entitlement gate. Validate silent push wakes the app on a personal-team build BEFORE building the rest. If unreliable, may need paid developer account.
- **Background BLE on iOS:** even with Expo push waking the app, you have a few seconds of CPU before iOS suspends again. Keep the handler hot path tight — no network calls between push receipt and BLE write. Send the alarm command first, ack the server second.
- **Solo-dev ops burden:** the worker process is one more thing to keep alive. Use Fly.io. Add a dead-simple healthcheck that fails when `lastSuccessAt` for any active credential is > 5 min stale across the fleet.
- **TEA-encrypted BLE:** existing protocol handles encryption between phone and bracelet. Don't redesign.
- **Two-cloud coordination:** users won't notice if both backends are healthy; they'll notice immediately if either is down. Status page that pings both is worth the half-day.

---

## Open questions still to resolve

- **Region:** US-first? OUS adds nothing technical, but support burden grows.
- **Family followers:** v1 or v1.1?
- **Hosting target:** Fly.io recommended; alternatives equally fine.
- **Credential encryption key management:** env var to start, KMS later. OK for v1, must be in scope before any external launch.
- **Apple paid dev account:** confirm or budget. Personal-team is fine for development; you'll need paid for App Store distribution anyway.
- **CGM Cloud branding:** is it user-visible as "Gently CGM" or hidden behind one Gently brand?
