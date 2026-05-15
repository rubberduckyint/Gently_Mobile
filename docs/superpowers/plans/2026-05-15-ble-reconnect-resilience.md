# BLE Reconnect Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mobile reconnect to the bracelet automatically within ~10 seconds of returning to range after disconnect (walk-away, Bluetooth toggle, app backgrounding, app boot) so glucose alerts on the 5-minute Dexcom cadence aren't missed at the bracelet.

**Architecture:** The current reconnect paths (`reconnectLastPairedNow`, the periodic-poll, and the disconnect-event handler) all call `BleManager.connect(stored_id)` against the MAC frozen in SecureStore at pair time. The Gently bracelet uses a Resolvable Private Address that rotates roughly every 15 minutes, so the stored MAC goes stale and direct-connect fails silently. The pair-bracelet flow works because it does an active scan (`legacy:false, phy:ALL_SUPPORTED`) and connects to the live `peripheral.id` from the scan results.

This plan extracts a single `findAndReconnectPairedBracelet` helper that performs scan-by-name → connect-by-live-id → rehandshake, and wires it into every reconnect trigger (disconnect event, AppState foreground, BT state change, push arrival, periodic poll, manual pill tap). Bond completion is verified post-pair so the native `autoConnect: true` fast-path actually engages when supported.

**Tech Stack:** React Native + Expo SDK 55, `react-native-ble-manager` v12.4.5 (Android-first per `apps/expo/CLAUDE.md`). Existing BLE primitives in `apps/expo/src/contexts/BLEContext.tsx` and `apps/expo/src/services/ble/`.

---

## Background — what's failing today

Three real-device tests on 2026-05-15 (running build `7e19adf` on Samsung S24 Ultra with the bracelet sitting on top of the phone):

| Test | Expected | Actual |
|---|---|---|
| BT toggle off → on | Reconnect within ~10s | Stayed disconnected indefinitely |
| Walk out of range, return after 1 min (foreground app) | Reconnect within ~30s | Stayed disconnected indefinitely |
| Tap "Try to reconnect" pill | Reconnect immediately | "Bracelet may be out of range" error |
| Delete then re-add bracelet (bracelet NOT in pairing mode) | Show pairing-mode instructions | Auto-found and connected without yellow-blink |

**Root cause:** all reconnect paths use `BleManager.connect(lastPaired.id)` against a stored MAC. The bracelet's Resolvable Private Address rotates and the stored MAC dies. Confirmed by the delete+re-add path which uses `BleManager.scan` and finds the bracelet at its current advertising address. Dave's intuition was correct: "the code to reconnect is there and works but in the wrong place."

**Why the 5-min Dexcom cadence matters:** any reconnect latency between bracelet-back-in-range and Mobile-knowing-it greater than the next push delivery means a missed alert at the bracelet. Even if Mobile reconnects within 30s of return, a push that arrives in those 30s is dropped silently in `dispatchAlertToBracelet` (`apps/expo/src/services/alerts/index.ts:72-76`). Task 8 closes this gap with an inline reconnect on push receipt.

**Key code references (against current HEAD `7e19adf`):**
- `apps/expo/src/contexts/BLEContext.tsx:351-399` — `reconnectLastPairedNow` (dashboard pill path; broken)
- `apps/expo/src/contexts/BLEContext.tsx:401-482` — periodic-poll reconnect loop (broken)
- `apps/expo/src/contexts/BLEContext.tsx:498-589` — disconnect-event handler (`stableHandleDisconnectedDevice`; broken)
- `apps/expo/src/contexts/BLEContext.tsx:2149-2172` — fire-and-forget `createBond` post-pair (no verification)
- `apps/expo/src/contexts/BLEContext.tsx:1742-1918` — `scanForDevices` (canonical working scan; `legacy:false, phy:ALL_SUPPORTED`)
- `apps/expo/src/app/(onboarding)/pair-bracelet.tsx:66-68` — auto-fires `startScan` on mount (needs pairing-mode gate)
- `apps/expo/src/services/alerts/index.ts:68-102` — `dispatchAlertToBracelet` (no-ops on disconnect; needs inline reconnect)

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `apps/expo/src/contexts/BLEContext.tsx` | BLE state + reconnect orchestration | Add `findAndReconnectPairedBracelet`; rewire 3 reconnect call sites; add AppState + BT-state triggers; add bond-completion verification |
| `apps/expo/src/services/alerts/index.ts` | Push → BLE dispatcher | Inline reconnect attempt before dispatch when disconnected |
| `apps/expo/src/app/(onboarding)/pair-bracelet.tsx` | Pair-bracelet UI | Pairing-mode confirmation gate; remove auto-scan-on-mount |

No new files.

---

## Conventions for hardware-dependent tasks

Hardware-in-the-loop work doesn't map cleanly onto failing-unit-test-first TDD. Each task that touches BLE state has a real-device test in place of an automated failing test. Run the device test before claiming the task complete. Don't trust hot-reload for listener subscriptions (`AppState.addEventListener`, `BleManager.onDidUpdateState`, etc.) — those need a fresh APK install:

```bash
cd /Users/exexporerporer/Projects/Gently_CGM/Gently_Mobile
npx expo prebuild --clean -p android
pnpm -F @gently/expo android
```

In a separate terminal, stream JS logs (Expo Dev Tools is unreliable on this build per Dave 2026-05-15):

```bash
adb logcat -s ReactNativeJS:V | grep -E "BLE Reconnect|BLE TRACE|BLE Context|alerts"
```

---

## Tasks

### Task 1: Extract `findAndReconnectPairedBracelet` helper

**Goal:** One function that scans for the last-paired bracelet by name, connects to the live `peripheral.id`, runs the existing `rehandshakeAfterReconnect`, persists the new id, and flips context state. Safe to call from concurrent triggers (in-flight lock).

**Files:**
- Modify: `apps/expo/src/contexts/BLEContext.tsx` — insert new helper immediately before `reconnectLastPairedNow` at line 348

- [ ] **Step 1: Add the helper**

```ts
// In-flight lock so concurrent triggers (disconnect + AppState +
// periodic poll + push arrival) don't race a second scan while one
// is mid-flight. Reset in finally.
const reconnectInFlightRef = useRef(false);

// Scan-based reconnect to the last-paired bracelet. Replaces the previous
// direct `BleManager.connect(storedMac)` approach which fails because the
// bracelet's MAC is a Resolvable Private Address that rotates. Scan-by-name
// finds the bracelet at its current advertising address. Returns true if
// we ended in "connected" state.
//
// Triggers: disconnect-event handler, periodic poll, AppState foreground,
// BT-state-change, push-while-disconnected, dashboard "Try to reconnect".
const findAndReconnectPairedBracelet = async (
  options: { scanSeconds?: number } = {},
): Promise<boolean> => {
  const scanSeconds = options.scanSeconds ?? 8;

  if (reconnectInFlightRef.current) {
    console.log(
      "[BLE Reconnect] Skipping — another reconnect attempt is already in flight",
    );
    return false;
  }
  reconnectInFlightRef.current = true;

  try {
    const lastPairedJson = await SecureStore.getItemAsync(
      "ble_last_paired_device",
    );
    if (!lastPairedJson) {
      console.log(
        "[BLE Reconnect] No last-paired pointer in SecureStore — user must re-pair",
      );
      return false;
    }
    const lastPaired = JSON.parse(lastPairedJson) as {
      id: string;
      name: string | null;
      serialNumber: string;
    };

    // Don't fight a user-initiated flow (pair-bracelet screen).
    if (
      connectionStateRef.current === "connecting" ||
      connectionStateRef.current === "scanning"
    ) {
      console.log(
        `[BLE Reconnect] Skipping — current state "${connectionStateRef.current}" indicates user-initiated flow`,
      );
      return false;
    }

    // Test-user mock-BLE bypass — mirrors the gate at scanForDevices line ~1755.
    if (isTestUser) {
      console.log("[BLE Reconnect] Test user — skipping real BLE reconnect");
      return false;
    }

    // Fast path: if Android still holds an active GATT link to the stored
    // peripheral id, skip the scan and go straight to rehandshake.
    try {
      const isOsConnected = await BleManager.isPeripheralConnected(
        lastPaired.id,
      );
      if (isOsConnected) {
        console.log(
          `[BLE Reconnect] Fast path — OS-level link is alive to ${lastPaired.id}; skipping scan`,
        );
        const fastKey = await rehandshakeAfterReconnect(
          lastPaired.id,
          lastPaired.serialNumber,
        );
        if (fastKey) {
          setConnectedDevice({
            id: lastPaired.id,
            name: lastPaired.name ?? undefined,
            serialNumber: lastPaired.serialNumber,
            peripheral: { id: lastPaired.id } as Peripheral,
          });
          setEncryptionKey(fastKey);
          setConnectionState("connected");
          return true;
        }
      }
    } catch (osErr) {
      console.log(
        "[BLE Reconnect] isPeripheralConnected probe failed — proceeding with scan",
        osErr,
      );
    }

    // Slow path: scan to find the bracelet at its current RPA.
    console.log(
      `[BLE Reconnect] Starting ${scanSeconds}s scan for bracelet (serial ${lastPaired.serialNumber})`,
    );

    let foundPeripheralId: string | null = null;

    await new Promise<void>((resolve) => {
      let resolved = false;
      const settle = () => {
        if (resolved) return;
        resolved = true;
        try {
          discoverSub.remove();
        } catch {
          /* ignore */
        }
        try {
          stopSub.remove();
        } catch {
          /* ignore */
        }
        resolve();
      };

      const discoverHandler = (peripheral: Peripheral) => {
        const advName =
          peripheral.advertising?.localName ?? peripheral.name ?? "";
        if (!/^gently/i.test(advName)) return;
        if (foundPeripheralId) return;
        console.log(
          `[BLE Reconnect] Discovered candidate ${peripheral.id} (name="${advName}")`,
        );
        foundPeripheralId = peripheral.id;
        BleManager.stopScan().catch(() => undefined);
        settle();
      };

      const stopHandler = () => settle();

      const discoverSub = BleManager.onDiscoverPeripheral(discoverHandler);
      const stopSub = BleManager.onStopScan(stopHandler);

      void BleManager.scan({
        serviceUUIDs: [],
        seconds: scanSeconds,
        allowDuplicates: false,
        matchMode: BleScanMatchMode.Aggressive,
        scanMode: BleScanMode.LowLatency,
        callbackType: BleScanCallbackType.AllMatches,
        legacy: false,
        phy: BleScanPhyMode.ALL_SUPPORTED,
      }).catch((err) => {
        console.warn("[BLE Reconnect] scan() rejected:", err);
        settle();
      });

      // Belt-and-suspenders timeout — onStopScan should fire, but if native
      // hangs we don't want to block forever.
      setTimeout(settle, (scanSeconds + 2) * 1000);
    });

    if (!foundPeripheralId) {
      console.log(
        "[BLE Reconnect] Scan finished — bracelet not found (out of range or not advertising)",
      );
      return false;
    }

    try {
      await BleManager.connect(foundPeripheralId);
    } catch (connErr) {
      console.warn(
        `[BLE Reconnect] connect(${foundPeripheralId}) failed:`,
        connErr,
      );
      return false;
    }

    const newKey = await rehandshakeAfterReconnect(
      foundPeripheralId,
      lastPaired.serialNumber,
    );
    if (!newKey) {
      console.warn(
        "[BLE Reconnect] Rehandshake failed after connect — bracelet may be in a stuck session",
      );
      return false;
    }

    // Persist the new live id so the next fast-path probe + the rest of the
    // session reference the current address.
    await SecureStore.setItemAsync(
      "ble_last_paired_device",
      JSON.stringify({
        id: foundPeripheralId,
        name: lastPaired.name,
        serialNumber: lastPaired.serialNumber,
      }),
    );

    setConnectedDevice({
      id: foundPeripheralId,
      name: lastPaired.name ?? undefined,
      serialNumber: lastPaired.serialNumber,
      peripheral: { id: foundPeripheralId } as Peripheral,
    });
    setEncryptionKey(newKey);
    setConnectionState("connected");

    console.log(
      `[BLE Reconnect] Reconnected to ${foundPeripheralId} (serial ${lastPaired.serialNumber})`,
    );
    return true;
  } catch (err) {
    console.warn("[BLE Reconnect] findAndReconnectPairedBracelet threw:", err);
    return false;
  } finally {
    reconnectInFlightRef.current = false;
  }
};
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F @gently/expo typecheck
```
Expected: PASS (no new errors introduced).

- [ ] **Step 3: Commit**

```bash
git add apps/expo/src/contexts/BLEContext.tsx
git commit -m "Add findAndReconnectPairedBracelet helper for scan-by-name reconnect"
```

---

### Task 2: Use the helper from the dashboard pill

**Goal:** Replace `reconnectLastPairedNow`'s direct-connect body with the helper. The dashboard "Try to reconnect" pill is the easiest end-to-end test of the helper.

**Files:**
- Modify: `apps/expo/src/contexts/BLEContext.tsx:351-399` — body of `reconnectLastPairedNow`

- [ ] **Step 1: Replace the function body**

```ts
const reconnectLastPairedNow = async (): Promise<boolean> => {
  return findAndReconnectPairedBracelet({ scanSeconds: 10 });
};
```

(Delete the old SecureStore read, `isPeripheralConnected` probe, `BleManager.connect(lastPaired.id)` block, and rehandshake call — they're all inside the helper now.)

- [ ] **Step 2: Real-device test**

1. Build & install fresh.
2. Pair the bracelet; wait for `[BLE TRACE] connectionState → "connected"`.
3. Quick-settings: Bluetooth off → wait 2s → on. Watch `[BLE TRACE]` show disconnect.
4. Dashboard → Bracelet pill → "Try to reconnect".
5. Expected logs in <10s: `[BLE Reconnect] Discovered candidate <id>` → `[BLE Reconnect] Reconnected to <id>`. Pill flips to "Connected".
6. Confirm: from Edit Alarm, drag a vibration slider — bracelet vibrates.

- [ ] **Step 3: Commit**

```bash
git add apps/expo/src/contexts/BLEContext.tsx
git commit -m "Wire dashboard reconnect pill through scan-by-name helper"
```

---

### Task 3: Use the helper in the periodic-poll loop

**Goal:** The 30s background poll uses scan-by-name. Walk-away test reconnects within ~30s of return without user action.

**Files:**
- Modify: `apps/expo/src/contexts/BLEContext.tsx:401-482` — periodic-poll useEffect

- [ ] **Step 1: Replace the `tryReconnect` body**

```ts
useEffect(() => {
  if (connectionState !== "disconnected") return;
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const tryReconnect = async () => {
    if (cancelled) return;
    await findAndReconnectPairedBracelet({ scanSeconds: 6 });
    // The helper flips state to "connected" on success; the useEffect
    // will tear this loop down on the next render.
  };

  // Fire once shortly after entering "disconnected", then every 30s.
  // Don't tighten the interval — each scan eats radio time, and rapid
  // back-to-back scans risk the __next_prime native overflow seen in
  // the 2026-05-14 BLE marathon.
  const firstTick = setTimeout(() => void tryReconnect(), 3000);
  timer = setInterval(() => void tryReconnect(), 30000);
  return () => {
    cancelled = true;
    clearTimeout(firstTick);
    if (timer) clearInterval(timer);
  };
}, [connectionState]);
```

- [ ] **Step 2: Real-device test (walk-away)**

1. Pair fresh; foreground app.
2. Tail `adb logcat -s ReactNativeJS:V`.
3. Carry phone 30+ feet from bracelet. Confirm `[BLE TRACE] connectionState → "disconnected"`.
4. Wait 60 seconds.
5. Return to bracelet. Within ~30s of being in range: `[BLE Reconnect] Discovered candidate` → `Reconnected to`. Pill flips to "Connected".

- [ ] **Step 3: Commit**

```bash
git add apps/expo/src/contexts/BLEContext.tsx
git commit -m "Run periodic-poll reconnect through scan-by-name helper"
```

---

### Task 4: Use the helper in the disconnect-event handler

**Goal:** On disconnect, immediately try to reconnect (don't wait for the 3s first periodic tick or rely on autoConnect via stored MAC).

**Files:**
- Modify: `apps/expo/src/contexts/BLEContext.tsx:498-589` — `stableHandleDisconnectedDevice`

- [ ] **Step 1: Replace the inner async IIFE**

Find the block starting `void (async () => {` around line 527 and replace through its closing `})();` with:

```ts
        // Range-loss-then-return: kick off an immediate scan-and-reconnect.
        // The periodic-poll useEffect is the safety net at 30s ticks if
        // this immediate attempt fails (e.g., bracelet still out of range).
        void (async () => {
          try {
            const lastPairedJson = await SecureStore.getItemAsync(
              "ble_last_paired_device",
            );
            if (!lastPairedJson) {
              console.log(
                "[BLE Context] No last-paired pointer — skipping auto-reconnect (user-initiated disconnect)",
              );
              return;
            }
            // Small delay so the OS BLE stack settles after the disconnect
            // event before we open a new scan.
            await new Promise((r) => setTimeout(r, 1000));
            const reconnected = await findAndReconnectPairedBracelet({
              scanSeconds: 8,
            });
            if (!reconnected) {
              console.log(
                "[BLE Context] Immediate reconnect failed — periodic poll will retry every 30s",
              );
            }
          } catch (err) {
            console.warn(
              "[BLE Context] Disconnect-event reconnect threw:",
              err,
            );
          }
        })();
```

- [ ] **Step 2: Real-device test (Bluetooth toggle)**

1. Pair fresh.
2. Quick-settings: Bluetooth off → 5s → on.
3. Expected logs in <12s of BT on: `[BLE Context] Device disconnected` → `[BLE Reconnect] Discovered candidate` → `Reconnected`. Pill returns to "Connected".

- [ ] **Step 3: Commit**

```bash
git add apps/expo/src/contexts/BLEContext.tsx
git commit -m "Replace disconnect-handler autoConnect with scan-based reconnect"
```

---

### Task 5: AppState foreground trigger

**Goal:** When the app returns to foreground while disconnected, attempt reconnect immediately. Backgrounded Android suspends JS timers; the periodic poll may not have fired during the away-period.

**Files:**
- Modify: `apps/expo/src/contexts/BLEContext.tsx` — add `AppState` import; add useEffect immediately after the periodic-poll useEffect (~line 482)

- [ ] **Step 1: Add `AppState` to imports**

In the existing `import ... from "react-native";` line near the top of the file (search for `import .* from "react-native"`), add `AppState` and `AppStateStatus`:

```ts
import { AppState, type AppStateStatus, Platform } from "react-native";
```

(If `Platform` is already imported on a different line, just ensure `AppState` and the type-only `AppStateStatus` are added to whichever import statement is appropriate.)

- [ ] **Step 2: Add the listener useEffect**

Insert immediately after the periodic-poll useEffect:

```ts
// AppState foreground trigger. When the app comes back to the foreground
// while disconnected, kick off an immediate scan-reconnect instead of
// making the user wait up to 30s for the next periodic-poll tick.
// Critical for the backgrounded-walk-away → return → check-phone path —
// Android Doze suspends JS setInterval timers while backgrounded, so the
// periodic poll may not have fired during the away window.
useEffect(() => {
  const handleAppStateChange = (next: AppStateStatus) => {
    if (next !== "active") return;
    if (connectionStateRef.current === "connected") return;
    console.log(
      "[BLE Context] App foregrounded while disconnected — attempting reconnect",
    );
    void findAndReconnectPairedBracelet({ scanSeconds: 8 });
  };
  const sub = AppState.addEventListener("change", handleAppStateChange);
  return () => sub.remove();
}, []);
```

- [ ] **Step 3: Real-device test (backgrounded walk-away)**

1. Pair fresh.
2. Home-button the app to background.
3. Carry phone 30+ feet away from bracelet for 60+ seconds.
4. Return; re-foreground the app from the launcher (or recents).
5. Expected within ~10s of foreground: `[BLE Context] App foregrounded while disconnected — attempting reconnect` → `[BLE Reconnect] Discovered candidate` → `Reconnected`.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/src/contexts/BLEContext.tsx
git commit -m "Trigger BLE reconnect on app foreground"
```

---

### Task 6: Bluetooth-state-change trigger

**Goal:** When BT is toggled back on (or returns from airplane-mode), immediately attempt reconnect — don't wait for the next periodic tick.

**Files:**
- Modify: `apps/expo/src/contexts/BLEContext.tsx` — add `onDidUpdateState` listener inside the BLE-init useEffect alongside the existing global listeners (~line 823)

- [ ] **Step 1: Add the handler and the listener**

Find the existing block:

```ts
    const listeners = [
      BleManager.onStopScan(stableHandleStopScan),
      BleManager.onDisconnectPeripheral(stableHandleDisconnectedDevice),
      BleManager.onDidUpdateValueForCharacteristic(
        stableHandleUpdateValueForCharacteristic,
      ),
    ];
```

Replace with:

```ts
    const handleBtStateChange = (event: { state: string }) => {
      // States from react-native-ble-manager: "on", "off", "turning_on",
      // "turning_off", "unauthorized", "unknown", "resetting".
      console.log(`[BLE Context] BT adapter state → ${event.state}`);
      if (event.state !== "on") return;
      if (connectionStateRef.current === "connected") return;
      void (async () => {
        // Let the BLE stack settle after re-enable before scanning.
        await new Promise((r) => setTimeout(r, 1500));
        if (connectionStateRef.current === "connected") return;
        console.log(
          "[BLE Context] BT turned back on while disconnected — attempting reconnect",
        );
        await findAndReconnectPairedBracelet({ scanSeconds: 8 });
      })();
    };

    const listeners = [
      BleManager.onStopScan(stableHandleStopScan),
      BleManager.onDisconnectPeripheral(stableHandleDisconnectedDevice),
      BleManager.onDidUpdateValueForCharacteristic(
        stableHandleUpdateValueForCharacteristic,
      ),
      BleManager.onDidUpdateState(handleBtStateChange),
    ];
```

- [ ] **Step 2: Real-device test (BT toggle, no walk-away)**

1. Pair fresh.
2. Tail `adb logcat -s ReactNativeJS:V`.
3. Quick-settings: Bluetooth off → 5s → on.
4. Expected logs: `BT adapter state → off`, `BT adapter state → on`, `BT turned back on while disconnected — attempting reconnect`, then scan + reconnect logs. Pill returns to "Connected" within ~10s of BT on.

(Note: this overlaps Task 4's test. Both paths are expected to fire on BT toggle; the in-flight lock in Task 1 prevents the double-scan from doing harm. The BT-state path is the one that's expected to recover faster when the disconnect event for some reason doesn't fire — observed on some Samsung OEM builds where BT-off doesn't always emit a per-peripheral disconnect.)

- [ ] **Step 3: Commit**

```bash
git add apps/expo/src/contexts/BLEContext.tsx
git commit -m "Trigger BLE reconnect on Bluetooth adapter turning on"
```

---

### Task 7: Verify bond completion post-pair

**Goal:** `createBond` is fire-and-forget. The native autoConnect fast-path only works when the bond is actually established. Confirm it within ~5s of `createBond` resolving and log success or failure clearly.

**Files:**
- Modify: `apps/expo/src/contexts/BLEContext.tsx:2149-2172` — `createBond` block at the end of `connectToFoundPeripheral`

- [ ] **Step 1: Replace the fire-and-forget block**

Find the existing block starting `// Create OS-level bond on Android.` and ending at the `}` closing the `if (Platform.OS === "android")`. Replace with:

```ts
    // Create OS-level bond on Android. The bracelet uses a Resolvable
    // Private Address — its MAC rotates over time. An OS-level bond
    // exchanges an IRK so Android's native autoConnect can resolve future
    // RPAs to the same identity (fast-path reconnect without a scan).
    // Without a bond we still recover via findAndReconnectPairedBracelet
    // (scan-by-name), so this is a fast-path nice-to-have, not a hard
    // requirement.
    //
    // BleManager.createBond resolves when Android *dispatches* the bond
    // request, not when the user accepts the system dialog. Poll
    // getBondedPeripherals for ~5s to confirm.
    if (Platform.OS === "android") {
      void (async () => {
        try {
          await BleManager.createBond(peripheral.id);
        } catch (bondErr) {
          console.warn(
            `[BLE Context] createBond rejected for ${peripheral.id}:`,
            bondErr,
          );
          return;
        }
        const deadline = Date.now() + 5000;
        let bonded = false;
        while (Date.now() < deadline) {
          try {
            const list = await BleManager.getBondedPeripherals();
            if (list.some((p) => p.id === peripheral.id)) {
              bonded = true;
              break;
            }
          } catch {
            // ignore, retry next tick
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        if (bonded) {
          console.log(
            `[BLE Context] OS-level bond confirmed for ${peripheral.id} — native autoConnect fast-path enabled`,
          );
        } else {
          console.warn(
            `[BLE Context] OS-level bond NOT confirmed for ${peripheral.id} within 5s — reconnect will use scan-by-name fallback (still works, slightly slower)`,
          );
        }
      })();
    }
```

- [ ] **Step 2: Real-device test (bond accepted vs dismissed)**

Test A — accepted:
1. Delete the bracelet from the app. Long-press the bracelet button ~6.5s, release, power-cycle → confirm yellow blink.
2. Re-pair. When Android shows "Pair with Gently?", tap "Pair".
3. Expected log within 5s: `[BLE Context] OS-level bond confirmed for <id> — native autoConnect fast-path enabled`.

Test B — dismissed:
1. Repeat the delete + long-press + power-cycle steps.
2. When the bond dialog appears, swipe it away or tap "Cancel".
3. Expected log within 5s: `[BLE Context] OS-level bond NOT confirmed for <id> within 5s ...`. The pair still completes normally and subsequent reconnects still work via scan-by-name.

- [ ] **Step 3: Commit**

```bash
git add apps/expo/src/contexts/BLEContext.tsx
git commit -m "Verify createBond completion with getBondedPeripherals poll"
```

---

### Task 8: Inline reconnect on push when disconnected

**Goal:** When a Dexcom alert push arrives while the bracelet is disconnected, attempt one short reconnect before dispatching commands. Closes the 5-min-cadence gap where alerts land in the brief window before periodic-poll recovers.

**Files:**
- Modify: `apps/expo/src/services/alerts/index.ts:68-102` — `dispatchAlertToBracelet` body and signature
- Modify: hook wiring at the bottom of `apps/expo/src/services/alerts/index.ts` — pass `reconnectLastPaired` through

- [ ] **Step 1: Update `dispatchAlertToBracelet`**

Replace the function from `export async function dispatchAlertToBracelet(` through the closing `}` of the for-loop body (the existing implementation):

```ts
export async function dispatchAlertToBracelet(
  payload: AlertPayload,
  ble: Pick<
    BLEContextValue,
    "isDeviceConnected" | "sendBLECommand" | "reconnectLastPaired"
  >,
): Promise<void> {
  if (!ble.isDeviceConnected()) {
    console.log(
      `[alerts] Bracelet disconnected on push arrival for ${payload.alertEventId} — attempting inline reconnect`,
    );
    const reconnected = await ble.reconnectLastPaired();
    if (!reconnected) {
      console.warn(
        `[alerts] Inline reconnect failed for ${payload.alertEventId} (${payload.ruleKind}); skipping BLE dispatch — OS notification already surfaced`,
      );
      return;
    }
    console.log(
      `[alerts] Inline reconnect succeeded for ${payload.alertEventId}`,
    );
  }

  const commands = alertPayloadToBleCommands(payload);
  if (commands.length === 0) {
    console.log(
      `[alerts] No BLE commands emitted for ${payload.alertEventId} (${payload.ruleKind}); payload had no triggerable modalities`,
    );
    return;
  }

  console.log(
    `[alerts] Dispatching ${commands.length} BLE command(s) for ${payload.alertEventId} (${payload.ruleKind})`,
  );

  for (const command of commands) {
    try {
      await ble.sendBLECommand(command);
    } catch (error) {
      console.error(
        `[alerts] BLE command 0x${command.command.toString(16)} failed for ${payload.alertEventId}:`,
        error,
      );
      // Continue with remaining commands — partial alert better than none.
    }
  }
}
```

- [ ] **Step 2: Propagate `reconnectLastPaired` through the rest of the file**

Update `handleNotification`'s signature in the same file:

```ts
async function handleNotification(
  notification: Notifications.Notification,
  ble: Pick<
    BLEContextValue,
    "isDeviceConnected" | "sendBLECommand" | "reconnectLastPaired"
  >,
): Promise<void> {
  const data = notification.request.content.data;
  const payload = parseAlertPayload(data);
  if (!payload) return;
  await dispatchAlertToBracelet(payload, ble);
}
```

Search the file for `useCgmAlertDispatcher` (or whatever the hook is named — it lives below `handleNotification`). Update it to destructure `reconnectLastPaired` from the BLE context and pass it down. Example shape (adapt to whatever the actual hook looks like):

```ts
export function useCgmAlertDispatcher() {
  const ble = useBLE(); // or whatever the BLEContext consumer is
  useEffect(() => {
    const dispatch = (n: Notifications.Notification) => {
      void handleNotification(n, {
        isDeviceConnected: ble.isDeviceConnected,
        sendBLECommand: ble.sendBLECommand,
        reconnectLastPaired: ble.reconnectLastPaired,
      });
    };
    const sub = Notifications.addNotificationReceivedListener(dispatch);
    return () => sub.remove();
  }, [ble.isDeviceConnected, ble.sendBLECommand, ble.reconnectLastPaired]);
}
```

If the hook currently captures the entire `ble` object by reference, it can keep doing so — but ensure `reconnectLastPaired` is included in the dependency list if you destructure individual methods.

- [ ] **Step 3: Typecheck**

```bash
pnpm -F @gently/expo typecheck
```
Expected: PASS.

- [ ] **Step 4: Real-device test (push while disconnected)**

1. Pair fresh; confirm connected.
2. Carry phone out of range (app foreground). Confirm `[BLE TRACE] connectionState → "disconnected"`.
3. Re-enter range BUT immediately (within the first ~25s, before periodic poll's next tick), send a hand-crafted push via https://expo.dev/notifications using the device's Expo push token (printed in logs at app start under `[push]` or similar — if not, log it explicitly during this test).
4. Use a CGM alert AlertPayload with all three modalities (vibration, LED, audio) so the bracelet definitely fires something perceptible.
5. Expected logs in <15s of push send: `[alerts] Bracelet disconnected on push arrival ... attempting inline reconnect` → `[BLE Reconnect] Discovered candidate` → `Inline reconnect succeeded` → `Dispatching 3 BLE command(s)` → bracelet vibrates/lights/buzzes.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/src/services/alerts/index.ts
git commit -m "Inline reconnect on push when bracelet is disconnected"
```

---

### Task 9: Post-delete pairing-mode confirmation gate

**Goal:** When the user opens the pair-bracelet screen (typically after delete), show pairing-mode instructions and require an explicit confirmation tap before scanning. Prevents the surprising "auto-connected without long-press" behavior Dave hit during the 2026-05-15 test.

**Files:**
- Modify: `apps/expo/src/app/(onboarding)/pair-bracelet.tsx:66-68` — remove auto-start
- Modify: `apps/expo/src/app/(onboarding)/pair-bracelet.tsx` — `pairState === "instruct"` render branch

- [ ] **Step 1: Remove the on-mount auto-scan**

Delete (or comment out) the useEffect at line 66-68 that auto-fires `startScan` on mount. The "instruct" state should be the entry state and require user action.

- [ ] **Step 2: Update the "instruct" render branch**

Find the existing render block where `pairState === "instruct"` (or however the file structures conditional rendering — likely a `switch` or chained ternaries). Update its copy to read approximately:

- **Heading:** "Put your bracelet in pairing mode"
- **Body:** "Press and hold the button on your bracelet for about 6.5 seconds, until the light blinks yellow. You'll have about 60 seconds once it starts blinking."
- **Primary CTA:** "My bracelet is blinking yellow" → `void startScan()`

Use the existing button/text/layout components in the file (`PrimaryButton`, `Heading`, etc. — match whatever's already there). If the file currently has different copy and no "tap to continue" CTA on the instruct screen, add one. Do not change the `scanning`, `discovered`, or `success` branches — only `instruct`.

The copy must reference the firmware-validated UX (yellow blink, 6.5s long-press, 60s window) — see `~/.claude/projects/-Users-exexporerporer-Projects-Gently-CGM/memory/reference_bracelet_firmware_v1_2_0.md` if you need to confirm the wording matches reality.

- [ ] **Step 3: Real-device test (delete-then-pair UX)**

1. Pair fresh, confirm connected.
2. Delete the bracelet from the app (Dashboard → Bracelet pill → Manage device → Delete, or whatever the existing flow does — check `apps/expo/src/app/devices/...` if unsure).
3. The pair-bracelet screen opens. Expected: shows "Put your bracelet in pairing mode" copy and the primary button. **No scan kicks off automatically.**
4. Without long-pressing the bracelet, tap the button. Scan starts; depending on bracelet state it may still find it, but the user has been guided to the proper procedure.
5. Then properly long-press the bracelet, confirm yellow blink, tap the button. Scan finds the bracelet in pairing-mode and completes the fresh-pair handshake.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/src/app/\(onboarding\)/pair-bracelet.tsx
git commit -m "Gate pair-bracelet scan on explicit pairing-mode confirmation"
```

---

### Task 10: End-to-end acceptance matrix

**Goal:** Confirm all triggers work together on a clean install. Run AFTER Tasks 1–9 land.

- [ ] **Step 1: Clean build & install**

```bash
cd /Users/exexporerporer/Projects/Gently_CGM/Gently_Mobile
npx expo prebuild --clean -p android
pnpm -F @gently/expo android
```

- [ ] **Step 2: Run each row of the matrix**

For each scenario, pair the bracelet fresh, run the test, capture `adb logcat -s ReactNativeJS:V | grep -E "BLE Reconnect|BLE TRACE|BLE Context|alerts"`. Mark PASS only if the expected log pattern appears within the expected timing.

| # | Scenario | Expected log pattern (in order) | Timing |
|---|---|---|---|
| 1 | BT toggle off → on (bracelet on phone) | `BT adapter state → off` → `BT adapter state → on` → `Discovered candidate` → `Reconnected to` | <10s after BT on |
| 2 | Walk away then return (app foregrounded) | Disconnect event → (≤30s wait) → `Discovered candidate` → `Reconnected` | <30s after return |
| 3 | App backgrounded during walk-away, then re-foreground | `App foregrounded while disconnected` → `Discovered candidate` → `Reconnected` | <10s after foreground |
| 4 | Dashboard pill "Try to reconnect" | `Discovered candidate` → `Reconnected` | <10s of tap |
| 5 | Push arrives while disconnected, bracelet in range | `Bracelet disconnected on push arrival` → `Inline reconnect succeeded` → `Dispatching N BLE command(s)` + physical buzz | <15s of push send |
| 6 | Fresh pair with bond accepted | `OS-level bond confirmed for <id>` | within 5s of "Pair" |
| 7 | Fresh pair with bond dismissed | `OS-level bond NOT confirmed` warning; scan-based reconnect still works | within 5s of dismiss |
| 8 | Post-delete pair-bracelet UX | Instruct screen with "blinking yellow" copy; no auto-scan | n/a |

Any FAIL → return to the corresponding Task, root-cause, fix, re-run. Don't declare the plan complete with unresolved failures.

- [ ] **Step 3: Strip the BLE-marathon `[DIAG-V*]` diagnostic logs**

Once the matrix is green, sweep the file for the marathon-era diagnostic logs (per the deferred-threads memo at `~/.claude/projects/-Users-exexporerporer-Projects-Gently-CGM/memory/project_srf_deferred_threads.md`):

- `BLEContext.tsx` around lines 739-746 (`[DIAG-V3] Raw NativeEventEmitter`)
- `BLEContext.tsx` around lines 1773-1799 (`[DIAG-V4] getDiscoveredPeripherals`)
- `BLEContext.tsx` line 1749 (`[DIAG-V2] scanForDevices ENTRY`)
- `BLEContext.tsx` around line 1887 (`DIAG-V6` comment + the scan block itself stays, but the `DIAG-V6 — THE FIX` comment can be replaced with a normal explanatory comment)
- `services/ble/manager.ts` — search for `Sending N bytes encrypted` log and remove if present

Keep `[BLE TRACE]`, `[BLE Reconnect]`, and the structural `[BLE Context]` logs — those are useful in long-term dev logs and cheap to keep.

- [ ] **Step 4: Final commit**

```bash
git add apps/expo/src/contexts/BLEContext.tsx apps/expo/src/services/ble/manager.ts
git commit -m "Strip BLE marathon DIAG-V* logs after reconnect-resilience validation"
```

---

## Notes for the executing agent

1. **Real-device required for every test step.** Listener subscriptions (`AppState.addEventListener`, `BleManager.onDidUpdateState`, etc.) hot-reload poorly. `npx expo prebuild --clean -p android && pnpm -F @gently/expo android` after structural changes in Tasks 5, 6, and 9 at minimum.

2. **Logging is currently broken in Expo Dev Tools (per Dave 2026-05-15).** Use `adb logcat -s ReactNativeJS:V` in a separate terminal for all test verification. If logs are also empty in logcat, run `pnpm -F @gently/expo start --clear` after `expo prebuild` to reset the Metro cache.

3. **Don't skip Task 7 (bond verification)** even though scan-by-name works without a bond. The bond is what enables Android to passively listen for the bracelet in the background; without it, an app pushed deep into Doze may have no wake signal when the bracelet returns to range. The verification surfaces bond failures so the user can be guided to re-pair via Settings if needed (UX for that surfacing is out of scope for this plan — just log clearly for now).

4. **In-flight lock matters.** Multiple triggers (disconnect + BT-on + AppState foreground) can fire within the same second. The `reconnectInFlightRef` in Task 1 must hold across all of them so we don't open three concurrent scans. Watch for accidental TypeScript shadowing or hook scoping bugs.

5. **Out of scope:** Push-token registration, alert dispatcher translator changes, dashboard UI beyond the pill behavior, iOS background BLE (deferred per `apps/expo/CLAUDE.md`), the deeper "delete vs reconnect existing" UX question (only the post-delete pairing-mode gate is in scope).

6. **Cross-repo touchpoints:** None. SRF and EAS are untouched. SRF's `5e7ca5b` `[fanOut DIAG]` logging is unrelated and stays in place.

7. **Memory updates after completion:** Update `project_srf_deferred_threads.md` in the coordinator memory (`~/.claude/projects/-Users-exexporerporer-Projects-Gently-CGM/memory/`) — move item #2 ("Auto-reconnect on app boot / JS reload") to CLOSED and capture any new gotchas discovered during testing. Update `reference_react_native_ble_manager_gotchas.md` if the RPA + scan-by-name pattern needs to be documented for future BLE work.

---

## Self-review

- **Spec coverage:** All four failing tests from "Background" mapped to fix tasks (Tasks 2+4 → pill, Tasks 3+5 → walk-away, Tasks 4+6 → BT toggle, Task 9 → delete UX). 5-min Dexcom cadence covered by Task 8. Bond reliability covered by Task 7.
- **Placeholder scan:** All steps include complete code or specific instructions referencing existing patterns. No "implement appropriate error handling" or "similar to Task N" hand-waves.
- **Type consistency:** `findAndReconnectPairedBracelet` is the single source of truth. `reconnectLastPaired` (existing context method, line 858) delegates to it (Task 2). The alert dispatcher uses the existing `reconnectLastPaired` context surface, not a new method (Task 8) — no API surface drift.
- **File:line citations** target current HEAD `7e19adf`. If the executor finds a citation off by ±a few lines (e.g., from minor refactors during execution), trust the local context over the citation.
