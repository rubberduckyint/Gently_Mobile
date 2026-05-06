# Snippet for the existing Gently app's CLAUDE.md

Paste this section into `Gently_CGM/CLAUDE.md`. The doc references below assume the docs live at `Gently_CGM/docs/` (their current home).

---

## Relationship to Gently CGM Cloud

This repo is the **Gently bracelet platform** — BLE device protocol, mobile app shell, device-management web, identity & accounts. It is **not** the CGM alert system.

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

If a feature touches CGM data, it goes in `../Gently_CGM_Cloud/`, not here.

### What this repo owes the seam

Two small additions to support CGM Cloud:

1. **`/auth/cgm-token` endpoint** on the existing tRPC API — takes a valid Better-Auth session, returns a short-lived JWT scoped to `aud: "cgm-cloud"` (15 min, asymmetric signed). About 30 lines using the JWT library Better-Auth already pulls in. Public key published at `/.well-known/jwks.json` for CGM Cloud to verify.
2. **CGM feature module** in the mobile app at `apps/expo/src/features/cgm/` — talks to CGM Cloud's API (separate tRPC client at `apps/expo/src/services/api/cgm.ts`), receives push notifications with `type: "cgm_alert"`, dispatches via the existing BLE service to the bracelet, then acks back to CGM Cloud. The module imports BLE primitives but does not export anything CGM-specific back into the rest of the app.

### Boundary rules

- No CGM tables in this repo's Postgres.
- No Dexcom credentials in this repo, anywhere — env, code, logs, anywhere.
- The mobile CGM module sends the user's Expo push token to *both* Gently Core and CGM Cloud at consent time. That's the only reason CGM Cloud sees the token.
- If you find yourself adding "just one CGM thing" here, stop and put it in CGM Cloud.

### Architecture docs

- [./docs/01_dexcom_share_architecture_map.md](./docs/01_dexcom_share_architecture_map.md)
- [./docs/02_phase2_integration_plan.md](./docs/02_phase2_integration_plan.md)
- [./docs/03_separated_cloud_architecture.md](./docs/03_separated_cloud_architecture.md)
