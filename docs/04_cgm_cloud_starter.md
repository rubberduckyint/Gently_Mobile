# Gently CGM Cloud — Starter / Build Map

**Date:** 2026-05-05
**Companion to:** `01`, `02`, `03` in this folder.
**Audience:** future-Dave (or future-Claude) opening the `Gently_CGM_Cloud/` repo for the first time and wanting to ship something.
**Scope:** Concrete blueprint — repo layout, the actual Dexcom Share connection in code, data model, auth verification, push dispatch, env vars, build sequence.

---

## Table of contents

1. [System map](#1-system-map)
2. [Repo structure](#2-repo-structure)
3. [Connecting to Dexcom Share — end to end](#3-connecting-to-dexcom-share--end-to-end)
4. [Data model (Drizzle)](#4-data-model-drizzle)
5. [Auth seam — verifying Gently Core JWTs](#5-auth-seam--verifying-gently-core-jwts)
6. [Push delivery — Expo payload shape](#6-push-delivery--expo-payload-shape)
7. [Alert engine](#7-alert-engine)
8. [Worker loop](#8-worker-loop)
9. [Configuration / secrets](#9-configuration--secrets)
10. [Local dev](#10-local-dev)
11. [Deploy to Railway](#11-deploy-to-railway)
12. [Build sequence — week by week](#12-build-sequence--week-by-week)

---

## 1. System map

```
┌──────────────────┐
│  Mobile app      │  (lives in Gently Core repo)
│  CGM module      │
└────────┬─────────┘
         │ tRPC over HTTPS, JWT in Authorization header
         ▼
┌────────────────────────────────────────────────────────────────────┐
│  Gently CGM Cloud  (this repo)                                     │
│                                                                    │
│  ┌────────────┐   ┌──────────────┐   ┌───────────────────────────┐ │
│  │ apps/api   │   │ apps/worker  │   │ apps/web (cgm.gently.us)  │ │
│  │ tRPC, JWT  │   │ poller +     │   │ Next.js dashboard         │ │
│  │ verify     │   │ alert engine │   │                           │ │
│  └─────┬──────┘   └──────┬───────┘   └─────────────┬─────────────┘ │
│        │                 │                          │               │
│        └────────┬────────┴──────────────────────────┘               │
│                 ▼                                                   │
│        ┌──────────────────┐                                         │
│        │ Postgres         │                                         │
│        │ cgm_user         │                                         │
│        │ cgm_source       │ ◄─ one wearer's Dexcom data stream      │
│        │ dexcom_credential│ ◄─ 1:1 with cgm_source                  │
│        │ cgm_subscription │ ◄─ M:N (users × sources, owner/follower)│
│        │ cgm_invite       │ ◄─ short-lived follower invite tokens   │
│        │ glucose_reading  │ ◄─ keyed on cgm_source                  │
│        │ alert_rule       │ ◄─ per (subscriber, source)             │
│        │ alert_event      │ ◄─ per (subscriber, source, rule)       │
│        └──────────────────┘                                         │
└────────────────────────┬───────────────────────────────────────────┘
                         │
        ┌────────────────┴─────────────────┐
        ▼                                  ▼
┌──────────────────┐           ┌──────────────────────┐
│ Dexcom Share API │           │ Expo Push API        │
│ (per-user poll   │           │ (per-event dispatch  │
│  every 60s)      │           │  of alerts to phone) │
└──────────────────┘           └──────────────────────┘
```

Three deployable units in this repo (api, worker, web), one shared Postgres, two outbound integrations (Dexcom Share, Expo Push). One inbound dependency (mobile app via JWT).

### Mobile data flow — alarms vs live UI

The phone interacts with the cloud in two distinct ways. Worth being explicit about:

- **Alarms (push-driven, always-on):** Worker polls Dexcom every 60s → alert engine fires → Expo Push wakes the mobile app silently → app writes BLE command to the bracelet → app calls back to ack. This works whether the app is open, backgrounded, or closed. **This is the alarm path. The cloud is the brain.**
- **Live UI (pull-driven, foreground only):** When the user has the dashboard screen open, the mobile app calls `cgmApi.readings.latest.query()` every 30 seconds and re-renders. Same data the cloud already has from its 60s poll — no separate phone-side Dexcom poll, no Dexcom credentials on the phone, no duplicate logic. Just a tight read loop while the screen is visible.

The phone **does not** poll Dexcom Share directly in v1. The cloud holds the credentials; the phone reads from the cloud. This keeps the credential surface small and avoids duplicate polling logic. If we later want true offline fallback (cloud down, phone up), we can add an opt-in direct-poll mode that stores Dexcom creds in iOS Keychain — half-day of work, not v1 scope.

---

## 2. Repo structure

Mirror Gently Core's Turborepo conventions. Top-level layout:

```
Gently_CGM_Cloud/
├── apps/
│   ├── api/                tRPC service (the "control plane")
│   │   ├── src/
│   │   │   ├── routers/
│   │   │   │   ├── dexcom.ts      connect (creates source+cred+owner sub) / disconnect / listSources
│   │   │   │   ├── invites.ts     create / accept / revoke / list — family-follower invitation flow
│   │   │   │   ├── rules.ts       alert rule CRUD, scoped per (subscriber, source)
│   │   │   │   ├── readings.ts    latest reading + history queries (mobile dashboard polls latest every 30s while foregrounded)
│   │   │   │   ├── alert.ts       acknowledgeDelivered, acknowledgeAck
│   │   │   │   └── user.ts        whoami, setSegment, setPushToken
│   │   │   ├── trpc.ts            context, JWT middleware
│   │   │   └── index.ts           server bootstrap (Fastify)
│   │   └── package.json
│   ├── worker/             long-running process (the "data plane")
│   │   ├── src/
│   │   │   ├── poll.ts            cron loop over active credentials
│   │   │   ├── dispatch.ts        push delivery via Expo
│   │   │   ├── escalate.ts        timer loop for unacked alerts
│   │   │   └── index.ts           bootstrap
│   │   └── package.json
│   └── web/                Next.js dashboard at cgm.gently.us
│       ├── app/
│       │   ├── (auth)/
│       │   ├── dashboard/         glucose chart, last 24h
│       │   ├── rules/             preset cards + custom mapper
│       │   ├── history/           alert event log
│       │   └── settings/          dexcom connect, segment, disconnect
│       └── package.json
├── packages/
│   ├── db/                 Drizzle schema + migrations + cred-encryption helper
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── cgm-user.ts
│   │   │   │   ├── dexcom-credential.ts
│   │   │   │   ├── glucose-reading.ts
│   │   │   │   ├── alert-rule.ts
│   │   │   │   └── alert-event.ts
│   │   │   ├── crypto.ts          AES-256-GCM helpers
│   │   │   └── index.ts           db client, all schema exports
│   │   └── drizzle.config.ts
│   ├── dexcom/             TS client for Dexcom Share API
│   │   ├── src/
│   │   │   ├── client.ts          DexcomShareClient class
│   │   │   ├── const.ts           base URLs, app IDs, trend tables
│   │   │   ├── errors.ts          typed errors mapped from Dexcom codes
│   │   │   └── types.ts           Reading, Trend
│   │   └── package.json
│   ├── alert-engine/       pure-function rule evaluator
│   │   ├── src/
│   │   │   ├── rules.ts           evaluate(rules, latest, recent) → fires
│   │   │   ├── presets.ts         diabetes pack, metabolic-health pack
│   │   │   └── types.ts           AlertFire, AlertPayload
│   │   └── package.json
│   └── contract/           seam types shared with mobile app
│       ├── src/
│       │   ├── auth.ts            JWT shape, JWKS verifier helper
│       │   ├── alert-payload.ts   Zod schema for push payload
│       │   └── push-token.ts      endpoint types for token registration
│       └── package.json
├── tooling/
│   ├── tsconfig/
│   ├── eslint/
│   └── prettier/
├── .env.example
├── .gitignore
├── .nvmrc                  v22
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.json
├── docker-compose.yml      Postgres for local dev
├── railway.json          (per-service config; Railway also reads package.json scripts)
└── CLAUDE.md
```

Core philosophy:
- `apps/*` are deployable units. Nothing inside `apps/*` is imported by another `apps/*`.
- `packages/*` are libraries. Importable by any app and by each other (within reason).
- `apps/api` and `apps/worker` both depend on `packages/db`, `packages/dexcom`, `packages/alert-engine`, `packages/contract`. The `web` app depends on `packages/db` (read-only via tRPC client, ideally not directly).

---

## 3. Connecting to Dexcom Share — end to end

This is the part that matters most. Everything else is conventional Node/TS plumbing; the Dexcom integration is the actual product.

### 3a. The story in plain English

1. User opens the mobile app, navigates to "Connect Dexcom," types their Dexcom Share username + password.
2. Mobile app calls `cgmApi.dexcom.connect.mutate({ username, password, region })` with a JWT from Gently Core.
3. CGM Cloud's API verifies the JWT, then calls Dexcom Share's `AuthenticatePublisherAccount` to get an `accountId`. Then calls `LoginPublisherAccountById` with the accountId to get a `sessionId`. If both succeed, the credentials are valid.
4. CGM Cloud encrypts the password (AES-256-GCM with `DEXCOM_CRED_KEY`), stores `username`, `encryptedPassword`, `accountId`, `sessionId`, `region` in `dexcom_credential`, marks `active=true`.
5. The worker's 60-second loop picks up this row on its next tick. It uses the cached `sessionId` to fetch `ReadPublisherLatestGlucoseValues` with `minutes=10&maxCount=1`.
6. If the reading's `WT` is newer than what's already in `glucose_reading` for this user, insert it. If a unique-index conflict fires (same WT), skip — it's a duplicate.
7. After insert, fetch the user's `alert_rule` rows. For each enabled rule, call `evaluate(rule, latestReading, recentReadings)` from the alert engine. Each rule that fires returns an `AlertFire` object.
8. For each fire: insert an `alert_event` row. Build the `AlertPayload` (LED, vibration, audio, duration). Send via Expo Push to the user's stored push token.
9. Mobile app receives the silent push, decodes the payload, fires the BLE command via the existing BLE service, then calls `cgmApi.alert.acknowledgeDelivered.mutate({ id })`. CGM Cloud sets `pushedAt`.
10. If user taps the notification (or opens the app and taps "I'm OK"), mobile calls `cgmApi.alert.acknowledge.mutate({ id })`. CGM Cloud sets `acknowledgedAt`.
11. The escalation worker (separate cron, every minute) finds `alert_event` rows where `firedAt` + `repeatAfterMin` has passed and `acknowledgedAt is null`, and re-fires.

That's the whole loop.

### 3b. The DexcomShareClient (concrete TS sketch)

`packages/dexcom/src/client.ts`:

```ts
import {
  BASE_URLS,
  APPLICATION_IDS,
  HEADERS,
  TREND_DIRECTIONS,
  ENDPOINTS,
} from './const';
import { DexcomError, mapErrorCode } from './errors';
import type { Reading, Region } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_UUID = '00000000-0000-0000-0000-000000000000';

export interface DexcomShareSession {
  accountId: string;
  sessionId: string;
}

export class DexcomShareClient {
  constructor(
    private opts: { region: Region; username: string; password: string }
  ) {}

  /** First-time connect: fetch accountId + sessionId. */
  async authenticate(): Promise<DexcomShareSession> {
    const accountId = await this.post<string>(ENDPOINTS.AUTHENTICATE, {
      accountName: this.opts.username,
      password: this.opts.password,
      applicationId: APPLICATION_IDS[this.opts.region],
    });
    if (!UUID_RE.test(accountId) || accountId === DEFAULT_UUID) {
      throw new DexcomError('FAILED_AUTHENTICATION');
    }
    const sessionId = await this.post<string>(ENDPOINTS.LOGIN, {
      accountId,
      password: this.opts.password,
      applicationId: APPLICATION_IDS[this.opts.region],
    });
    if (!UUID_RE.test(sessionId) || sessionId === DEFAULT_UUID) {
      throw new DexcomError('FAILED_AUTHENTICATION');
    }
    return { accountId, sessionId };
  }

  /** Reuse cached accountId; mint a fresh sessionId only. */
  async refreshSession(accountId: string): Promise<string> {
    const sessionId = await this.post<string>(ENDPOINTS.LOGIN, {
      accountId,
      password: this.opts.password,
      applicationId: APPLICATION_IDS[this.opts.region],
    });
    if (!UUID_RE.test(sessionId) || sessionId === DEFAULT_UUID) {
      throw new DexcomError('FAILED_AUTHENTICATION');
    }
    return sessionId;
  }

  /** Get the latest reading using a known-valid sessionId. */
  async fetchLatest(sessionId: string): Promise<Reading | null> {
    const url = `${BASE_URLS[this.opts.region]}${ENDPOINTS.READINGS}` +
      `?sessionId=${sessionId}&minutes=10&maxCount=1`;
    const res = await fetch(url, { method: 'POST', headers: HEADERS });
    const json = await this.parse(res);
    if (!Array.isArray(json) || json.length === 0) return null;
    return this.toReading(json[0]);
  }

  // ─── internals ──────────────────────────────────────────────

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${BASE_URLS[this.opts.region]}${endpoint}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parse(res);
  }

  private async parse(res: Response) {
    let json: any;
    try { json = await res.json(); }
    catch { throw new DexcomError('INVALID_JSON'); }
    if (!res.ok) throw mapErrorCode(json);
    return json;
  }

  private toReading(raw: any): Reading {
    const wtMatch = /Date\((\d+)/.exec(raw.WT);
    const wallTime = wtMatch ? new Date(parseInt(wtMatch[1], 10)) : new Date();
    return {
      value: raw.Value as number,
      trendDirection: raw.Trend as keyof typeof TREND_DIRECTIONS,
      trend: TREND_DIRECTIONS[raw.Trend as keyof typeof TREND_DIRECTIONS],
      wallTime,
    };
  }
}
```

`packages/dexcom/src/const.ts`:

```ts
export const BASE_URLS = {
  us:  'https://share2.dexcom.com/ShareWebServices/Services/',
  ous: 'https://shareous1.dexcom.com/ShareWebServices/Services/',
  jp:  'https://share.dexcom.jp/ShareWebServices/Services/',
} as const;

export const APPLICATION_IDS = {
  us:  'd89443d2-327c-4a6f-89e5-496bbb0317db',
  ous: 'd89443d2-327c-4a6f-89e5-496bbb0317db',
  jp:  'd8665ade-9673-4e27-9ff6-92db4ce13d13',
} as const;

export const HEADERS = { 'Accept-Encoding': 'application/json' } as const;

export const ENDPOINTS = {
  AUTHENTICATE: 'General/AuthenticatePublisherAccount',
  LOGIN:        'General/LoginPublisherAccountById',
  READINGS:     'Publisher/ReadPublisherLatestGlucoseValues',
} as const;

export const TREND_DIRECTIONS = {
  None: 0, DoubleUp: 1, SingleUp: 2, FortyFiveUp: 3, Flat: 4,
  FortyFiveDown: 5, SingleDown: 6, DoubleDown: 7,
  NotComputable: 8, RateOutOfRange: 9,
} as const;
```

`packages/dexcom/src/errors.ts`:

```ts
export type DexcomErrorCode =
  | 'SESSION_EXPIRED'
  | 'FAILED_AUTHENTICATION'
  | 'MAX_ATTEMPTS'
  | 'INVALID_ARGUMENT'
  | 'INVALID_JSON'
  | 'UNKNOWN';

export class DexcomError extends Error {
  constructor(public code: DexcomErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'DexcomError';
  }
}

export function mapErrorCode(json: any): DexcomError {
  const code = json?.Code as string | undefined;
  const msg = json?.Message as string | undefined;
  switch (code) {
    case 'SessionIdNotFound':
    case 'SessionNotValid':
      return new DexcomError('SESSION_EXPIRED', msg);
    case 'AccountPasswordInvalid':
      return new DexcomError('FAILED_AUTHENTICATION', msg);
    case 'SSO_AuthenticateMaxAttemptsExceeded':
      return new DexcomError('MAX_ATTEMPTS', msg);
    case 'SSO_InternalError':
      if (msg?.includes('Cannot Authenticate by AccountName') ||
          msg?.includes('Cannot Authenticate by AccountId')) {
        return new DexcomError('FAILED_AUTHENTICATION', msg);
      }
      return new DexcomError('UNKNOWN', `${code}: ${msg}`);
    case 'InvalidArgument':
      return new DexcomError('INVALID_ARGUMENT', msg);
    default:
      return new DexcomError('UNKNOWN', `${code}: ${msg}`);
  }
}
```

### 3c. Error handling table

| Dexcom code | Mapped to | Worker action |
|---|---|---|
| `SessionIdNotFound`, `SessionNotValid` | `SESSION_EXPIRED` | Call `refreshSession(accountId)`, retry once. If second attempt fails, surface as auth failure. |
| `AccountPasswordInvalid`, `SSO_InternalError` (cannot auth variant) | `FAILED_AUTHENTICATION` | Mark credential `active=false`, increment `consecutiveFailures`, push a "Reconnect Dexcom" notification to the user. |
| `SSO_AuthenticateMaxAttemptsExceeded` | `MAX_ATTEMPTS` | Back off 30 min, surface message to user. |
| `InvalidArgument` | `INVALID_ARGUMENT` | Bug in our code. Log + alert. Do not retry. |
| `INVALID_JSON` (network / parse) | `INVALID_JSON` | Log, transient — let next tick retry. |
| Anything else | `UNKNOWN` | Log full payload, increment failure counter, retry next tick. |

### 3d. The connect flow (in `apps/api/src/routers/dexcom.ts`)

Connecting a Dexcom account creates a `cgm_source` + `dexcom_credential` + an owner `cgm_subscription` in one transaction. The user can connect their own CGM, or one they care for (kid, partner) — the difference is purely the `displayName` they pick.

```ts
import { DexcomShareClient } from '@cgm/dexcom';
import { encrypt } from '@cgm/db/crypto';
import { db, cgmSource, dexcomCredential, cgmSubscription } from '@cgm/db';
import { z } from 'zod';

export const dexcomRouter = router({
  connect: protectedProcedure
    .input(z.object({
      username: z.string().min(1),
      password: z.string().min(1),
      region: z.enum(['us', 'ous', 'jp']).default('us'),
      displayName: z.string().min(1).max(40),         // "My CGM" / "Aiden" / "Mom"
    }))
    .mutation(async ({ ctx, input }) => {
      const client = new DexcomShareClient(input);
      const session = await client.authenticate();   // throws on bad creds

      return db.transaction(async (tx) => {
        const [source] = await tx.insert(cgmSource).values({
          ownerUserId: ctx.userId,
          displayName: input.displayName,
        }).returning();

        await tx.insert(dexcomCredential).values({
          cgmSourceId: source.id,
          username: input.username,
          encryptedPassword: encrypt(input.password),
          region: input.region,
          accountId: session.accountId,
          sessionId: session.sessionId,
          sessionRefreshedAt: new Date(),
          active: true,
        });

        await tx.insert(cgmSubscription).values({
          userId: ctx.userId,
          cgmSourceId: source.id,
          role: 'owner',
          acceptedAt: new Date(),
          active: true,
        });

        return { sourceId: source.id };
      });
    }),

  disconnect: protectedProcedure
    .input(z.object({ cgmSourceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Only the owner can disconnect a source.
      const sub = await db.query.cgmSubscription.findFirst({
        where: and(
          eq(cgmSubscription.cgmSourceId, input.cgmSourceId),
          eq(cgmSubscription.userId, ctx.userId),
          eq(cgmSubscription.role, 'owner'),
        ),
      });
      if (!sub) throw new TRPCError({ code: 'FORBIDDEN' });
      // ON DELETE CASCADE on cgm_source removes credential, subscriptions, readings, rules, events.
      await db.delete(cgmSource).where(eq(cgmSource.id, input.cgmSourceId));
      return { ok: true };
    }),

  // List all sources the caller is subscribed to (as owner or follower).
  listSources: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        sourceId: cgmSource.id,
        displayName: cgmSource.displayName,
        role: cgmSubscription.role,
        active: cgmSubscription.active,
      })
      .from(cgmSubscription)
      .innerJoin(cgmSource, eq(cgmSubscription.cgmSourceId, cgmSource.id))
      .where(eq(cgmSubscription.userId, ctx.userId));
  }),
});
```

### 3e. The poll (in `apps/worker/src/poll.ts`)

```ts
import { db, dexcomCredential, glucoseReading } from '@cgm/db';
import { decrypt } from '@cgm/db/crypto';
import { DexcomShareClient, DexcomError } from '@cgm/dexcom';
import { evaluateRules } from '@cgm/alert-engine';
import { eq, and } from 'drizzle-orm';
import { dispatchAlert } from './dispatch';

export async function pollOne(credId: string) {
  const cred = await db.query.dexcomCredential.findFirst({
    where: eq(dexcomCredential.id, credId),
  });
  if (!cred || !cred.active) return;

  const client = new DexcomShareClient({
    region: cred.region,
    username: cred.username,
    password: decrypt(cred.encryptedPassword),
  });

  // 1. fetch latest with cached session, refresh if needed
  let reading;
  try {
    reading = await client.fetchLatest(cred.sessionId!);
  } catch (e) {
    if (e instanceof DexcomError && e.code === 'SESSION_EXPIRED') {
      const newSession = await client.refreshSession(cred.accountId!);
      await db.update(dexcomCredential)
        .set({ sessionId: newSession, sessionRefreshedAt: new Date() })
        .where(eq(dexcomCredential.id, cred.id));
      reading = await client.fetchLatest(newSession);
    } else {
      await markFailure(cred.id, e);
      return;
    }
  }

  await db.update(dexcomCredential)
    .set({ lastPolledAt: new Date(), lastSuccessAt: new Date(), consecutiveFailures: 0 })
    .where(eq(dexcomCredential.id, cred.id));

  if (!reading) return;

  // 2. dedupe by WT, insert keyed on the source.
  const inserted = await db.insert(glucoseReading)
    .values({
      cgmSourceId: cred.cgmSourceId,
      value: reading.value,
      trend: reading.trendDirection,
      wallTime: reading.wallTime,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) return;  // duplicate

  // 3. fan out to every active subscriber of this source.
  const subs = await db.query.cgmSubscription.findMany({
    where: and(
      eq(cgmSubscription.cgmSourceId, cred.cgmSourceId),
      eq(cgmSubscription.active, true),
    ),
  });

  const recent = await db.query.glucoseReading.findMany({
    where: eq(glucoseReading.cgmSourceId, cred.cgmSourceId),
    orderBy: desc(glucoseReading.wallTime),
    limit: 24,  // last 2 hours, shared across subscribers
  });

  // 4. each subscriber has their own rules — evaluate per subscriber.
  for (const sub of subs) {
    const rules = await db.query.alertRule.findMany({
      where: and(
        eq(alertRule.userId, sub.userId),
        eq(alertRule.cgmSourceId, cred.cgmSourceId),
        eq(alertRule.enabled, true),
      ),
    });
    const fires = evaluateRules(rules, reading, recent);
    for (const fire of fires) {
      await dispatchAlert(sub.userId, cred.cgmSourceId, fire, inserted[0].id);
    }
  }
}
```

That's the heart of it. Everything else is plumbing. Note the fan-out: one source's reading produces alerts for every active subscriber, with each subscriber's own rules.

---

## 4. Data model (Drizzle)

`packages/db/src/schema/`. Seven tables. Source: doc 02.

The schema is built around a **CGM source** (one wearer's Dexcom data stream). Subscribers join a source via `cgm_subscription`, and rules + events are per-(subscriber, source). This shape supports v1 family-follower fan-out (one source → many subscribers) and the v2 mirror case (one user → many sources) with no further migration.

```ts
// cgm-user.ts
export const cgmUser = pgTable('cgm_user', {
  userId: uuid('user_id').primaryKey(),                   // mirrors Gently Core's user.id
  segment: text('segment', { enum: ['diabetes', 'metabolic_health', 'unspecified'] })
    .notNull().default('unspecified'),
  expoPushToken: text('expo_push_token'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// cgm-source.ts — one row per CGM data stream / wearer.
export const cgmSource = pgTable('cgm_source', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').notNull(),           // who connected the credentials
  displayName: text('display_name').notNull(),            // "My CGM" / "Aiden" / "Mom"
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// dexcom-credential.ts — keyed on source, not user. 1:1 with cgm_source.
export const dexcomCredential = pgTable('dexcom_credential', {
  id: uuid('id').primaryKey().defaultRandom(),
  cgmSourceId: uuid('cgm_source_id').notNull()
    .references(() => cgmSource.id, { onDelete: 'cascade' })
    .unique(),
  region: text('region', { enum: ['us', 'ous', 'jp'] }).notNull().default('us'),
  username: text('username').notNull(),
  encryptedPassword: text('encrypted_password').notNull(),
  accountId: uuid('account_id'),
  sessionId: uuid('session_id'),
  sessionRefreshedAt: timestamp('session_refreshed_at'),
  lastPolledAt: timestamp('last_polled_at'),
  lastSuccessAt: timestamp('last_success_at'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// cgm-subscription.ts — many-to-many: which users get alerts about which sources.
export const cgmSubscription = pgTable('cgm_subscription', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  cgmSourceId: uuid('cgm_source_id').notNull()
    .references(() => cgmSource.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'follower'] }).notNull(),
  acceptedAt: timestamp('accepted_at'),                   // null until follower accepts
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userSourceIdx: uniqueIndex('user_source_idx').on(t.userId, t.cgmSourceId),
  sourceIdx: index('subscription_source_idx').on(t.cgmSourceId),
}));

// cgm-invite.ts — short-lived invite tokens; consumed into cgm_subscription on accept.
export const cgmInvite = pgTable('cgm_invite', {
  id: uuid('id').primaryKey().defaultRandom(),
  cgmSourceId: uuid('cgm_source_id').notNull()
    .references(() => cgmSource.id, { onDelete: 'cascade' }),
  invitedByUserId: uuid('invited_by_user_id').notNull(),
  token: text('token').notNull().unique(),                // crypto random
  expiresAt: timestamp('expires_at').notNull(),           // typically 7 days
  consumedAt: timestamp('consumed_at'),
  consumedByUserId: uuid('consumed_by_user_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// glucose-reading.ts — keyed on source, not user.
export const glucoseReading = pgTable('glucose_reading', {
  id: uuid('id').primaryKey().defaultRandom(),
  cgmSourceId: uuid('cgm_source_id').notNull(),
  value: integer('value').notNull(),                      // mg/dL
  trend: text('trend').notNull(),
  wallTime: timestamp('wall_time').notNull(),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
}, (t) => ({
  sourceTimeIdx: uniqueIndex('source_walltime_idx').on(t.cgmSourceId, t.wallTime),
  sourceTimeDescIdx: index('source_walltime_desc_idx').on(t.cgmSourceId, t.wallTime.desc()),
}));

// alert-rule.ts — per-(subscriber, source). Mom and dad each have their own rules.
export const alertRule = pgTable('alert_rule', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),                      // who gets alerted
  cgmSourceId: uuid('cgm_source_id').notNull(),           // about whose data
  kind: text('kind', {
    enum: [
      'low', 'high', 'falling_fast', 'rising_fast', 'stale',
      'spike_above', 'sustained_above', 'post_meal_unresolved', 'tir_breach',
    ],
  }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  threshold: integer('threshold'),
  durationMin: integer('duration_min'),
  vibrationPatternId: integer('vibration_pattern_id'),
  ledColor: text('led_color'),
  ledOnMs: integer('led_on_ms'),
  ledOffMs: integer('led_off_ms'),
  audioPatternId: integer('audio_pattern_id'),
  durationSec: integer('duration_sec').notNull().default(10),
  repeatAfterMin: integer('repeat_after_min'),
  escalateAfterMin: integer('escalate_after_min'),
}, (t) => ({
  userSourceIdx: index('rule_user_source_idx').on(t.userId, t.cgmSourceId),
}));

// alert-event.ts — per-(subscriber, source, rule).
export const alertEvent = pgTable('alert_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  cgmSourceId: uuid('cgm_source_id').notNull(),
  ruleId: uuid('rule_id').notNull(),
  glucoseReadingId: uuid('glucose_reading_id'),
  firedAt: timestamp('fired_at').defaultNow().notNull(),
  pushedAt: timestamp('pushed_at'),
  acknowledgedAt: timestamp('acknowledged_at'),
  escalatedAt: timestamp('escalated_at'),
}, (t) => ({
  unackedIdx: index('unacked_events_idx')
    .on(t.firedAt)
    .where(sql`acknowledged_at IS NULL`),
}));
```

### Credential encryption helper

`packages/db/src/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(process.env.DEXCOM_CRED_KEY!, 'base64');  // 32 bytes

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decrypt(packed: string): string {
  const [ivB64, tagB64, encB64] = packed.split('.');
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
```

Generate the key once with `openssl rand -base64 32` and put it in Railway as a service variable named `DEXCOM_CRED_KEY` (set on both `cgm-api` and `cgm-worker`). When you migrate to KMS later, add a `keyVersion` column and a versioned decrypt path.

---

## 5. Auth seam — verifying Gently Core JWTs

### What Gently Core mints (separate side, not in this repo)

Gently Core gets a new endpoint, e.g. `POST /auth/cgm-token`, that takes the user's existing Better-Auth session and returns a signed JWT:

```json
{
  "sub": "<userId>",
  "aud": "cgm-cloud",
  "iss": "https://api.gently.us",
  "exp": <now + 15min>,
  "iat": <now>
}
```

Signed with an RS256 keypair owned by Gently Core. The public key is served at `https://api.gently.us/.well-known/jwks.json`.

### What CGM Cloud does to verify

`packages/contract/src/auth.ts`:

```ts
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(process.env.GENTLY_CORE_JWKS_URL ?? 'https://api.gently.us/.well-known/jwks.json'),
  { cooldownDuration: 30_000 }
);

export interface VerifiedToken {
  userId: string;
}

export async function verifyGentlyCoreJwt(token: string): Promise<VerifiedToken> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: process.env.GENTLY_CORE_ISSUER ?? 'https://api.gently.us',
    audience: 'cgm-cloud',
  });
  if (typeof payload.sub !== 'string') throw new Error('Missing sub claim');
  return { userId: payload.sub };
}
```

### Wiring it into tRPC

`apps/api/src/trpc.ts`:

```ts
import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { verifyGentlyCoreJwt } from '@cgm/contract/auth';
import { db, cgmUser } from '@cgm/db';
import { eq } from 'drizzle-orm';

export async function createContext({ req }: CreateFastifyContextOptions) {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { userId: null };
  try {
    const { userId } = await verifyGentlyCoreJwt(token);
    // ensure cgm_user row exists (idempotent)
    await db.insert(cgmUser)
      .values({ userId })
      .onConflictDoNothing();
    return { userId };
  } catch {
    return { userId: null };
  }
}

const t = initTRPC.context<typeof createContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { userId: ctx.userId } });
});
```

JWT verify is **stateless**. CGM Cloud never calls back to Gently Core in the request hot path. Only `cgm_user` materialization on first contact.

---

## 6. Push delivery — Expo payload shape

`packages/contract/src/alert-payload.ts`:

```ts
import { z } from 'zod';

export const AlertPayloadSchema = z.object({
  type: z.literal('cgm_alert'),
  alertEventId: z.string().uuid(),
  ruleKind: z.enum([
    'low', 'high', 'falling_fast', 'rising_fast', 'stale',
    'spike_above', 'sustained_above', 'post_meal_unresolved', 'tir_breach',
  ]),
  glucose: z.number().int().nullable(),
  trend: z.string(),
  vibrationPatternId: z.number().int().nullable(),
  ledColor: z.string().nullable(),
  ledOnMs: z.number().int().nullable(),
  ledOffMs: z.number().int().nullable(),
  audioPatternId: z.number().int().nullable(),
  durationSec: z.number().int(),
});

export type AlertPayload = z.infer<typeof AlertPayloadSchema>;
```

`apps/worker/src/dispatch.ts`:

```ts
import { Expo } from 'expo-server-sdk';
import { db, cgmUser, alertEvent } from '@cgm/db';
import { eq } from 'drizzle-orm';
import type { AlertFire } from '@cgm/alert-engine';

const expo = new Expo();

export async function dispatchAlert(
  userId: string,
  cgmSourceId: string,
  fire: AlertFire,
  glucoseReadingId: string,
) {
  const user = await db.query.cgmUser.findFirst({ where: eq(cgmUser.userId, userId) });
  if (!user?.expoPushToken) return;
  if (!Expo.isExpoPushToken(user.expoPushToken)) return;

  const event = await db.insert(alertEvent)
    .values({ userId, cgmSourceId, ruleId: fire.ruleId, glucoseReadingId })
    .returning();

  const payload = {
    type: 'cgm_alert' as const,
    alertEventId: event[0].id,
    ruleKind: fire.kind,
    glucose: fire.glucose,
    trend: fire.trend,
    vibrationPatternId: fire.vibrationPatternId,
    ledColor: fire.ledColor,
    ledOnMs: fire.ledOnMs,
    ledOffMs: fire.ledOffMs,
    audioPatternId: fire.audioPatternId,
    durationSec: fire.durationSec,
  };

  const tickets = await expo.sendPushNotificationsAsync([{
    to: user.expoPushToken,
    sound: null,                       // silent — bracelet handles output
    priority: 'high',
    data: payload,
    contentAvailable: true,            // wake the iOS app silently
    _displayInForeground: false,
  }]);

  await db.update(alertEvent)
    .set({ pushedAt: new Date() })
    .where(eq(alertEvent.id, event[0].id));

  // (optional) inspect tickets for delivery errors and retry/log
}
```

The mobile side's responsibility is in doc 02 § "Push transport: Expo's push service". Hot path on receive: BLE write first, ack second.

### The other direction: live UI polling

Push is for alarms. The dashboard's live glucose display uses a pull from the cloud, not push:

```ts
// apps/api/src/routers/readings.ts
export const readingsRouter = router({
  latest: protectedProcedure.query(async ({ ctx }) => {
    return db.query.glucoseReading.findFirst({
      where: eq(glucoseReading.userId, ctx.userId),
      orderBy: desc(glucoseReading.wallTime),
    });
  }),
  history: protectedProcedure
    .input(z.object({ hours: z.number().int().min(1).max(72).default(24) }))
    .query(async ({ ctx, input }) => {
      return db.query.glucoseReading.findMany({
        where: and(
          eq(glucoseReading.userId, ctx.userId),
          gt(glucoseReading.wallTime, new Date(Date.now() - input.hours * 3600_000)),
        ),
        orderBy: asc(glucoseReading.wallTime),
      });
    }),
});
```

Mobile dashboard hook:

```ts
// apps/expo/src/features/cgm/hooks/useLiveGlucose.ts (in Gently Core repo)
export function useLiveGlucose() {
  const { data } = cgmApi.readings.latest.useQuery(undefined, {
    refetchInterval: 30_000,    // poll every 30s while screen is visible
    refetchIntervalInBackground: false,  // stop when backgrounded
  });
  return data;
}
```

That's it. The dashboard feels live; the cloud stays the source of truth; no extra polling on the phone; no credentials on the phone.

---

## 7. Alert engine

Pure functions. Zero I/O. Easy to unit test. Lives in `packages/alert-engine`.

`packages/alert-engine/src/types.ts`:

```ts
export interface AlertFire {
  ruleId: string;
  kind: string;
  glucose: number | null;
  trend: string;
  vibrationPatternId: number | null;
  ledColor: string | null;
  ledOnMs: number | null;
  ledOffMs: number | null;
  audioPatternId: number | null;
  durationSec: number;
}
```

`packages/alert-engine/src/rules.ts` (sketch):

```ts
import type { AlertFire } from './types';

export function evaluateRules(
  rules: AlertRuleRow[],
  latest: ReadingRow,
  recent: ReadingRow[],
): AlertFire[] {
  const fires: AlertFire[] = [];
  for (const r of rules) {
    const fire = evalOne(r, latest, recent);
    if (fire) fires.push(fire);
  }
  return fires;
}

function evalOne(rule: AlertRuleRow, latest: ReadingRow, recent: ReadingRow[]): AlertFire | null {
  switch (rule.kind) {
    case 'low':           return latest.value < (rule.threshold ?? 70)  ? toFire(rule, latest) : null;
    case 'high':          return latest.value > (rule.threshold ?? 250) ? toFire(rule, latest) : null;
    case 'spike_above':   return latest.value > (rule.threshold ?? 140) ? toFire(rule, latest) : null;
    case 'falling_fast':  return rateOfChange(recent) < -(rule.threshold ?? 3) ? toFire(rule, latest) : null;
    case 'rising_fast':   return rateOfChange(recent) >  (rule.threshold ?? 3) ? toFire(rule, latest) : null;
    case 'stale':         return staleMin(latest) > (rule.durationMin ?? 20) ? toFire(rule, latest) : null;
    case 'sustained_above':
      return sustainedAbove(recent, rule.threshold ?? 120, rule.durationMin ?? 90)
        ? toFire(rule, latest) : null;
    case 'post_meal_unresolved':
      return postMealUnresolved(recent, rule.threshold ?? 110, rule.durationMin ?? 120)
        ? toFire(rule, latest) : null;
    case 'tir_breach':
      return tirBreach(recent, rule.threshold ?? 70 /* % */) ? toFire(rule, latest) : null;
  }
  return null;
}

function toFire(r: AlertRuleRow, latest: ReadingRow): AlertFire {
  return {
    ruleId: r.id,
    kind: r.kind,
    glucose: latest.value,
    trend: latest.trend,
    vibrationPatternId: r.vibrationPatternId,
    ledColor: r.ledColor,
    ledOnMs: r.ledOnMs,
    ledOffMs: r.ledOffMs,
    audioPatternId: r.audioPatternId,
    durationSec: r.durationSec,
  };
}

// helpers: rateOfChange, staleMin, sustainedAbove, postMealUnresolved, tirBreach
// — all pure, all unit-testable against fixture CSVs
```

Preset packs in `packages/alert-engine/src/presets.ts`:

```ts
export const DIABETES_PRESETS: PresetRule[] = [
  { kind: 'low',          threshold: 70,  ledColor: 'Red',     vibrationPatternId: 12, audioPatternId: 1, durationSec: 30, repeatAfterMin: 2 },
  { kind: 'high',         threshold: 250, ledColor: 'Yellow',  vibrationPatternId: 5,  audioPatternId: null, durationSec: 15, repeatAfterMin: 5 },
  { kind: 'falling_fast', threshold: 3,   ledColor: 'Magenta', vibrationPatternId: 8,  audioPatternId: null, durationSec: 10, repeatAfterMin: 1 },
  { kind: 'stale',        durationMin: 20, ledColor: 'Cyan',   vibrationPatternId: 3,  audioPatternId: null, durationSec: 5,  repeatAfterMin: null },
];

export const METABOLIC_HEALTH_PRESETS: PresetRule[] = [
  { kind: 'spike_above',          threshold: 140, ledColor: 'Yellow',  vibrationPatternId: 4, audioPatternId: null, durationSec: 5,  repeatAfterMin: null },
  { kind: 'sustained_above',      threshold: 120, durationMin: 90,  ledColor: 'Yellow',  vibrationPatternId: 6, audioPatternId: null, durationSec: 8,  repeatAfterMin: 30 },
  { kind: 'post_meal_unresolved', threshold: 110, durationMin: 120, ledColor: 'Magenta', vibrationPatternId: 7, audioPatternId: null, durationSec: 8,  repeatAfterMin: null },
  { kind: 'tir_breach',           threshold: 70,                    ledColor: 'Cyan',    vibrationPatternId: 2, audioPatternId: null, durationSec: 5,  repeatAfterMin: null },
  { kind: 'low',                  threshold: 70,                    ledColor: 'Red',     vibrationPatternId: 12, audioPatternId: 1, durationSec: 30, repeatAfterMin: 2 },  // safety
];
```

When user picks a segment in onboarding, the API copies the relevant pack into `alert_rule` rows for that user. From there the user can disable, customize, or add their own.

---

## 8. Worker loop

`apps/worker/src/index.ts`:

```ts
import cron from 'node-cron';
import { db, dexcomCredential } from '@cgm/db';
import { eq } from 'drizzle-orm';
import { pollOne } from './poll';
import { runEscalations } from './escalate';

// 60-second polling
cron.schedule('* * * * *', async () => {
  const active = await db.select({ id: dexcomCredential.id })
    .from(dexcomCredential)
    .where(eq(dexcomCredential.active, true));

  // stagger across the minute so we don't hammer Dexcom in one second
  const stride = Math.max(1, Math.floor(55_000 / Math.max(1, active.length)));
  for (let i = 0; i < active.length; i++) {
    setTimeout(() => pollOne(active[i].id).catch(console.error), i * stride);
  }
});

// escalation timer — every minute, find unacked events that need re-fire
cron.schedule('* * * * *', () => {
  runEscalations().catch(console.error);
});

console.log('worker started');
```

### Scaling notes

- Single Postgres + single worker is fine to single-digit thousands of users.
- When concurrent polls cross the open-tx ceiling, swap `node-cron` for `pg-boss` (Postgres-backed durable jobs, free) or Inngest (managed, durable execution + retries + observability).
- Don't pre-optimize. Build it simple, watch metrics.

### Healthcheck

`apps/worker/src/health.ts` — expose a tiny HTTP handler on a port Railway's healthcheck can hit:

```ts
import http from 'node:http';
import { db, dexcomCredential } from '@cgm/db';
import { lt, and, eq } from 'drizzle-orm';

http.createServer(async (req, res) => {
  if (req.url !== '/healthz') { res.writeHead(404).end(); return; }
  // unhealthy if any active credential hasn't succeeded in > 5 min
  const stale = await db.select({ id: dexcomCredential.id })
    .from(dexcomCredential)
    .where(and(
      eq(dexcomCredential.active, true),
      lt(dexcomCredential.lastSuccessAt, new Date(Date.now() - 5 * 60_000)),
    ))
    .limit(1);
  res.writeHead(stale.length ? 503 : 200).end(stale.length ? 'stale' : 'ok');
}).listen(8080);
```

---

## 9. Configuration / secrets

`.env.example`:

```bash
# Database
DATABASE_URL=postgres://cgm:cgm@localhost:5432/cgm

# Credential encryption — generate once with: openssl rand -base64 32
DEXCOM_CRED_KEY=

# Auth seam
GENTLY_CORE_JWKS_URL=https://api.gently.us/.well-known/jwks.json
GENTLY_CORE_ISSUER=https://api.gently.us

# Expo Push
EXPO_ACCESS_TOKEN=                    # optional, only if using project-scoped tokens

# Service identity
NODE_ENV=development
PORT=3000

# Observability (later)
SENTRY_DSN=
```

### Production variables (Railway)

```bash
# Switch to your Railway project first: `railway link`

railway variables --service cgm-api set \
  DEXCOM_CRED_KEY="..." \
  GENTLY_CORE_JWKS_URL="https://api.gently.us/.well-known/jwks.json" \
  GENTLY_CORE_ISSUER="https://api.gently.us"

railway variables --service cgm-worker set \
  DEXCOM_CRED_KEY="..."
```

`DATABASE_URL` is automatically injected on every service that's connected to the project's Postgres add-on via Railway's reference-variable syntax: set it as `${{ Postgres.DATABASE_URL }}` in each service's variables. Variables live in Railway's vault, not in env files in the repo.

---

## 10. Local dev

`docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: cgm
      POSTGRES_PASSWORD: cgm
      POSTGRES_DB: cgm
    ports: ['5432:5432']
    volumes: ['./.data/postgres:/var/lib/postgresql/data']
```

Workflow:

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate                  # apply Drizzle migrations
pnpm dev                         # turbo runs api + worker in parallel
```

Use a real Dexcom test account with Share enabled + a follower invited. Verify a poll works by tailing the worker logs after `pnpm dexcom:smoke` (a tiny script that connects + fetches + prints, in `packages/dexcom/scripts/smoke.ts`).

---

## 11. Deploy to Railway

One Railway project (`gently-cgm-cloud`), three services + one Postgres add-on:

```bash
# From the repo root, after pushing to GitHub:
railway login
railway init                      # creates the project
railway link                      # link this checkout to it

# Add Postgres
railway add --plugin postgres

# Create three services. Easiest path: connect the GitHub repo via the dashboard
# and set up three services, each with a different "Root Directory" or "Start Command":
#
# Service: cgm-api      Root: apps/api      Start: pnpm start
# Service: cgm-worker   Root: apps/worker   Start: pnpm start
# Service: cgm-web      Root: apps/web      Start: pnpm start
#
# Each service gets these variables set in the Railway dashboard:
#   DATABASE_URL = ${{ Postgres.DATABASE_URL }}
#   DEXCOM_CRED_KEY = <generated value, on api+worker only>
#   GENTLY_CORE_JWKS_URL, GENTLY_CORE_ISSUER (on api only)
```

Each service's `package.json` exposes `start` (production) and `dev` (local) scripts. Railway runs the `start` script on deploy.

- `cgm-api` exposes port 3000 (Railway auto-detects), healthcheck on `/healthz`.
- `cgm-worker` doesn't expose a public port. Railway will keep it running as long as the process doesn't exit; the internal `/healthz` on `localhost:8080` is for the worker to self-monitor and crash on stale state. Pair with Better Stack pinging the api's `/healthz` for external uptime.
- `cgm-web` runs Next.js on the port Railway provides via `process.env.PORT`.

Custom domains via Railway dashboard:
- `cgm-api.gently.us` → `cgm-api`
- `cgm.gently.us` → `cgm-web`

CI: Railway auto-deploys on push to main when the repo is connected. (No GitHub Action needed for v1.) Each service can be configured for its own auto-deploy branch and PR previews if you want preview environments.

---

## 12. Build sequence — week by week

A practical order. Each milestone is independently shippable; each one validates the next.

### Week 1 — seam + skeleton

- [ ] Repo scaffolded: `pnpm init -y` with workspaces, Turborepo config, ESLint, Prettier, tsconfigs in `tooling/`.
- [ ] `packages/contract` written with the JWT verifier.
- [ ] `apps/api` running locally with one route: `whoami`. Returns the verified `userId` from a Gently Core JWT.
- [ ] **Drop into Gently Core repo:** `/auth/cgm-token` mint endpoint. Generate the RS256 keypair, publish JWKS.
- [ ] Curl-test the round trip end to end. Green = seam works. Stop here, breathe, then move on.

### Week 1 (continued) — Dexcom POC

- [ ] `packages/dexcom` written.
- [ ] `packages/dexcom/scripts/smoke.ts` — CLI that takes username/password from env, prints latest reading.
- [ ] Run against your real Dexcom test account. Green = Dexcom path works.

### Week 2 — DB + connect flow + poller (with sources)

- [ ] `packages/db` with all seven tables (`cgm_user`, `cgm_source`, `dexcom_credential`, `cgm_subscription`, `cgm_invite`, `glucose_reading`, `alert_rule`, `alert_event`), migration applied locally.
- [ ] `dexcom-credential` insert/encrypt round-trips correctly, keyed on `cgmSourceId`.
- [ ] `apps/api/src/routers/dexcom.ts` `connect` / `disconnect` / `listSources` routes — `connect` creates source + cred + owner subscription in one transaction.
- [ ] `apps/worker` with the cron loop calling `pollOne`, iterating by source, inserting `glucose_reading` keyed on `cgmSourceId`. Verify with a single owner subscription first (no fan-out yet).

### Week 2-3 — alert engine + push (with fan-out)

- [ ] `packages/alert-engine` rules + presets + unit tests against fixture CSVs (record an hour of your own Dexcom data and write tests around it).
- [ ] Worker fan-out: load active subscribers per source, evaluate each subscriber's own rules, dispatch per subscriber.
- [ ] `dispatchAlert(userId, cgmSourceId, fire, glucoseReadingId)` via Expo Push. **Test target: Android device (primary platform during dev).** Hardcoded LED pattern at first.
- [ ] **Mobile side (Android-first):** add CGM module in Gently Core repo, wire push handler to existing BLE service. First green: a manual `curl` to dispatchAlert lights the bracelet on the Android device. iOS verification happens during the second-platform pass after Android is locked.

### Week 3 — onboarding + rules UI

- [ ] Onboarding fork: "Connect your own CGM" vs "Follow an invite."
- [ ] Mobile screens: "Connect Dexcom" form (with display name field), segment picker, rules list (scoped to the active source).
- [ ] `apps/web` minimal: glucose chart for last 24h, list of rules per source, manual rule editor.

### Week 3-4 — invitation flow + escalation + ack + stale

- [ ] `apps/api/src/routers/invites.ts` — `create` / `accept` / `revoke` / `list`.
- [ ] Owner UI: "Manage followers" screen on mobile + web. Generate invite, share link/code out-of-band, see active and pending followers, revoke.
- [ ] Follower UI: paste invite token or open invite link → accept flow.
- [ ] Escalation worker (timer-based re-fire on unacked events). Per-subscriber acks.
- [ ] Ack route + push action button.
- [ ] Stale-data alert as a first-class rule kind.
- [ ] "Last seen" indicator on mobile + web (per source).

### Week 5 — copy + deploy + iOS pass

- [ ] All disclaimer / TOS / onboarding copy. Includes caregiver-mode wording ("you're following X's CGM").
- [ ] Deploy api + worker + web to Railway.
- [ ] Domains, certs, observability (Sentry).
- [ ] Healthcheck + uptime monitoring.
- [ ] **iOS second-platform pass:** verify silent push wake, BLE write timing under iOS background limits, personal-team build push reliability. Fix any Apple-specific issues. Decide whether a paid developer account is needed before App Store distribution.

### Parallel, anytime

- [ ] File the Dexcom Strategic Partnership Interest Questionnaire — even if the answer is no, it's free optionality.
- [ ] Build a simple "internal status" page that pings api, worker, and Dexcom Share itself. Useful when the user reports their bracelet didn't buzz.

---

## What's deliberately **not** in this doc

- **Libre / LibreLinkUp adapter** (v1.1) — same shape as Dexcom, separate package. Each Libre account becomes its own `cgm_source`.
- **Nightscout adapter** (v1.1) — same shape, separate package. Pulls from a user-provided Nightscout URL into a `cgm_source`.
- **Multi-source-per-subscriber UI** (v2) — schema already supports it (`cgm_subscription` is many-to-many). v1 mobile UI scopes views to one active source at a time. v2 use case: one parent monitoring two T1D children, each with separate display name and alert configuration. Add a source-picker to the mobile shell + per-source onboarding for additional kids.
- **Web dashboard polish** — start with a functional Next.js app; design pass later.
- **Push notification action buttons** (one-tap ack from lock screen) — Expo supports these but they're non-trivial to set up; ship after the core loop works.
- **KMS migration** — env-var key is fine for v1; rotate to KMS before any meaningful user count.
- **SMS / phone-call escalation** to an emergency contact — Twilio integration. Defer to v1.5 once the core loop is solid.
- **Email / SMS for invite delivery** — v1 uses out-of-band sharing (text the link/code yourself). Deferred email/SMS to keep the surface small.

These are all known and tracked, just out of scope for the first build.

---

## When in doubt

- Check the architectural decision in `01–03`. If it's settled there, follow it.
- If it's not settled, decide and write it down before coding.
- For Dexcom edge cases not in section 3c, look at `pydexcom` source (`https://github.com/gagebenne/pydexcom`) — that's the canonical reference.
- For the auth seam, use `jose` library on both sides — battle-tested JWT/JWKS handling.
- For Postgres idioms, mirror what Gently Core does. Don't reinvent.
