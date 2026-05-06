# Gently — Architecture & Decisions

This folder is the source of truth for cross-system design decisions. Code lives elsewhere; this is where the architecture lives.

## The docs

| File | What it covers |
|---|---|
| [01_dexcom_share_architecture_map.md](./01_dexcom_share_architecture_map.md) | Dexcom Share API (endpoints, auth flow, error codes), audience segments, why cloud middleware is required, how reference apps (SugarPixel, Glucose Projector, Nightscout) are wired |
| [02_phase2_integration_plan.md](./02_phase2_integration_plan.md) | Concrete implementation plan: DB schema, alert preset packs (diabetes + metabolic health), poller worker sketch, push transport, mobile module shape, build order |
| [03_separated_cloud_architecture.md](./03_separated_cloud_architecture.md) | Why CGM Cloud is a separate system, the JWT auth seam, push-token contract, repo/hosting/CC-project decisions |
| [04_cgm_cloud_starter.md](./04_cgm_cloud_starter.md) | CGM Cloud build map: repo structure, the actual Dexcom Share connection in code, data model in Drizzle, JWT verifier, push dispatch, env vars, week-by-week build sequence |
| [05_stack_decisions.md](./05_stack_decisions.md) | Locked stack choices with reasoning: Node 22 + Fastify + tRPC + Drizzle + Postgres + Railway + Expo Push. Includes alternatives considered for each axis |

Read in order if you're new to the project.

## Where the code lives

These docs live inside the Gently Core repo (`Gently_CGM/docs/`) so they have version history alongside the seam they describe. The two code bases are sibling repos under a shared workspace dir:

- `../` (this repo, `Gently_CGM/`) — existing Gently bracelet platform (BLE device + companion app + device-management web). Better-Auth, BLE protocol, mobile app shell.
- `../../Gently_CGM_Cloud/` — new independent CGM Cloud (Dexcom polling, alert engine, push dispatch, glucose dashboard). Trusts Gently Core JWTs; otherwise standalone.

Each code folder has its own `CLAUDE.md` with a focused slice of context, plus a pointer back here.

## Key product decisions (snapshot)

- **Audience:** all CGM users — diabetic (T1D/T2D/gestational), pre-diabetic, metabolic-health/wellness (Stelo, Lingo, Levels-style biohackers), athletes. Not T1D-only.
- **Data path:** Dexcom Share (real-time, ~5 min). Not the official OAuth Web API (1–3 hr delay). Apply for Dexcom Strategic Partnership in parallel for future Real-Time Partner API access.
- **Architecture:** two independent cloud systems joined only by a JWT auth seam. Glucose data and Dexcom credentials never leave CGM Cloud's DB.
- **Repo split:** Gently Core = existing repo. CGM Cloud = its own repo (`Gently_CGM_Cloud/`). Each its own CC project.
- **Mobile app:** stays one binary in the existing repo. CGM feature module imports the shared BLE service and talks to CGM Cloud over its own tRPC client.
- **Alert presets:** two packs (diabetes management, metabolic health), fully customizable per (subscriber, source).
- **Family-follower fan-out (v1):** one CGM source can have many subscribers — each with their own bracelet, push token, and rules. Use cases include caregivers in another room and divorced parents at separate locations watching the same kid. Schema also supports the v2 mirror case (one user → many sources).
- **Region:** US-first.
- **Platform priority:** Android-first for v1 development. iOS is the second-platform polish + release pass once Android end-to-end is locked.
- **Stack:** TS + Node 22 + Fastify + tRPC + Drizzle + Postgres + Railway for both systems. Expo Push for delivery. Full reasoning in [05_stack_decisions.md](./05_stack_decisions.md).
- **Hosting:** separate Railway projects, separate variables, separate Sentry. Two web dashboards: `app.gently.us` (Gently Core) and `cgm.gently.us` (CGM Cloud).

## Versioning

These docs are living. Major decisions get written down here before code lands. If you find yourself debating an architectural call in code review, check whether the docs already settled it — and if not, settle it here first, then implement.

## Memory

Dave's auto-memory in Cowork mode mirrors the high-level decisions captured here so future planning sessions don't re-litigate. The docs are the canonical record; memory is just a fast-recall summary.
