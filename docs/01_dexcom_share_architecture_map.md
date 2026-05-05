# Gently CGM × Dexcom — Architecture Map (v2)

**Date:** 2026-05-05
**Goal:** Retool the Gently app as a real-time alert accessory for any user wearing a CGM — diabetic and non-diabetic. Behavior parity with SugarPixel and Glucose Projector.

---

## Audience

Gently CGM is **not** a T1D-only product. Target segments span:

- **Diabetes management** — T1D, T2D, gestational. Highest-stakes alerts (low / high / falling fast).
- **Pre-diabetic / metabolic risk** — using CGMs to spot trends and intervene early.
- **Metabolic health / wellness** — Levels-style users, athletes, biohackers using over-the-counter CGMs (Dexcom Stelo, Abbott Lingo) to optimize diet, training, sleep. Lower-stakes informational alerts (post-meal spikes, sustained elevation, time-in-range).
- **Caregivers** — parents/partners of any of the above receiving follower notifications.

The architecture is identical for all segments; only the alert preset pack and onboarding copy change. Design conservatively for diabetic users (highest liability), market broadly to all of them.

---

## TL;DR

1. **The official Dexcom Web API is not viable for live alarms.** It carries an FDA-mandated delay (~1 hr in the US, ~3 hr OUS). Useful only for retrospective reports.
2. **Dexcom Share is the path** — same one SugarPixel, Glucose Projector, Sugarmate, Gluroo, Nightscout, and pydexcom all use. Latency is essentially the sensor's own 5-minute cadence.
3. **Build a thin cloud middleware**, not a phone-direct or device-direct connection. Reasons: credential storage, background polling when the phone is asleep, push/wake to the Gently device, fan-out to multiple Gentlies and family followers. Matches SugarPixel and Glucose Projector exactly.
4. **The Dexcom developer portal account does *not* give you access to Share.** Share is reverse-engineered, undocumented, authenticates with the user's Dexcom Share username/password (same creds as Dexcom Follow). Keep the dev-portal API key for the future delayed-data use case (weekly reports / time-in-range summaries).

---

## 1. Three possible Dexcom data paths

| Path | Latency | Auth | Approval needed | Good for |
|---|---|---|---|---|
| Official Dexcom Web API v3 | ~1 hr US / ~3 hr OUS | OAuth 2.0 (your dev portal key) | Sandbox open; production needs review | Retrospective reports, A1C-style summaries |
| **Dexcom Share (unofficial)** | ~5 min (sensor cadence) | User's Share username + password | None — but unsanctioned | **Live alerts, live displays** |
| Dexcom Real-Time Partner API | ~5 min | OAuth + partner agreement | Strategic Partnership review (slow, commercial bar) | Long-term sanctioned product |

The Real-Time Partner API is the right *eventual* path for a commercial medical-adjacent product. FDA-cleared (2021), sanctioned, real-time. But the partnership process is gated, takes months, and Dexcom can decline. Build on Share to validate, then file for partnership in parallel.

---

## 2. Dexcom Share API — everything you need

### Base URLs (region-specific)

| Region | Base URL |
|---|---|
| US | `https://share2.dexcom.com/ShareWebServices/Services/` |
| Outside US | `https://shareous1.dexcom.com/ShareWebServices/Services/` |
| Japan | `https://share.dexcom.jp/ShareWebServices/Services/` |

### Application IDs (must be sent in auth payloads)

| Region | App ID |
|---|---|
| US / OUS | `d89443d2-327c-4a6f-89e5-496bbb0317db` |
| Japan | `d8665ade-9673-4e27-9ff6-92db4ce13d13` |

These are well-known constants extracted from the Dexcom mobile clients; every open-source library uses them.

### Auth flow (3 steps)

```
[username + password + appId]
        │
        ▼
POST  /General/AuthenticatePublisherAccount        →  accountId  (UUID)
        │
        ▼
POST  /General/LoginPublisherAccountById           →  sessionId  (UUID)
        │
        ▼
POST  /Publisher/ReadPublisherLatestGlucoseValues  →  [readings]
       ?sessionId=<id>&minutes=<n>&maxCount=<n>
```

Header for all three: `Accept-Encoding: application/json`. Bodies are JSON.

**Auth payload** (steps 1 & 2):
```json
{ "accountName": "<email_or_username>", "password": "<pw>", "applicationId": "d89443d2-..." }
{ "accountId":   "<uuid>",              "password": "<pw>", "applicationId": "d89443d2-..." }
```

The session ID comes back as a bare JSON string. Cache it; good for ~hours. When you get `SessionIdNotFound` or `SessionNotValid`, re-authenticate.

### Glucose reading response shape

```json
[
  {
    "WT":    "Date(1746480000000)",         // wall-time, ms epoch
    "ST":    "Date(1746480000000)",         // system time
    "DT":    "Date(1746480000000-0700)",    // display time, includes tz offset
    "Value": 142,                            // mg/dL
    "Trend": "Flat"                          // see trend table
  }
]
```

**Trend codes:** `DoubleUp`, `SingleUp`, `FortyFiveUp`, `Flat`, `FortyFiveDown`, `SingleDown`, `DoubleDown`, `None`, `NotComputable`, `RateOutOfRange`.

`Value` is always **mg/dL**. Convert to mmol/L by × `0.0555`.

### Polling cadence

Sensors push new values to Dexcom every **5 minutes**. Conventional pattern:
- Poll every 60 seconds
- Use `minutes=10&maxCount=1` to fetch the most recent reading
- De-duplicate on `WT` (wall-time) so you don't re-fire alerts on the same value
- If you go a few minutes without a new value, that's normal; alert as stale only when > ~15 min

### Error codes you'll handle

| Code | Meaning | Handle |
|---|---|---|
| `SessionIdNotFound` / `SessionNotValid` | Session expired | Re-run auth, retry once |
| `AccountPasswordInvalid` | Bad creds | Surface to user |
| `SSO_AuthenticateMaxAttemptsExceeded` | Lockout | Back off, surface |
| `SSO_InternalError` w/ "Cannot Authenticate by AccountName" | Bad creds (variant) | Surface |
| `InvalidArgument` | Malformed payload | Bug in your code |

### Critical pre-req: the user must enable Share

In the Dexcom G6/G7/Stelo app: **Settings → Share → Share Status: ON**, with at least one follower invited (Dexcom requires it before Share is fully active). The user's phone needs to be online for the sensor data to reach Dexcom's cloud — that's how Share works at all.

**Onboarding step in the Gently CGM app:** verify Share is on by trying a login + reading fetch; if it returns nothing, walk the user through enabling it.

---

## 3. How the reference apps are wired

### SugarPixel (the closest analog)
- A small Wi-Fi display (ESP32-class hardware, 64×64 pixel matrix).
- The device itself does **not** talk to Dexcom Share directly. It hits a SugarPixel cloud relay.
- Cloud relay holds the user's Share credentials, polls Dexcom every minute, and pushes updates down to the device (HTTP/WebSocket).
- Same pattern across the Pixoo-style hobbyist clones — serverless backend (often AWS Lambda) + WebSocket fan-out to the device.

### Glucose Projector
- Wall/ceiling projector display.
- "Pulls data directly over Wi-Fi through an ongoing cloud relay." Requires 2.4 GHz Wi-Fi.
- Same shape: cloud middleware between Dexcom Share and the device.

### Nightscout (DIY, but worth knowing)
- Self-hosted server. The user runs a "Dexcom Bridge" plugin that does the same Share login + poll, then exposes the data via a documented Nightscout REST API and websocket.
- Many CGM displays support Nightscout as an alternative source. **You should support a Nightscout URL as an additional input** — it's the de-facto standard for the T1D community and earns trust.

**Pattern across all three:** small device + cloud relay holding the Dexcom credentials. None ship a phone-direct, BLE-to-Dexcom hardware design, because Dexcom Share data only exists in Dexcom's cloud — it never leaves the sensor by Bluetooth except to the user's own phone.

---

## 4. Recommended architecture for Gently CGM

Assumption (correct me if wrong): Gently is hardware that the user keeps near their bed/body, and the Gently mobile app is the companion / configuration app. The thing we need to make happen: when glucose crosses a user-defined threshold (low, high, spike, falling fast, stale data), the Gently device must alert.

```
┌────────────┐                       ┌──────────────────────────────┐
│ Dexcom     │  Share API (5-min)    │ Gently CGM Cloud (new piece) │
│ Cloud      │ ◄──────── poll ────── │                              │
└────────────┘                       │  • per-user creds (vault)    │
                                     │  • poller (1/min)            │
                                     │  • alert engine (thresholds, │
                                     │    rate-of-change, stale,    │
                                     │    spike, return-to-baseline)│
                                     │  • push/MQTT/WebSocket out   │
                                     └──────┬───────────────────────┘
                                            │
                ┌───────────────────────────┼────────────────────────────┐
                ▼                           ▼                            ▼
        ┌───────────────┐          ┌───────────────┐          ┌──────────────────┐
        │ Gently device │          │ Gently mobile │          │ Family follower  │
        │ (BLE / Wi-Fi) │          │   app         │          │ phone (optional) │
        └───────────────┘          └───────────────┘          └──────────────────┘
```

### Why cloud middleware (not phone-direct)

- **Background reliability.** iOS/Android aggressively kill apps in the background. A phone app polling Share will miss alerts during sleep, low-power mode, or DND. A cloud poller never sleeps.
- **Credential safety.** Share creds are the keys to a Dexcom account. Storing them on a hardware device's flash is risky; in a phone app they're at least in the keychain, but a server with proper KMS/secrets vault is the cleanest.
- **Hardware simplicity.** If Gently is Wi-Fi capable, it can stay dumb and simply receive "alert now" pushes. No HTTPS client, no JSON parser, no auth state, no token refresh.
- **Fan-out.** Multiple Gentlies in a household, family-follower notifications, web dashboard — all become trivial when the data lives in one cloud spot.
- **Future Real-Time Partner API.** When you eventually get partner approval, you swap the poller's data source from Share to the partner OAuth flow. The rest of the system stays.

### Why **not** rely solely on the phone app

The only reason to skip cloud is cost/complexity, but for a CGM alert product the reliability bar is "must work at 3 a.m. with the phone face-down across the room." That rules out phone-direct as the primary path — particularly for the diabetic-user segment.

### The actual MVP stack

| Layer | Recommendation | Why |
|---|---|---|
| Cloud compute | Node 22 + TS on Fly.io (HTTP API + worker machines), or Lambda + EventBridge if you prefer serverless | Mirror the existing Gently Core stack to minimize new mental load |
| Credential vault | AES-256-GCM in Postgres with key in env/KMS | Encrypted at rest; rotate via `keyVersion` column when KMS lands |
| State store | Postgres 17 + Drizzle (own instance, separate from Gently Core) | Same conventions as the existing app |
| Push to device | Expo Push Notifications | Same SDK already in the mobile app; sidesteps Apple-personal-team APNs limitations |
| Mobile app | Existing Expo app (one binary) with a CGM feature module | Re-use BLE service from Gently Core |
| Hardware firmware | Phone bridges BLE alerts to bracelet (since Gently is BLE-only) | No firmware redesign needed |

### Decision points already resolved

- **Gently bracelet is BLE-only.** Phone is the bridge between cloud and device. Confirmed from the existing app spec.
- **Existing app is Expo SDK 55 + Next.js + tRPC + Drizzle + Postgres.** New CGM Cloud mirrors the Node/TS stack for consistency.

---

## 5. Risks & landmines (read this before writing code)

### Unsanctioned API risk
The Share endpoints are not officially supported. Dexcom *could* break them or ban the application ID. In practice they have been stable for **a decade** (Nightscout has used them since ~2015) because Dexcom's own Follow app uses the same endpoints. Mitigation: keep the app-id pluggable, monitor a community channel (the Nightscout Discord and gluroo/sugarmate teams react fast), and have a Dexcom-Real-Time-Partner application in flight as a backup.

### MFA on Dexcom accounts
Dexcom has been rolling out optional 2FA. If the user has 2FA on their account, basic username/password Share login can fail or require re-auth flow. Right now most accounts work; watch this. A workaround used by some apps: ask the user to create a second Dexcom *follower* account (no MFA) and use those credentials for the Share login.

### Credential model
Decide upfront: do you store the user's Share password? Most reference apps do (encrypted) because Share has no OAuth. Inform the user explicitly during onboarding. Provide one-tap "forget my Dexcom credentials" — important for trust.

### Regulatory framing
You are not making medical decisions on behalf of the user — you are surfacing data they already see in the Dexcom app. Frame Gently as a **secondary alert / accessory** and copy the disclaimer language used by SugarPixel, xDrip, Sugarmate. Do **not** suggest replacing the Dexcom alarm. (When you later go for FDA clearance via Dexcom Partner approval, this framing also helps.) Note: regulatory exposure is concentrated on the diabetic-user segment; non-diabetic / wellness users carry materially less risk, but conservative copy applies to everyone for safety.

### Rate limits
Dexcom Share has an undocumented rate limit. Polling once per 60 seconds per user is universally accepted. Don't go faster — 30s polling has gotten people throttled. Stagger polls across users to avoid burst patterns.

### Data freshness vs. alert-on-stale
A reading older than ~10–15 min usually means the user's phone went offline (sensor → phone → Dexcom cloud is the chain). Build a "stale data" alert; users will value this as much as low/high alerts.

---

## 6. Suggested next steps (in order)

1. **Confirm hardware radios (Wi-Fi vs BLE-only)** — already known: BLE-only. Phone is the bridge.
2. **Build a 50-line proof of concept** — TS port of `pydexcom`, log latest reading every minute. Confirms your test Dexcom account / sandbox works end-to-end.
3. **Build the auth seam first** (per doc #3) — a `cgm-api` `whoami` endpoint that verifies a JWT issued by Gently Core's Better-Auth.
4. **Sketch the cloud poller** as a worker machine: per-user secret, every 60s, write latest reading + trend to Postgres.
5. **Define the alert engine rules** — diabetes pack and metabolic-health pack, plus full custom mapping per user.
6. **Define the device-wake protocol** — Expo push to phone → BLE write to bracelet.
7. **In parallel:** start the Dexcom Strategic Partnership application for the Real-Time API. Even if it takes 6 months, it's free optionality.
8. **Write the disclaimer copy + onboarding** — Share enable check, credential consent, "this is a secondary alert" language, audience-segment selection.

---

## 7. Open questions to resolve

- Region focus (US first, OUS, both)? Recommend US first.
- Family followers in v1 scope, or v1.1?
- Dexcom test account *with Share enabled* + at least one follower invited so we can hit the API immediately — confirmed available?

---

## Sources

- [Dexcom API Authentication](https://developer.dexcom.com/docs/dexcom/authentication/)
- [Dexcom API Scopes & Access](https://developer.dexcom.com/docs/dexcom/scopes-access/)
- [Dexcom Web API endpoint overview](https://developer.dexcom.com/endpoint-overview)
- [pydexcom (canonical reverse-engineered client)](https://github.com/gagebenne/pydexcom)
- [DexcomShare Endpoints for the Uploader App (StephenBlackWasAlreadyTaken gist)](https://gist.github.com/StephenBlackWasAlreadyTaken/adb0525344bedade1e25)
- [Nightscout Dexcom Bridge troubleshooting](https://nightscout.github.io/troubleshoot/dexcom_bridge/)
- [#016: The Dexcom Share API (Christopher Coco)](https://cjcocokrisp.medium.com/016-the-dexcom-share-api-ba6410954d5d)
- [Glucose Projector features](https://glucoseprojector.com/)
- [Family Dashboard with Pixoo + AWS Lambda + WebSocket relay (architecture analog)](https://johnwulff.com/2026/01/18/pixoo-signage/)
- [FDA Clears Dexcom Real-Time APIs for Third-Party Apps and Devices](https://www.businesswire.com/news/home/20210715006049/en/FDA-Clears-Dexcom-Real-Time-APIs-for-Third-Party-Apps-and-Devices)
