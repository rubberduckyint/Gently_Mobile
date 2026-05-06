# Gently — Bracelet Platform

This repo is the **Gently bracelet platform**: a custom BLE smart bracelet that delivers tactile/visual/audio notifications (vibration, LED, buzzer) plus its companion mobile app and a web dashboard for device management.

This is **not** the CGM alert system. The CGM system is a separate, independent service in its own repo (`../Gently_CGM_Cloud/`) — see `./docs/`.

## Pivot status

The product is mid-pivot from a generic alarm/notification accessory to a CGM alert extension.

- **Phase 1 (done):** removed all alarm scheduling/management UI, components, BLE event commands, and DB tables. Kept device connectivity + the three notification primitives (vibrate / sound / light). Added a debug screen with three trigger buttons on the device detail page.
- **Phase 2 (in progress):** Dexcom integration. **Threshold logic, glucose data, and Dexcom credentials live in `Gently_CGM_Cloud`, not here.** This repo only gains a CGM feature module in the mobile app and a small `/auth/cgm-token` endpoint on the API.

## Stack

| Layer | Tech |
|---|---|
| Mobile | React Native, Expo SDK 55, Expo Router, NativeWind |
| Web | Next.js 15, React 19, Tailwind v4, Radix UI |
| API | tRPC + React Query |
| Auth | Better-Auth (OTP / Google / Apple) |
| DB | PostgreSQL 17 + Drizzle ORM |
| BLE | react-native-ble-manager + custom TEA-encrypted protocol |
| Build | Turborepo, EAS Build (mobile), Node 22, pnpm 10 |
| Analytics | Vexo |

## Repo layout

```
apps/
  expo/      React Native mobile app (iOS + Android) — Expo SDK 55, Expo Router
  nextjs/    Web dashboard — Next.js 15, React 19
packages/
  api/         tRPC routers (shared between mobile + web)
  auth/        Better-Auth (email OTP, Google OAuth, Apple Sign In)
  db/          Drizzle ORM, PostgreSQL 17
  email/       React Email + SMTP
  shared/      Shared utils
  validators/  Zod schemas
```

## DB (current)

- `User` — Better-Auth managed
- `Device` — id, title, description, serialNumber, batteryLevel, syncStatus, userId
- `UserPreferences` — id, userId, pushNotificationToken

The old `Alarm` table was removed. CGM-related tables (Dexcom credentials, glucose readings, alert rules, alert events) **do not** live here — they live in CGM Cloud.

## BLE protocol (relevant context)

- Service UUID `F021`, request char `F023` (write), response char `F024` (notify)
- TEA encryption (64-bit block, 128-bit key)
- Per-session dynamic key derived from device uptime XOR factory key XOR serial number
- Connection flow: scan for "Gently"-advertising devices → parse encrypted advert (serial / battery / firmware) → connect with 3-attempt retry → request MTU (Android) → discover services → derive key → validate → sync clock
- Commands: get/set time, get device info/status, find-me, DFU, reboot, trigger LED pattern, trigger vibration pattern, trigger audio pattern
- Bracelet capabilities: 64 vibration patterns × 4 intensities × 1–60s; 7 LED colors with configurable on/off timing; configurable buzzer beep pattern; battery monitoring with 5-level status; async push notifications from device; Find Me; DFU mode

## Constraints

- **Solo dev, free-tier Apple Developer account.** Apple Sign In and Push Notification entitlements aren't available on personal-team device builds. Some capabilities have to be stripped for personal-team builds. The CGM alarm path uses **Expo Push** (not direct APNs) specifically to sidestep this.
- **Background BLE on iOS is constrained.** This is one of the reasons the CGM alarm engine lives on the cloud, not on the phone.
- **Test user:** `extraspecialtestuser@gentlyus.com` / OTP `123456` bypasses BLE entirely with a mock service so Apple App Review can test without hardware.

## Platform priority for CGM v1 work

CGM v1 development is **Android-first**. Dave develops on Android (his daily-driver platform; faster iteration). iOS is the second-platform polish + release pass once Android end-to-end is proven.

When working on CGM-related features in this repo:
- Default test target is **Android** (emulator + a paired Gently bracelet for BLE round-trips).
- Validate the silent-push → BLE write path on Android first.
- iOS-specific work (background BLE timing, personal-team push reliability, BackgroundTasks) is deferred to the iOS pass — not blocking for the Android-first build.
- The architecture (Expo Push, cloud-mediated alarms, mobile CGM feature module) supports both platforms by design — Android-first is a dev-cycle choice, not an architectural one.

Pre-existing app surfaces (auth, device pairing, BLE protocol) remain platform-balanced as before.

## Platforms / build

- iOS: `com.gentlyus.mobile` (prod), `com.gentlyus.mobile-dev` (dev)
- Android: `com.gentlyus.gently` (prod), `com.gentlyus.gently.dev` (dev)
- App Store Connect ID `6752447097`, EAS project `e881c3b6-0d21-4cc4-8933-176c9d6eb00e`
- EAS profiles: `development` / `preview` / `production`

---

## Relationship to Gently CGM Cloud

The CGM alert system is a separate, independent service in its own repo (`../Gently_CGM_Cloud/`). The two are joined only by a JWT auth seam. Full architecture: `./docs/`.

### What stays here

- `User` (Better-Auth)
- `Device` (the bracelet records)
- `UserPreferences` including `pushNotificationToken`
- BLE protocol, encryption, command builders
- Pairing flow, OTA / DFU
- Mobile app shell (Expo)
- Device-management web dashboard
- Auth web pages

### What lives in CGM Cloud (must NOT be added here)

- Dexcom credentials, glucose readings, alert rules, alert events
- The Dexcom Share client
- The 60-second poller
- The alert engine
- Push dispatch for CGM alerts
- The glucose / rules web dashboard

If a feature touches CGM data, it goes in `Gently_CGM_Cloud/`, not here.

### What this repo owes the seam

Two small additions to support CGM Cloud:

1. **`/auth/cgm-token` endpoint** on the existing tRPC API — takes a valid Better-Auth session, returns a short-lived JWT scoped to `aud: "cgm-cloud"` (15 min, asymmetric signed). About 30 lines using the JWT library Better-Auth already pulls in. Public key published at `/.well-known/jwks.json` for CGM Cloud to verify.
2. **CGM feature module** in the mobile app at `apps/expo/src/features/cgm/` — talks to CGM Cloud's API (separate tRPC client at `apps/expo/src/services/api/cgm.ts`), receives push notifications with `type: "cgm_alert"`, dispatches via the existing BLE service to the bracelet, then acks back to CGM Cloud. The module imports BLE primitives but does not export anything CGM-specific back into the rest of the app.

### Boundary rules

- No CGM tables in this repo's Postgres.
- No Dexcom credentials in this repo, anywhere — env, code, logs, anywhere.
- The mobile CGM module sends the user's Expo push token to *both* Gently Core and CGM Cloud at consent time. That's the only reason CGM Cloud sees the token.
- If you find yourself adding "just one CGM thing" here, stop and put it in CGM Cloud.

## Architecture docs (source of truth)

- [./docs/01_dexcom_share_architecture_map.md](./docs/01_dexcom_share_architecture_map.md) — Dexcom Share API, audience segments, why cloud middleware
- [./docs/02_phase2_integration_plan.md](./docs/02_phase2_integration_plan.md) — DB schema, alert presets, build order
- [./docs/03_separated_cloud_architecture.md](./docs/03_separated_cloud_architecture.md) — auth seam, push token contract, mobile app shape
- [./docs/04_cgm_cloud_starter.md](./docs/04_cgm_cloud_starter.md) — CGM Cloud build map (mostly relevant on the *other* side, but useful for understanding what the seam is talking to)
- [./docs/05_stack_decisions.md](./docs/05_stack_decisions.md) — locked stack choices for CGM Cloud
