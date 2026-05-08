# Gently CGM Cloud — Stack Decisions

**Date locked:** 2026-05-05
**Status:** ⚠️ OBSOLETE as of 2026-05-07 — describes stack choices for the standalone "Gently CGM Cloud" repo that was abandoned in favor of consolidation into sibling repo `Gently_SRF` (single backend at `srf.gentlyus.com`). Three-Railway-services layout (`cgm-api` / `cgm-worker` / `cgm-web` at `cgm-api.gently.us` / `cgm.gently.us`) was never deployed. The actual locked stack lives in `Gently_SRF/CLAUDE.md`. Kept for historical context only.

This was the canonical record of every stack choice for the now-abandoned `Gently_CGM_Cloud` repo.

---

## TL;DR — the stack

```
Runtime:        Node 22 LTS + TypeScript
API server:     Fastify + tRPC
ORM:            Drizzle
Database:       Postgres 17 (Railway Postgres add-on)
Worker:         Node 22 + node-cron, upgrade to pg-boss when needed
Push delivery:  expo-server-sdk
Web:            Next.js 15 (App Router)
Hosting:        Railway (cgm-api + cgm-worker + cgm-web + Postgres add-on)
Variables:      Railway service variables
Errors:         Sentry
Uptime/logs:    Better Stack
JWT verify:     jose
Encryption:     Node crypto (AES-256-GCM) for Dexcom creds at rest
Lint/format:    ESLint + Prettier (mirror Gently Core configs)
Tests:          Vitest
Build:          Turborepo + pnpm
Node version:   pinned via .nvmrc → 22
Package mgr:    pnpm 10
```

---

## The decision dimensions

### Runtime / language → **Node 22 + TypeScript**

Considered: Node, Python (FastAPI + pydexcom), Go.

Picked Node because:
- Code reuse with Gently Core (validators, contract types, mobile-side tRPC client) is the single biggest velocity multiplier.
- The workload (per-user 60s polls, push dispatch, modest CRUD) doesn't demand Go-level perf or Python's async ergonomics.
- One language across mobile + cloud + web = one mental model for solo dev.

Python's pull was that `pydexcom` could be imported directly. Real, but the TS port is ~150 lines and we keep it in `packages/dexcom`. The reuse-with-mobile case beats it.

Go's pull was a tighter long-running worker. Also real, but irrelevant at our scale, and we'd lose tRPC.

### API framework → **Fastify + tRPC**

Considered: tRPC over Fastify, Hono + ts-rest, Fastify + OpenAPI, FastAPI.

Picked tRPC because the consumer is our own mobile app — type-safe end-to-end is too good to pass up, and the existing app already uses tRPC. Fastify is the underlying server (vs. Next.js routes) because the api needs to run as its own service, not bolted into the web app.

### ORM → **Drizzle**

Considered: Drizzle, Prisma, Kysely.

Picked Drizzle to match Gently Core. Prisma is heavier and the codegen step gets old. Kysely is nice but Drizzle is enough. Schema-as-TS lines up with the rest of our code.

### Database → **Postgres 17 (Railway add-on)**

Considered: plain Postgres, Postgres + TimescaleDB, MongoDB, DynamoDB.

Plain Postgres is the right call for v1. The data is relational (users, credentials, readings linked to rules linked to events). At single-digit thousands of users we generate ~2.9M readings/year — fine for vanilla Postgres with the indexes already specified in doc 04.

If/when readings table starts hurting on history queries past ~10M rows, **TimescaleDB extension** is a drop-in upgrade. Don't pre-optimize.

### Hosting → **Railway** *(switched from Fly.io)*

Considered: Railway, Fly.io, Render, GCP Cloud Run, Vercel + Neon, AWS (Lambda or ECS).

Originally recommended Fly.io for the long-running-worker fit. Switched to Railway after weighing:

- **Existing team experience.** Multiple prior projects on Railway. Solo-dev velocity always beats theoretical platform advantages.
- **Capability parity.** Railway handles always-on workers, managed Postgres, custom domains, secrets, and GitHub auto-deploy as well as Fly does for our workload. No Fly feature we'd actually use is missing.
- **Better DX polish + first-class preview environments.** Both nice-to-haves.
- **Better database UI.** Minor but real.
- **No multi-region need.** Worker hits Dexcom Share US-east; user latency for the worker is irrelevant.

Vercel falls out because long-running workers can't run there (10s function timeout). AWS falls out for solo-dev ops weight. Render is fine but no team experience. GCP Cloud Run requires a separate Cloud SQL setup and more glue.

### Worker scheduling → **node-cron** for v1, **pg-boss** as the upgrade path

Considered: node-cron, pg-boss, Inngest, Trigger.dev, BullMQ, Railway's Cron service primitive.

Picked node-cron for v1: 5 lines of code, no new dependencies, runs in-process. Simplest possible thing.

The upgrade path is **pg-boss** — Postgres-backed durable jobs, no new infrastructure needed (uses the same Postgres). Worth switching if/when we need retries, durable scheduling visibility, or backpressure.

**Inngest** was the most tempting alternative — managed durable execution, retries, observability, generous free tier. Defensible call, but adds a vendor and we don't yet know if we need it. Reconsider after first production incidents.

**Railway Cron** (run a script on a schedule, only billed for run-time) was tempting for cost on the worker side. Not picked because the always-on worker pattern lets us hold connection pools, cached Dexcom session IDs, and in-memory dedupe — meaningfully faster, and the cost difference is in the noise at our scale.

### Push delivery → **expo-server-sdk**

No real alternative considered. Already on Expo, already sidesteps the personal-team Apple APNs constraint, free, unified across iOS and Android.

### Web framework → **Next.js 15 App Router**

Mirrors Gently Core. Auth uses the same JWT seam as the mobile app, just with the JWT exchanged for a server-side cookie on first load. No reason to deviate.

### Error tracking → **Sentry**

Mirrors Gently Core. One project per service (`cgm-api`, `cgm-worker`, `cgm-web`) + the existing Gently Core project + the mobile project. Free tier is generous enough for early days.

### Uptime + log management → **Better Stack**

Considered: Better Stack, UptimeRobot, Datadog, Axiom.

Better Stack for both uptime pings (hits `cgm-api/healthz` every minute, alerts on failure) and log tailing (centralizes Railway service logs). Generous free tier. Datadog is overkill cost-wise.

### Secrets → **Railway service variables**

Fewest moving parts. Railway's variables are encrypted at rest and accessible via `process.env` in each service. Migrate to a dedicated secrets manager (Doppler, AWS Secrets Manager) only if audits demand.

### JWT verification → **jose**

The `jose` library is the modern standard for JWT/JWKS in Node, well-maintained, no quirks. Handles RemoteJWKSet with built-in caching for the public-key fetch from Gently Core's `/.well-known/jwks.json`.

### Encryption at rest → **Node crypto (AES-256-GCM)** for credentials, env-var key

Generated once with `openssl rand -base64 32`, stored as a Railway service variable. Add a `keyVersion` column when migrating to a managed KMS solution. v1 is fine with env var; revisit before any scale-up or audit.

### Build / monorepo → **Turborepo + pnpm 10**

Mirrors Gently Core. Workspace-aware caching is a real productivity win even on a single-developer project.

### Tests → **Vitest**

Fast, ESM-native, jest-compatible API. Used for unit-testing the alert engine (pure functions over fixture CSVs) and the Dexcom client (mocked HTTP responses).

---

## Three services on Railway

```
gently-cgm-cloud (Railway project)
├── cgm-api          public HTTP, port 3000, custom domain cgm-api.gently.us
├── cgm-worker       no public port, healthcheck via worker-internal /healthz on :8080
├── cgm-web          public HTTP, port from $PORT, custom domain cgm.gently.us
└── Postgres         add-on, attached to all three services as ${{ Postgres.DATABASE_URL }}
```

All three services pull from the same monorepo. Each service's Railway "Root Directory" points at `apps/<name>`, and the build runs `pnpm install --filter <name>... && pnpm --filter <name> build`. Start command is `pnpm --filter <name> start`.

GitHub auto-deploy on push to `main`. Set up preview environments later if useful — first-class on Railway, just not v1-critical.

---

## What we're explicitly NOT doing

- **Microservices beyond api/worker/web.** Three services is a feature, not a starting point for ten.
- **Kubernetes / ECS / EKS / EC2.** Not at this scale and not for this team size.
- **Lambda / Cloud Functions.** Long-running pollers are awkward on serverless; we'd end up with EventBridge + Step Functions which is more ops than the workload deserves.
- **GraphQL.** No multi-client problem here. tRPC wins.
- **MongoDB / DynamoDB.** Data is relational; don't fight it.
- **Bun in production.** Use it in dev if you want; production stays Node 22 LTS until Bun has a longer track record.
- **Separate Redis instance.** Not needed for v1. pg-boss covers durable jobs in Postgres if/when we upgrade past node-cron.
- **OpenTelemetry self-hosted.** Sentry + Better Stack covers errors, uptime, and logs without standing up infra.

---

## Costs to expect (rough, v1)

- Railway: ~$5–10/month for the always-on worker + small api + small web at idle. Postgres add-on starts at ~$5/month. Scales with traffic and DB size.
- Sentry: free tier sufficient.
- Better Stack: free tier sufficient.
- Expo Push: free.
- Domain certs: free via Railway.

Total floor: roughly **$15–25/month** with no users. Each new active user adds negligible cost (a few cents/month in compute + DB rows).

---

## When to revisit this doc

- First time we hit a Railway-specific limit (rare).
- When considering Real-Time Partner API integration — may not change anything stack-wise but worth a re-read.
- Before any meaningful user count milestone (100, 1k, 10k) — sanity-check whether anything needs to change.
- If we ever decide to spin CGM Cloud out as its own product/company — entire doc applies as-is, no changes needed.
