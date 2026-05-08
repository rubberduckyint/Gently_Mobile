# Gently CGM — Separated-Cloud Architecture (v2)

**Date:** 2026-05-05
**Status:** ⚠️ OBSOLETE as of 2026-05-07 — superseded by the 2-repo / single-backend consolidation. The unified backend now lives in sibling repo `Gently_SRF` at `srf.gentlyus.com`. The 3-repo split this doc describes (separate CGM Cloud at `cgm-api.gently.us`, JWT seam, etc.) was abandoned. Kept for historical context only.
**Originally superseded:** v1 of this doc and `02_phase2_integration_plan.md` v1.

---

## TL;DR

The CGM ecosystem is fully independent from the existing Gently device-management ecosystem:

- **Separate repo** — `gently-cgm-cloud` (or similar).
- **Separate Claude Code project** rooted at that repo.
- **Separate Postgres**, separate hosting, separate secret store, separate observability.
- **Joined to Gently Core only by a JWT auth seam**, with the mobile app embedding both backends as clients.

Strong reasons:

1. **Regulatory blast radius.** CGM data is medical-adjacent (especially for the diabetes segment). Device pairing is not. Isolating the regulated workload makes future FDA framing, Dexcom partner application, audits, and any liability story dramatically cleaner.
2. **Different security posture.** CGM Cloud holds Dexcom Share *passwords* — much higher-value than device-pairing data. Different secret store, different network perimeter, different access logs.
3. **Different scaling shape.** Gently Core is request-driven (taps in the app). CGM Cloud is poll-driven (per-user 60-second pollers running 24/7) and push-driven (alert dispatch).
4. **Different release cadence and risk.** A bug in Gently Core is "rename device doesn't work." A bug in CGM Cloud is "low alert didn't fire at 3 a.m." Different deploy/observe/on-call profiles.
5. **Future optionality.** CGM Cloud can be its own product, licensed to third parties, open-sourced, sold, or replaced — without dragging Gently Core along.
6. **Cleaner mental model.** A diabetic user might use only the CGM features. A non-diabetic might use only the bracelet for sleep/workout buzzes. Two products under one brand.

The cost is mostly ops surface (two services, two DBs, two CI pipelines) and a small amount of integration glue. Worth it.

---

## The seam — who owns what

```
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│  GENTLY CORE (existing repo)         │    │  CGM CLOUD (new repo)                │
│                                      │    │                                      │
│  Identity & accounts                 │    │  Dexcom Share credentials (vault)    │
│  Device registry                     │    │  Glucose readings (time series)      │
│  BLE pairing & protocol              │    │  Alert rules (per user, per segment) │
│  Bracelet OTA / DFU                  │    │  Alert engine + escalation timers    │
│  General user prefs                  │    │  Poller worker (60s/user)            │
│  Push token registry                 │    │  Push dispatch to phones             │
│  Web dashboard for device mgmt       │    │  Web dashboard for glucose / rules   │
│  Mobile app shell + BLE service      │    │  Mobile feature module (alarm RX)    │
│  Better-Auth (OTP/Google/Apple)      │    │  Trusts Gently Core JWTs             │
│  PostgreSQL                          │    │  Its own PostgreSQL                  │
│                                      │    │                                      │
└────────────┬─────────────────────────┘    └─────────────────┬────────────────────┘
             │                                                │
             │   issues signed JWT (user identity)            │
             ├──────────────────────────────────────────────► │
             │                                                │
             ▼                                                ▼
       ┌─────────────────────────────────────────────────────────────┐
       │  EXPO MOBILE APP (one binary, lives in Gently Core repo)    │
       │   • Auth + device shell  → talks to Gently Core             │
       │   • CGM module           → talks to CGM Cloud               │
       │   • BLE service          → shared, owned by Gently Core     │
       │     receives alarm payload from push                         │
       │     dispatches to bracelet over BLE                          │
       └─────────────────────────────────────────────────────────────┘
```

**Cardinal rule:** glucose data and Dexcom credentials never leave CGM Cloud's database. Gently Core never queries them, never proxies them, never logs them.

---

## What each system owns

### Gently Core (existing repo, unchanged in scope)
- `User` (Better-Auth)
- `Device` (the bracelet records)
- `UserPreferences` including `pushNotificationToken`
- BLE protocol, encryption keys, command builders
- Pairing flow, OTA update flow
- Mobile app shell (Expo)
- Auth web pages
- Device-management web dashboard

### CGM Cloud (new repo)
- `cgm_user` (mirrors Gently Core's userId, segment selection, push token)
- `dexcom_credential` (encrypted Share creds, region, session cache)
- `glucose_reading` (time series)
- `alert_rule` (thresholds, mappings — both diabetes and metabolic-health rule kinds)
- `alert_event` (firings, ack state, escalation)
- 60-second poller worker
- Alert engine (pure functions)
- Push dispatch (Expo Push API direct)
- Separate Next.js web dashboard
- Its own Postgres

### What's shared across the seam
- The user's identity (a UUID — the same one Gently Core's Better-Auth issues)
- The Expo push token (CGM Cloud needs to dispatch alerts)
- Nothing else

---

## The contracts

### 1. Identity contract — JWTs from Gently Core

- Mobile user signs into Gently Core (Better-Auth session, unchanged).
- On entering CGM features, mobile app requests a **scoped JWT** from Gently Core: `sub = userId`, `aud = "cgm-cloud"`, `exp = ~15 min`, signed with a key pair Gently Core owns (asymmetric, private key on Gently Core, public key in JWKS).
- Mobile app passes that JWT in `Authorization: Bearer …` for every CGM Cloud request.
- CGM Cloud verifies signature against Gently Core's published `/.well-known/jwks.json`. **No back-channel** to Gently Core on every request.

CGM Cloud has no auth state of its own beyond a thin `cgm_user` row keyed on `userId`. Stateless verify.

Better-Auth doesn't mint scoped JWTs out of the box — you'll add a small `/auth/cgm-token` endpoint on Gently Core that takes a session and returns a signed JWT. Standard pattern, ~30 lines.

### 2. Push token contract — CGM Cloud stores its own copy

When the user enables CGM features, the mobile app sends its own Expo push token to CGM Cloud directly during onboarding. CGM Cloud stores it in `cgm_user.expoPushToken`. No back-channel to Gently Core needed.

When the token rotates (rare on Expo, but happens), the mobile app updates both backends — one extra `await` next to the existing token-update call.

### 3. Mobile app: one binary, two clients

The Expo app stays one app, in the existing Gently Core repo. Inside it, two HTTP clients:

```ts
// apps/expo/src/utils/api.tsx              → unified backend (tRPC, srf.gentlyus.com)
```

The CGM module (`apps/expo/src/features/cgm/`):
- Uses the existing BLE service (imported from Gently Core's BLE package).
- Receives push notifications, distinguishes payloads by `type === 'cgm_alert'`.
- Translates payload → BLE command using existing builders.
- Calls back to CGM Cloud to ack delivery.

The user sees one product. The seam is invisible to them.

### 4. Web dashboards: two separate Next.js apps

- `app.gently.us` → device-management web (existing, in Gently Core repo)
- `cgm.gently.us` → glucose / rules / history web (new, in CGM Cloud repo)

Bigger ops surface, cleaner regulatory story. Worth the trade.

---

## Repo / stack / hosting — confirmed decisions

### Repo: separate
**`gently-cgm-cloud`** — new, private, its own GitHub repo. Mirrors the Gently Core monorepo's tooling (TypeScript, Turborepo, Drizzle, Zod, ESLint config) so muscle memory transfers, but they're independent code bases.

The shared seam contract (`packages/contract`: JWT verifier helpers, alert payload Zod schema, push-token endpoint types) starts as duplicated TS files in both repos. If the duplication gets noisy, formalize as `@gently/cgm-contract` published to GitHub Packages later. For solo dev velocity, paste-and-keep-in-sync is fine until it isn't.

### Stack: Node 22 + TS, mirroring Gently Core
- Next.js 15 for the web dashboard
- tRPC for the API (separate instance from Gently Core's)
- Drizzle + Postgres 17
- Node 22 Express or Fastify worker for the poller (alternative: Inngest if you want durable execution out of the box)
- Expo's `expo-server-sdk` for push dispatch
- Zod everywhere

The alert engine itself sits in `packages/alert-engine` as **pure functions with no I/O** — portable to any future runtime.

### Hosting: Railway
- One Railway service for `cgm-api` (HTTP tRPC service)
- One Railway service for `cgm-worker` (the 60s poller) — long-running process, no exposed port
- One Railway service for `cgm-web` (Next.js dashboard) — alternatively Vercel if you prefer
- Railway Postgres add-on, attached to all three services via `${{ Postgres.DATABASE_URL }}`
- Railway environment variables for `DEXCOM_CRED_KEY`, `GENTLY_CORE_JWKS_URL`, etc.

Strict separation from wherever Gently Core is hosted: separate Railway project, separate environment variables, separate Sentry project, separate uptime monitoring (Better Stack pings the worker's `/healthz` — which fails if `lastSuccessAt` is stale across the fleet). Decision rationale and full stack details in `05_stack_decisions.md`.

### Domains
- `srf.gentlyus.com` → unified backend (tRPC API + admin web + Dexcom worker)

Single domain post-consolidation (2026-05-07). Earlier drafts of this doc planned `api.gently.us` / `cgm-api.gently.us` / `cgm.gently.us` for a 3-repo split that was abandoned.

### Claude Code project
A second CC project rooted at `gently-cgm-cloud`. Fresh `CLAUDE.md` capturing:
- Purpose: CGM alert dispatch system, independent of Gently Core.
- The auth-seam contract (JWT verification, no other coupling).
- Dexcom Share details that affect coding decisions (regions, app IDs, error codes, polling cadence, MFA risk).
- The "no glucose data leaves this system" rule.
- Regulatory framing (secondary alert, conservative copy).
- Stack conventions (Drizzle, tRPC, Zod) mirroring Gently Core for consistency.
- Pointer to this doc and `02_phase2_integration_plan.md` v2.

---

## What changes from v1

The v1 of this doc recommended same-monorepo-with-isolated-apps. Decision is now confirmed at separate repo + separate CC project.

Doc-level changes:
- "Repo" section: separate repo, not same monorepo.
- "Open decisions": all settled.
- Dependent doc: `02_phase2_integration_plan.md` v2 also updated — DB schema, package paths, and build order all reference the standalone `gently-cgm-cloud` repo.

Architectural content (auth seam, push token contract, the seam itself) is unchanged from v1. Only the repo/CC-project boundary tightened.

---

## Build order, with the auth seam first

1. **POC** (1 day) — TS port of pydexcom, CLI fetches a real reading.
2. **Auth seam scaffold** (1–2 days) — fresh repo, fresh CC project, `apps/api` with one route: `whoami`. Verifies JWT from Gently Core via JWKS, returns `{ userId }`. Add `/auth/cgm-token` to Gently Core to mint scoped JWTs. **This step proves the seam works before any data lands in CGM Cloud.**
3. **`packages/db` with own Postgres** (1 day) — five tables, encryption helper.
4. **Onboarding flow** (2 days) — Dexcom connect/disconnect, segment selection (diabetes / metabolic-health / unspecified), push-token send.
5. **Worker + alert engine** (3 days) — 60s poller, evaluate-rules, Expo push dispatch.
6. **Mobile CGM module** (1 day) — push handler → BLE write.
7. **Rules UI** (3–4 days) — preset cards (both packs) + custom mapper. Web dashboard parity.
8. **Escalation + ack** (2 days) — server-side timers, push action buttons.
9. **Stale-data + offline UX** (1–2 days).
10. **Disclaimer + onboarding copy** (1 day).
11. **(Parallel)** Dexcom Strategic Partnership application.

Roughly 3–4 weeks of focused solo dev.

---

## Trade-offs to be honest about

- **More ops.** Two services, two DBs, two CI pipelines, two on-calls. Real for a solo dev. Mitigation: identical patterns on both, healthcheck endpoints, uptime monitoring.
- **Auth complexity at the seam.** JWKS rotation, token expiry, scoped tokens. Solvable, ~30 lines of new code on Gently Core.
- **Mobile onboarding has two consent steps.** User logs into Gently (Core), then connects Dexcom (CGM Cloud). UX has to flow these together cleanly.
- **Two web dashboards.** More product surface; could collapse later with a unified shell.
- **Contract types duplicated** between repos until the noise warrants a private npm package. Acceptable for now.
- **Solo-dev velocity tax.** ~3–5 days more than the integrated plan. Worth it for the durable separation benefits.

---

## All open decisions from v1 — now resolved

- ✅ Separate repo or same monorepo? **Separate repo.**
- ✅ Push token Option A (CGM stores its own) vs B (asks Gently Core)? **Option A.**
- ✅ One web shell with framed views vs two separate dashboards? **Two separate.**
- ✅ JWT lifetime? **15 min access tokens, refresh from existing Better-Auth session.**
- ✅ Hosting? **Railway** (existing team experience; equivalent capability for our workload).
- ✅ Branding: separate "Gently CGM" or one Gently brand? **One Gently brand publicly; "CGM" is a feature name, not a separate product. Backend systems are named for engineering clarity.**

Still genuinely open (need user decision):
- Region focus: US-first vs both? Recommend US-first.
- Family followers in v1 scope or v1.1?

---

## Next concrete step

**Build the auth seam, not the Dexcom code.** A ~50-line `apps/api` `whoami` endpoint that verifies a Better-Auth-issued JWT. If that handshake works against your existing Gently Core deployment, everything else falls into place. If it doesn't, we discover the friction early.

Recommended sequence:
1. Create the `gently-cgm-cloud` repo + CC project.
2. Drop in baseline TS/Turborepo/Drizzle config.
3. Add `apps/api` with `whoami` (rejects unsigned, accepts signed, returns `{ userId }`).
4. Add `/auth/cgm-token` to Gently Core (mints scoped JWT with 15-min expiry).
5. Curl-test the round-trip from a mobile session token to a verified CGM Cloud `whoami`.

When the seam is green, the rest of Phase 2 follows the build order above.
