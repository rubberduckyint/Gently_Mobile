/**
 * BLE Context Provider
 */

import type { ReactNode } from "react";
import type {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  Peripheral,
} from "react-native-ble-manager";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import BleManager, {
  BleScanCallbackType,
  BleScanMatchMode,
  BleScanMode,
  BleScanPhyMode,
} from "react-native-ble-manager";
import * as SecureStore from "expo-secure-store";

import type {
  BLECommandRequest,
  BLECommandResponse,
} from "~/services/ble/types";
import {
  trackBleConnectionAttempt,
  trackBleConnectionError,
  trackBleConnectionSuccess,
  trackBleDisconnection,
} from "~/services/analytics";
import { createGetDeviceInfoRequest } from "~/services/ble/commands/getDeviceInfo";
import {
  createGetUptimeRequest,
  parseGetUptimeResponse,
} from "~/services/ble/commands/getUptime";
import { createSetTimeRequest } from "~/services/ble/commands/setTime";
import { disconnectFromBLEDevice } from "~/services/ble/connection";
import {
  extractAndDecryptAdvertisementData,
  generateDynamicKey,
  TEAEncryption,
} from "~/services/ble/encryption";
import {
  sendCommand,
  sendMultiPacketCommand,
  startNotifications,
} from "~/services/ble/manager";
import * as mockBLE from "~/services/ble/mockBLEService";
import {
  parseActiveEventNotification,
  parseBatteryStatusNotification,
  parseNotification,
  parseTimeNotification,
} from "~/services/ble/notifications";
import { FACTORY_BRACELET_KEY, ResponseStatus } from "~/services/ble/types";
import { requestBluetoothPermissions } from "~/services/ble/utils";
import { authClient } from "~/utils/auth";
import { isTestUserSession } from "~/utils/testMode";

export type BLEConnectionState =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected"
  | "error";

export interface BLEDeviceInfo {
  id: string;
  name?: string;
  serialNumber?: string;
  rssi?: number;
  peripheral?: Peripheral;
}

export interface BLENotification {
  type: "battery" | "event" | "time" | "unknown";
  timestamp: Date;
  description: string;
  rawData?: number[];
}

export interface BLEConnectionConfig {
  maxRetries?: number;
  connectionTimeoutMs?: number;
  stabilizationDelayMs?: number;
  mtuSize?: number;
  scanTimeoutSeconds?: number;
}

export interface BLEConnectionProgress {
  step: string;
  progress: number; // 0-100
  message: string;
  isError?: boolean;
}

export type BLEConnectionCallback = (progress: BLEConnectionProgress) => void;

export interface BLEContextValue {
  connectionState: BLEConnectionState;
  connectedDevice: BLEDeviceInfo | null;
  encryptionKey: string | null;
  notifications: BLENotification[];
  setConnectedDevice: (device: BLEDeviceInfo | null) => void;
  setEncryptionKey: (key: string | null) => void;
  setConnectionState: (state: BLEConnectionState) => void;
  sendBLECommand: (
    command: BLECommandRequest,
    timeoutMs?: number,
  ) => Promise<BLECommandResponse>;
  sendMultiPacketBLECommand: (
    command: BLECommandRequest,
    packetHandler: (payload: Uint8Array, deviceId: string) => unknown,
    timeoutMs?: number,
  ) => Promise<unknown>;
  clearNotifications: () => void;
  addNotification: (notification: BLENotification) => void;
  getConnectionStatus: () => BLEConnectionState;
  isDeviceConnected: () => boolean;
  // Connection methods
  connectToDevice: (
    serialNumber: string,
    onProgress?: BLEConnectionCallback,
    config?: BLEConnectionConfig,
  ) => Promise<void>;
  connectToPeripheral: (
    peripheral: Peripheral,
    serialNumber: string,
    onProgress?: BLEConnectionCallback,
    config?: BLEConnectionConfig,
  ) => Promise<void>;
  disconnectDevice: () => Promise<void>;
  // Force-trigger a reconnect attempt against the last-paired bracelet.
  // Used by the dashboard "Try to reconnect" affordance so the user doesn't
  // have to wait for the periodic-poll tick (up to 30s). Returns true if
  // the reconnect+rehandshake succeeded.
  reconnectLastPaired: () => Promise<boolean>;
  scanForDevice: (
    serialNumber: string,
    onProgress?: BLEConnectionCallback,
    config?: BLEConnectionConfig,
  ) => Promise<Peripheral | null>;
  // General scanning for device discovery
  scanForDevices: (
    onDeviceFound: (
      peripheral: Peripheral,
      advertisementData?: unknown,
    ) => void,
    timeoutSeconds?: number,
  ) => Promise<void>;
}

const BLEContext = createContext<BLEContextValue | undefined>(undefined);

interface BLEProviderProps {
  children: ReactNode;
}

export function useBLE(): BLEContextValue {
  const context = useContext(BLEContext);
  if (context === undefined) {
    throw new Error("useBLE must be used within a BLEProvider");
  }
  return context;
}

// Helper function to get human-readable command names
function getCommandName(command: number): string {
  const commandNames: Record<number, string> = {
    0x01: "GET_UPTIME",
    0x02: "GET_DEVICE_INFO",
    0x0a: "GET_TIME",
    0x0b: "SET_TIME",
    0x0c: "GET_DEVICE_STATUS",
    0x10: "FIND_ME",
    0x11: "ENTER_DFU_MODE",
    0x12: "REBOOT_BRACELET",
    0x14: "TRIGGER_LED_PATTERN",
    0x15: "TRIGGER_VIBRATION_PATTERN",
    0x16: "TRIGGER_AUDIO_PATTERN",
  };
  return (
    commandNames[command] ??
    `UNKNOWN_COMMAND_${command.toString(16).padStart(2, "0").toUpperCase()}`
  );
}

export function BLEProvider({ children }: BLEProviderProps) {
  // Check if current user is test user for mock BLE
  const { data: session } = authClient.useSession();
  const isTestUser = isTestUserSession(session?.user?.email);

  const [connectionState, setConnectionState] =
    useState<BLEConnectionState>("disconnected");
  const [connectedDevice, setConnectedDevice] = useState<BLEDeviceInfo | null>(
    null,
  );
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<BLENotification[]>([]);

  // Use refs to maintain stable references for event handlers
  const bleInitialized = useRef(false);
  const listenersRef = useRef<{ remove: () => void }[]>([]);

  // Store the latest state values in refs to avoid stale closures
  const connectionStateRef = useRef(connectionState);
  const connectedDeviceRef = useRef(connectedDevice);
  const encryptionKeyRef = useRef(encryptionKey);

  // Timestamp when the last pair / reconnect completed (state → "connected").
  // Used by the disconnect handler to report "Δ since last connected" so
  // we can tell if the bracelet is dropping seconds after pair vs. minutes
  // later. null when state has never been "connected" in this session.
  const lastConnectedAtRef = useRef<number | null>(null);

  // Update refs when state changes
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    connectedDeviceRef.current = connectedDevice;
  }, [connectedDevice]);

  useEffect(() => {
    encryptionKeyRef.current = encryptionKey;
  }, [encryptionKey]);

  // Diagnostic: log every connectionState transition with timestamp and
  // current connectedDevice/encryptionKey snapshot. The dashboard renders
  // "Disconnected" any time connectionState !== "connected", so when a user
  // reports "paired but dashboard says disconnected" we need to see exactly
  // which transition fired between pair-complete and dashboard-mount, what
  // device + key were in flight, and how it correlates with disconnect or
  // bond events. Cheap to keep in production — flip to false to silence.
  const TRACE_BLE_STATE = true;
  useEffect(() => {
    if (!TRACE_BLE_STATE) return;
    if (connectionState === "connected") {
      lastConnectedAtRef.current = Date.now();
    }
    console.log(
      `[BLE TRACE] connectionState → "${connectionState}"`,
      JSON.stringify({
        at: new Date().toISOString(),
        deviceId: connectedDeviceRef.current?.id ?? null,
        hasKey: encryptionKeyRef.current !== null,
      }),
    );
  }, [connectionState]);

  // Re-run the full pairing-style handshake against an already-OS-connected
  // bracelet to derive a fresh per-session dynamic key and put the bracelet
  // into the same "fully initialized" state that connectToFoundPeripheral
  // leaves it in after a fresh pair. Used by both reconnect paths (the
  // immediate post-disconnect autoConnect path and the periodic-poll loop).
  //
  // We mirror the fresh-pair sequence exactly: MTU → services → notifications
  // → GET_UPTIME (factory key) → GET_DEVICE_INFO (dynamic key, validates) →
  // SET_TIME (dynamic key, best-effort). Observation 2026-05-14: when we only
  // ran GET_UPTIME on reconnect, the bracelet would send an unsolicited
  // 16-byte notification and immediately drop the link, suggesting its
  // firmware expects the device-info handshake to complete before treating
  // the session as live.
  //
  // Returns the new key on success or null on failure.
  const rehandshakeAfterReconnect = async (
    peripheralId: string,
    serialNumber: string,
  ): Promise<string | null> => {
    try {
      if (Platform.OS === "android") {
        try {
          await BleManager.requestMTU(peripheralId, 512);
        } catch (mtuError) {
          console.warn(
            "[BLE Context] Re-handshake MTU request failed (continuing):",
            mtuError,
          );
        }
      }
      await BleManager.retrieveServices(peripheralId);
      await startNotifications(peripheralId);

      const uptimeResponse = await sendCommand({
        peripheralId,
        command: createGetUptimeRequest(),
        encryptionKey: FACTORY_BRACELET_KEY,
      });
      const uptimeData = parseGetUptimeResponse(uptimeResponse.payload);
      const newDynamicKey = generateDynamicKey(
        FACTORY_BRACELET_KEY,
        uptimeData.uptimeBytes,
        serialNumber,
      );

      // Confirms the bracelet accepts the freshly-derived key AND tells the
      // firmware "session is live" — without this the bracelet was dropping
      // the GATT link a fraction of a second after GET_UPTIME completed.
      const deviceInfoResponse = await sendCommand({
        peripheralId,
        command: createGetDeviceInfoRequest(),
        encryptionKey: newDynamicKey,
      });
      if (deviceInfoResponse.status !== ResponseStatus.OK) {
        throw new Error(
          `Re-handshake device-info validation failed: Status=0x${deviceInfoResponse.status.toString(16)}`,
        );
      }

      // Best-effort time sync — fresh-pair does this, mirror it. Non-fatal.
      try {
        await sendCommand({
          peripheralId,
          command: createSetTimeRequest(new Date()),
          encryptionKey: newDynamicKey,
          timeoutMs: 10000,
        });
      } catch (timeError) {
        console.warn(
          "[BLE Context] Re-handshake SET_TIME failed (non-fatal):",
          timeError,
        );
      }

      const sanitizedDeviceId = peripheralId.replace(/[^a-zA-Z0-9._-]/g, "_");
      await SecureStore.setItemAsync(
        `ble_device_${sanitizedDeviceId}`,
        newDynamicKey,
      );
      console.log(
        `[BLE Context] Re-handshake succeeded — fresh dynamic key derived for ${peripheralId}`,
      );
      return newDynamicKey;
    } catch (err) {
      console.warn("[BLE Context] Re-handshake after reconnect failed:", err);
      return null;
    }
  };

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

      // Re-bind to a const so TS narrows past the closure assignment.
      const foundId: string = foundPeripheralId;

      try {
        await BleManager.connect(foundId);
      } catch (connErr) {
        console.warn(
          `[BLE Reconnect] connect(${foundId}) failed:`,
          connErr,
        );
        return false;
      }

      const newKey = await rehandshakeAfterReconnect(
        foundId,
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
          id: foundId,
          name: lastPaired.name,
          serialNumber: lastPaired.serialNumber,
        }),
      );

      setConnectedDevice({
        id: foundId,
        name: lastPaired.name ?? undefined,
        serialNumber: lastPaired.serialNumber,
        peripheral: { id: foundId } as Peripheral,
      });
      setEncryptionKey(newKey);
      setConnectionState("connected");

      console.log(
        `[BLE Reconnect] Reconnected to ${foundId} (serial ${lastPaired.serialNumber})`,
      );
      return true;
    } catch (err) {
      console.warn("[BLE Reconnect] findAndReconnectPairedBracelet threw:", err);
      return false;
    } finally {
      reconnectInFlightRef.current = false;
    }
  };

  // On-demand reconnect — same logic as one periodic-poll tick, but runs
  // immediately. Used by the dashboard pill's "Try to reconnect" affordance.
  // Returns true if we ended up in "connected" state.
  const reconnectLastPairedNow = async (): Promise<boolean> => {
    return findAndReconnectPairedBracelet({ scanSeconds: 10 });
  };

  // Background reconnect loop. When connectionState is "disconnected" AND
  // SecureStore still holds ble_last_paired_device (user did NOT explicitly
  // disconnect), poll every 15s for the bracelet coming back into range.
  // Uses BleManager.isPeripheralConnected first (cheap), falls back to an
  // active connect attempt. This is the belt-and-suspenders fallback for
  // Android's autoConnect=true not working reliably without an OS-level bond,
  // and for the JS-reload-but-OS-link-alive case where our app needs to
  // re-mark connection as live.
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

  // Create stable event handlers using refs
  const stableHandleStopScan = useCallback(() => {
    console.log("[BLE Context] Scan stopped event received");
    console.log(
      `[BLE Context] Current connection state: ${connectionStateRef.current}`,
    );
    if (connectionStateRef.current === "scanning") {
      console.log(
        "[BLE Context] Changing connection state from scanning to disconnected",
      );
      setConnectionState("disconnected");
    }
  }, []);

  const stableHandleDisconnectedDevice = useCallback(
    (event: BleDisconnectPeripheralEvent) => {
      const elapsedMs =
        lastConnectedAtRef.current != null
          ? Date.now() - lastConnectedAtRef.current
          : null;
      console.log(
        `[BLE Context] Device disconnected: ${event.peripheral}${
          elapsedMs != null
            ? ` (Δ ${elapsedMs}ms since last "connected" state)`
            : " (no prior connected state in this session)"
        }`,
      );
      if (
        connectedDeviceRef.current &&
        event.peripheral === connectedDeviceRef.current.id
      ) {
        setEncryptionKey(null);
        setConnectionState("disconnected");
        setConnectedDevice(null);

        // Range-loss-then-return: if this wasn't a user-initiated disconnect
        // (i.e., the ble_last_paired_device pointer is still in SecureStore),
        // ask Android to start a persistent background auto-reconnect.
        // Android keeps trying in the background and re-establishes the link
        // when the bracelet is in range again — no scan needed (bracelet
        // doesn't advertise post-pairing). If user explicitly disconnects, the
        // disconnect flow clears the pointer, so this is a no-op.
        const peripheralId = event.peripheral;
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
      }
    },
    [],
  );

  const stableHandleUpdateValueForCharacteristic = useCallback(
    (data: BleManagerDidUpdateValueForCharacteristicEvent) => {
      console.log(
        `[BLE Context] Notification received from ${data.peripheral}`,
        data.value,
      );

      console.log(`   └─ Raw Data:`, Array.from(data.value));

      if (!encryptionKeyRef.current) {
        return;
      }

      try {
        // Convert received data to Uint8Array
        const encryptedData = new Uint8Array(data.value);

        // Decrypt notifications
        const tea = new TEAEncryption(encryptionKeyRef.current);
        const decryptedData = new Uint8Array(encryptedData.length);

        for (let i = 0; i < encryptedData.length; i += 8) {
          const block = encryptedData.slice(i, i + 8);
          if (block.length === 8) {
            const decryptedBlock = tea.decrypt(block);
            decryptedData.set(decryptedBlock, i);
          }
        }

        // Check if this is actually a notification (0x80-0x82) or a command response (0x01-0x13)
        const command = decryptedData[1]; // Command is at byte 1 after API version

        if (command !== undefined && command < 0x80) {
          // This is a command response, not a notification - should be handled by command responses
          const commandName = getCommandName(command);
          console.log(
            `[BLE Context] Received ${commandName} response (command 0x${command.toString(16).padStart(2, "0")})`,
          );
          console.log(`   └─ Length: ${decryptedData.length} bytes`);
          return;
        }

        // Parse the notification and add to context notifications
        const notification = parseNotification(decryptedData);
        if (notification) {
          let detailedDescription = "";
          let notificationType: "battery" | "event" | "time" | "unknown" =
            "unknown";

          // Log detailed notification information based on command type
          if (notification.command === 0x80) {
            // Battery Status Notification
            const batteryNotification =
              parseBatteryStatusNotification(decryptedData);
            notificationType = "battery";
            detailedDescription = `Battery: ${batteryNotification.batteryLevelText} (${batteryNotification.batteryVoltage}mV)${batteryNotification.isCharging ? " - Charging" : ""}`;

            console.log(
              `[BLE Context] Battery Status: ${batteryNotification.batteryLevelText} at ${batteryNotification.batteryVoltage}mV${batteryNotification.isCharging ? " (Charging)" : " (Not Charging)"}`,
            );
            console.log(
              `   └─ Battery Level: ${batteryNotification.batteryLevel}/4 (${batteryNotification.batteryLevelText})`,
            );
          } else if (notification.command === 0x81) {
            // Active Event Notification
            const eventNotification =
              parseActiveEventNotification(decryptedData);
            notificationType = "event";
            detailedDescription = `Event ${eventNotification.eventIndex}: ${eventNotification.eventStateText}`;

            console.log(
              `[BLE Context] Event Status: Event #${eventNotification.eventIndex} is ${eventNotification.eventStateText}`,
            );
            console.log(
              `   └─ State Code: ${eventNotification.eventState} (${eventNotification.eventStateText})`,
            );
          } else {
            // Time Notification (command === 0x82)
            const timeNotification = parseTimeNotification(decryptedData);
            notificationType = "time";
            detailedDescription = `Time: ${timeNotification.dateTime.toLocaleString()} (${timeNotification.weekDayText})`;

            const formattedDate =
              timeNotification.dateTime.toLocaleDateString();
            const formattedTime =
              timeNotification.dateTime.toLocaleTimeString();

            console.log(
              `[BLE Context] Time Update: ${formattedDate} at ${formattedTime}`,
            );
            console.log(`   └─ Day: ${timeNotification.weekDayText}`);
            console.log(
              `   └─ Full DateTime: ${timeNotification.dateTime.toLocaleString()}`,
            );
          }

          const contextNotification: BLENotification = {
            type: notificationType,
            timestamp: new Date(),
            description: detailedDescription,
            rawData: Array.from(decryptedData),
          };

          setNotifications((prev) => [...prev, contextNotification]);
          console.log(
            `[BLE Context] Notification Summary: ${detailedDescription}`,
          );
        } else {
          console.warn(
            "[BLE Context] Could not parse notification - unknown format:",
            {
              encryptedLength: encryptedData.length,
              decryptedLength: decryptedData.length,
              rawDecrypted: Array.from(decryptedData),
            },
          );
        }
      } catch (error) {
        console.warn("[BLE Context] Failed to parse notification:", error);
      }
    },
    [],
  );

  // Initialize BLE manager and set up global listeners - only once
  useEffect(() => {
    if (bleInitialized.current) {
      return;
    }

    console.log(
      "[BLE Context] Initializing BLE manager and global listeners...",
    );

    // DIAG-V3 — raw NativeEventEmitter listener bypasses BleManager's wrapper
    // to test whether the native module is emitting BleManagerDiscoverPeripheral
    // events at all. If RAW-NATIVE fires but DIAG-V2 RAW PERIPHERAL doesn't,
    // the wrapper is broken; if neither fires, the native module isn't emitting.
    const bleNativeModule = NativeModules.BleManager as unknown;
    if (bleNativeModule) {
      const rawEmitter = new NativeEventEmitter(
        bleNativeModule as ConstructorParameters<typeof NativeEventEmitter>[0],
      );
      rawEmitter.addListener("BleManagerDiscoverPeripheral", (p: unknown) => {
        console.log(
          "[DIAG-V3 RAW-NATIVE] BleManagerDiscoverPeripheral",
          JSON.stringify(p).slice(0, 200),
        );
      });
      console.log(
        "[DIAG-V3] Raw NativeEventEmitter listener attached for BleManagerDiscoverPeripheral",
      );
    } else {
      console.log(
        "[DIAG-V3] NativeModules.BleManager is undefined — native module not linked!",
      );
    }

    bleInitialized.current = true;

    // Request Bluetooth permissions before starting BLE manager
    void requestBluetoothPermissions().then((granted) => {
      if (!granted) {
        console.warn(
          "[BLE Context] Bluetooth permissions not granted, BLE functionality may be limited",
        );
      }

      BleManager.start({ showAlert: false })
        .then(async () => {
          console.log("[BLE Context] BLE Manager started successfully");
          // Auto-restore connection state on app boot / JS reload.
          // If the OS still holds an active BLE link to our last-paired
          // bracelet, lift our React-state from "disconnected" back to
          // "connected" without making the user re-pair.
          try {
            const lastPairedJson = await SecureStore.getItemAsync(
              "ble_last_paired_device",
            );
            if (!lastPairedJson) return;
            const lastPaired = JSON.parse(lastPairedJson) as {
              id: string;
              name: string | null;
              serialNumber: string;
            };
            const isStillConnected = await BleManager.isPeripheralConnected(
              lastPaired.id,
            );
            if (!isStillConnected) {
              console.log(
                "[BLE Context] Auto-restore skipped — last-paired device not OS-connected",
              );
              return;
            }
            const sanitizedDeviceId = lastPaired.id.replace(
              /[^a-zA-Z0-9._-]/g,
              "_",
            );
            const key = await SecureStore.getItemAsync(
              `ble_device_${sanitizedDeviceId}`,
            );
            if (!key) {
              console.log(
                "[BLE Context] Auto-restore skipped — no stored key for last-paired device",
              );
              return;
            }
            console.log(
              `[BLE Context] Auto-restoring connection to ${lastPaired.id}`,
            );
            setConnectedDevice({
              id: lastPaired.id,
              name: lastPaired.name ?? undefined,
              serialNumber: lastPaired.serialNumber,
              peripheral: { id: lastPaired.id } as Peripheral,
            });
            setEncryptionKey(key);
            setConnectionState("connected");
          } catch (restoreErr) {
            console.warn(
              "[BLE Context] Auto-restore failed (will require manual re-pair):",
              restoreErr,
            );
          }
        })
        .catch((error) => {
          console.error("[BLE Context] BLE Manager failed to start:", error);
          bleInitialized.current = false; // Reset on error
        });
    });

    console.log("[BLE Context] Setting up global BLE event listeners...");
    const listeners = [
      BleManager.onStopScan(stableHandleStopScan),
      BleManager.onDisconnectPeripheral(stableHandleDisconnectedDevice),
      BleManager.onDidUpdateValueForCharacteristic(
        stableHandleUpdateValueForCharacteristic,
      ),
    ];
    listenersRef.current = listeners;
    console.log(
      `[BLE Context] ${listeners.length} global listeners registered`,
    );

    return () => {
      console.log("[BLE Context] Cleaning up BLE listeners...");
      for (const listener of listenersRef.current) {
        listener.remove();
      }
      listenersRef.current = [];
      bleInitialized.current = false;
    };
  }, [
    stableHandleStopScan,
    stableHandleDisconnectedDevice,
    stableHandleUpdateValueForCharacteristic,
  ]);

  // Context value implementation
  const contextValue: BLEContextValue = {
    connectionState,
    connectedDevice,
    encryptionKey,
    notifications,
    setConnectedDevice,
    setEncryptionKey,
    setConnectionState,
    reconnectLastPaired: reconnectLastPairedNow,
    sendBLECommand: async (command: BLECommandRequest, timeoutMs = 20000) => {
      if (!connectedDevice || !encryptionKey) {
        throw new Error("Device not connected or encryption key missing");
      }

      if (connectionState !== "connected") {
        throw new Error(`Invalid connection state: ${connectionState}`);
      }

      // Use mock BLE for test users
      if (isTestUser) {
        console.log(`[BLE Context] Using mock BLE service for test user`);
        return mockBLE.mockSendCommand(command, timeoutMs);
      }

      const maxRetries = 3;
      let lastError: Error = new Error("No attempts made");

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `[BLE Context] Sending command 0x${command.command.toString(16)} (attempt ${attempt}/${maxRetries})`,
          );

          const response = await sendCommand({
            peripheralId: connectedDevice.id,
            command,
            encryptionKey,
            timeoutMs,
          });

          if (attempt > 1) {
            console.log(
              `[BLE Context] Command succeeded on attempt ${attempt}`,
            );
          }

          return response;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `[BLE Context] Command attempt ${attempt}/${maxRetries} failed:`,
            lastError.message,
          );

          if (attempt === maxRetries) {
            console.error(
              `[BLE Context] Command failed after ${maxRetries} attempts`,
            );
            throw lastError;
          }

          const delayMs = attempt * 1000;
          console.log(`[BLE Context] Waiting ${delayMs}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      throw lastError;
    },
    sendMultiPacketBLECommand: async (
      command: BLECommandRequest,
      packetHandler: (payload: Uint8Array, deviceId: string) => unknown,
      timeoutMs = 30000,
    ) => {
      console.log(
        `[BLE Context] sendMultiPacketBLECommand called:`,
        JSON.stringify(
          {
            command: `0x${command.command.toString(16)}`,
            hasDevice: !!connectedDevice,
            deviceId: connectedDevice?.id ?? "none",
            hasEncryptionKey: !!encryptionKey,
            connectionState,
            timeoutMs,
            hasPacketHandler: !!packetHandler,
            isTestUser,
          },
          null,
          2,
        ),
      );

      if (!connectedDevice || !encryptionKey) {
        console.error(
          "[BLE Context] sendMultiPacketBLECommand failed - device not connected or encryption key missing",
        );
        throw new Error("Device not connected or encryption key missing");
      }

      if (connectionState !== "connected") {
        console.error(
          `[BLE Context] sendMultiPacketBLECommand failed - invalid connection state: ${connectionState}`,
        );
        throw new Error(`Invalid connection state: ${connectionState}`);
      }

      // Use mock BLE for test users
      if (isTestUser) {
        console.log(
          `[BLE Context] Using mock BLE multi-packet service for test user`,
        );
        return mockBLE.mockSendMultiPacketCommand(
          command,
          packetHandler,
          timeoutMs,
        );
      }

      const maxRetries = 3;
      let lastError: Error = new Error("No attempts made");

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `[BLE Context] Sending multi-packet command 0x${command.command.toString(16)} (attempt ${attempt}/${maxRetries})`,
          );

          const response = await sendMultiPacketCommand(
            connectedDevice.id,
            encryptionKey,
            command,
            packetHandler,
            timeoutMs,
          );

          if (attempt > 1) {
            console.log(
              `[BLE Context] Multi-packet command succeeded on attempt ${attempt}`,
            );
          } else {
            console.log(
              `[BLE Context] Multi-packet command 0x${command.command.toString(16)} succeeded on first attempt`,
            );
          }

          return response;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `[BLE Context] Multi-packet command attempt ${attempt}/${maxRetries} failed:`,
            lastError.message,
          );

          if (attempt === maxRetries) {
            console.error(
              `[BLE Context] Multi-packet command 0x${command.command.toString(16)} failed after ${maxRetries} attempts. Final error:`,
              lastError,
            );
            throw lastError;
          }

          const delayMs = attempt * 1000;
          console.log(`[BLE Context] Waiting ${delayMs}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      throw lastError;
    },
    clearNotifications: () => setNotifications([]),
    addNotification: (notification) =>
      setNotifications((prev) => [...prev, notification]),
    getConnectionStatus: () => connectionState,
    isDeviceConnected: () => connectionState === "connected",

    // Connection methods
    connectToDevice: async (
      serialNumber: string,
      onProgress?: BLEConnectionCallback,
      config?: BLEConnectionConfig,
    ) => {
      console.log(
        `[BLE Context] Starting connectToDevice for serial: ${serialNumber}`,
      );

      const defaultConfig: Required<BLEConnectionConfig> = {
        maxRetries: 3,
        connectionTimeoutMs: 20000,
        stabilizationDelayMs: 900,
        mtuSize: 512,
        scanTimeoutSeconds: 10,
        ...config,
      };

      console.log(`[BLE Context] Using connection config:`, defaultConfig);

      onProgress?.({
        step: "starting",
        progress: 0,
        message: "Starting connection process...",
      });

      // Use mock BLE for test users
      if (isTestUser) {
        console.log(`[BLE Context] Using mock BLE connection for test user`);

        try {
          onProgress?.({
            step: "connecting",
            progress: 40,
            message: "Connecting to simulated device...",
          });

          await mockBLE.mockConnectToDevice(
            `mock-${serialNumber}`,
            serialNumber,
          );

          onProgress?.({
            step: "connected",
            progress: 70,
            message: "Connected to simulated device!",
          });

          // Set up mock device info
          const mockDeviceInfo = mockBLE.getMockDeviceInfo();
          setConnectedDevice({
            id: `mock-${serialNumber}`,
            name: "Test Gently Device",
            serialNumber: mockDeviceInfo.serialNumber,
            rssi: -45,
          });

          // Use a fixed encryption key for test mode
          setEncryptionKey("MOCK_TEST_KEY_1234567890ABCDEF");
          setConnectionState("connected");

          onProgress?.({
            step: "complete",
            progress: 100,
            message: "Connection complete!",
          });

          trackBleConnectionSuccess(serialNumber);
          return;
        } catch (error) {
          console.error(`[Mock BLE] Connection failed:`, error);
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          trackBleConnectionError(`mock-${serialNumber}`, errorMessage);
          throw error;
        }
      }

      try {
        // Ensure any ongoing scan is stopped before starting
        console.log(
          `[BLE Context] Stopping any ongoing scan before connection...`,
        );
        try {
          await BleManager.stopScan();
          console.log(`[BLE Context] Scan stopped successfully`);
        } catch (stopError) {
          console.log(
            `[BLE Context] No scan to stop or already stopped:`,
            stopError,
          );
        }

        // Wait 900ms to ensure scan is fully stopped
        console.log(`[BLE Context] Waiting 900ms for scan to fully stop...`);
        await new Promise((resolve) => setTimeout(resolve, 900));
        console.log(`[BLE Context] Wait complete, ready to proceed`);

        setConnectionState("scanning");

        // Check for existing connections and disconnect from ALL devices
        onProgress?.({
          step: "checking_existing",
          progress: 10,
          message: "Checking for existing connections...",
        });

        const connectedDevices = await BleManager.getConnectedPeripherals([]);

        // Disconnect from ALL existing connections to ensure clean state
        if (connectedDevices.length > 0) {
          console.log(
            `[BLE Context] Found ${connectedDevices.length} existing connection(s), disconnecting all...`,
          );
          onProgress?.({
            step: "disconnecting_previous",
            progress: 15,
            message: `Disconnecting ${connectedDevices.length} previous device(s)...`,
          });

          for (const peripheral of connectedDevices) {
            try {
              console.log(
                `[BLE Context] Disconnecting from ${peripheral.id} (${peripheral.name ?? "unknown"})`,
              );
              await disconnectFromBLEDevice(peripheral.id);
              console.log(
                `[BLE Context] Disconnected from ${peripheral.id}`,
              );
            } catch (disconnectError) {
              console.warn(
                `[BLE Context] Failed to disconnect from ${peripheral.id}:`,
                disconnectError,
              );
            }
          }

          // Wait a moment for disconnections to complete
          await new Promise((resolve) => setTimeout(resolve, 500));
          console.log(`[BLE Context] All previous connections disconnected`);
        } else {
          console.log(`[BLE Context] No existing connections found`);
        }

        // No valid existing connection, start scanning
        onProgress?.({
          step: "scanning",
          progress: 30,
          message: "Scanning for device...",
        });

        // Scan for device
        let foundPeripheral: Peripheral | null = null;

        foundPeripheral = await new Promise((resolve, reject) => {
          const defaultScanConfig: Required<BLEConnectionConfig> = {
            maxRetries: 3,
            connectionTimeoutMs: 20000,
            stabilizationDelayMs: 900,
            mtuSize: 512,
            scanTimeoutSeconds: 10,
            ...config,
          };

          let foundDevice: Peripheral | null = null;
          let isResolved = false;

          const scanTimeout = setTimeout(() => {
            if (isResolved) return;

            BleManager.stopScan()
              .then(() => {
                if (!foundDevice && !isResolved) {
                  isResolved = true;
                  onProgress?.({
                    step: "scan_timeout",
                    progress: 0,
                    message: "Device not found within timeout",
                    isError: true,
                  });
                  resolve(null);
                }
              })
              .catch(reject);
          }, defaultScanConfig.scanTimeoutSeconds * 1000);

          const handleDiscoverPeripheral = (peripheral: Peripheral) => {
            if (isResolved) return;
            const advName =
              peripheral.name ?? peripheral.advertising?.localName ?? "";
            if (!/^gently/i.test(advName)) return;

            if (peripheral.advertising.manufacturerRawData) {
              try {
                const adData = extractAndDecryptAdvertisementData(
                  peripheral.advertising.manufacturerRawData,
                );

                if (
                  adData &&
                  (adData.serialNumber === serialNumber ||
                    adData.serialNumber.toUpperCase() ===
                      serialNumber.toUpperCase())
                ) {
                  foundDevice = peripheral;
                  isResolved = true;
                  clearTimeout(scanTimeout);

                  onProgress?.({
                    step: "device_found",
                    progress: 50,
                    message: `Target device found: ${serialNumber}`,
                  });

                  resolve(peripheral);

                  BleManager.stopScan().catch((error) => {
                    console.warn(
                      "Error stopping scan after device found:",
                      error,
                    );
                  });
                }
              } catch (error) {
                console.warn("Error processing advertisement data:", error);
              }
            }
          };

          // Start scanning
          BleManager.onDiscoverPeripheral(handleDiscoverPeripheral);

          BleManager.scan({
            serviceUUIDs: [],
            seconds: defaultScanConfig.scanTimeoutSeconds,
            allowDuplicates: false,
            matchMode: BleScanMatchMode.Sticky,
            scanMode: BleScanMode.LowLatency,
            callbackType: BleScanCallbackType.AllMatches,
          }).catch((error) => {
            clearTimeout(scanTimeout);
            reject(
              new Error(error instanceof Error ? error.message : String(error)),
            );
          });
        });

        if (!foundPeripheral) {
          throw new Error("Device not found during scan");
        }

        // Connect to the found device
        await connectToFoundPeripheral(
          foundPeripheral,
          serialNumber,
          onProgress,
          defaultConfig,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        onProgress?.({
          step: "error",
          progress: 0,
          message: `Connection failed: ${errorMessage}`,
          isError: true,
        });
        setConnectionState("error");
        throw error;
      }
    },

    connectToPeripheral: async (
      peripheral: Peripheral,
      serialNumber: string,
      onProgress?: BLEConnectionCallback,
      config?: BLEConnectionConfig,
    ) => {
      console.log(
        `[BLE Context] Starting connectToPeripheral for serial: ${serialNumber}, peripheral: ${peripheral.id}`,
      );

      // Track connection attempt
      trackBleConnectionAttempt(peripheral.id);

      const defaultConfig: Required<BLEConnectionConfig> = {
        maxRetries: 3,
        connectionTimeoutMs: 20000,
        stabilizationDelayMs: 900,
        mtuSize: 512,
        scanTimeoutSeconds: 10,
        ...config,
      };

      console.log(`[BLE Context] Using connection config:`, defaultConfig);

      onProgress?.({
        step: "starting",
        progress: 0,
        message: "Starting connection process...",
      });

      // Use mock BLE for test users
      if (isTestUser) {
        console.log(
          `[BLE Context] Using mock BLE connectToPeripheral for test user`,
        );

        try {
          onProgress?.({
            step: "connecting",
            progress: 40,
            message: "Connecting to simulated device...",
          });

          await mockBLE.mockConnectToDevice(peripheral.id, serialNumber);

          onProgress?.({
            step: "connected",
            progress: 70,
            message: "Connected to simulated device!",
          });

          // Set up mock device info
          const mockDeviceInfo = mockBLE.getMockDeviceInfo();
          setConnectedDevice({
            id: peripheral.id,
            name: peripheral.name ?? "Test Gently Device",
            serialNumber: mockDeviceInfo.serialNumber,
            rssi: peripheral.rssi,
            peripheral,
          });

          // Use a fixed encryption key for test mode
          setEncryptionKey("MOCK_TEST_KEY_1234567890ABCDEF");
          setConnectionState("connected");

          onProgress?.({
            step: "complete",
            progress: 100,
            message: "Connection complete!",
          });

          trackBleConnectionSuccess(serialNumber);
          return;
        } catch (error) {
          console.error(`[Mock BLE] Connection failed:`, error);
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          trackBleConnectionError(peripheral.id, errorMessage);
          throw error;
        }
      }

      try {
        // Ensure any ongoing scan is stopped before connecting
        console.log(
          `[BLE Context] Stopping any ongoing scan before connection...`,
        );
        try {
          await BleManager.stopScan();
          console.log(`[BLE Context] Scan stopped successfully`);
        } catch (stopError) {
          console.log(
            `[BLE Context] No scan to stop or already stopped:`,
            stopError,
          );
        }

        // Wait 900ms to ensure scan is fully stopped
        console.log(`[BLE Context] Waiting 900ms for scan to fully stop...`);
        await new Promise((resolve) => setTimeout(resolve, 900));
        console.log(`[BLE Context] Wait complete, ready to connect`);

        // Check for existing connections and disconnect from ALL devices
        onProgress?.({
          step: "checking_existing",
          progress: 10,
          message: "Checking for existing connections...",
        });

        const connectedDevices = await BleManager.getConnectedPeripherals([]);

        // Disconnect from ALL existing connections to ensure clean state
        if (connectedDevices.length > 0) {
          console.log(
            `[BLE Context] Found ${connectedDevices.length} existing connection(s), disconnecting all...`,
          );
          onProgress?.({
            step: "disconnecting_previous",
            progress: 15,
            message: `Disconnecting ${connectedDevices.length} previous device(s)...`,
          });

          for (const existingPeripheral of connectedDevices) {
            try {
              console.log(
                `[BLE Context] Disconnecting from ${existingPeripheral.id} (${existingPeripheral.name ?? "unknown"})`,
              );
              await disconnectFromBLEDevice(existingPeripheral.id);
              console.log(
                `[BLE Context] Disconnected from ${existingPeripheral.id}`,
              );
            } catch (disconnectError) {
              console.warn(
                `[BLE Context] Failed to disconnect from ${existingPeripheral.id}:`,
                disconnectError,
              );
            }
          }

          // Wait a moment for disconnections to complete
          await new Promise((resolve) => setTimeout(resolve, 500));
          console.log(`[BLE Context] All previous connections disconnected`);
        } else {
          console.log(`[BLE Context] No existing connections found`);
        }

        // No valid existing connection, connect to the provided peripheral
        onProgress?.({
          step: "connecting",
          progress: 30,
          message: "Connecting to discovered device...",
        });

        // Connect to the found device
        await connectToFoundPeripheral(
          peripheral,
          serialNumber,
          onProgress,
          defaultConfig,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        onProgress?.({
          step: "error",
          progress: 0,
          message: `Connection failed: ${errorMessage}`,
          isError: true,
        });
        setConnectionState("error");
        // Track connection error
        trackBleConnectionError(peripheral.id, errorMessage);
        throw error;
      }
    },

    disconnectDevice: async () => {
      console.log(
        `[BLE Context] disconnectDevice called:`,
        JSON.stringify(
          {
            hasConnectedDevice: !!connectedDevice,
            deviceId: connectedDevice?.id ?? "none",
            deviceName: connectedDevice?.name ?? "none",
            currentState: connectionState,
            hasEncryptionKey: !!encryptionKey,
          },
          null,
          2,
        ),
      );

      if (connectedDevice) {
        try {
          console.log(
            `[BLE Context] Disconnecting from device: ${connectedDevice.id} (${connectedDevice.name})`,
          );

          // Use mock BLE for test users
          if (isTestUser) {
            console.log(
              `[BLE Context] Using mock BLE disconnect for test user`,
            );
            await mockBLE.mockDisconnectDevice();
          } else {
            await disconnectFromBLEDevice(connectedDevice.id);
          }

          console.log(
            `[BLE Context] Successfully disconnected from device: ${connectedDevice.id}`,
          );

          // Remove the stored encryption key (skip for test users)
          if (!isTestUser) {
            const sanitizedDeviceId = connectedDevice.id.replace(
              /[^a-zA-Z0-9._-]/g,
              "_",
            );
            try {
              await SecureStore.deleteItemAsync(
                `ble_device_${sanitizedDeviceId}`,
              );
              await SecureStore.deleteItemAsync("ble_last_paired_device");
              console.log(
                `[BLE Context] Removed stored encryption key + last-paired pointer for ${connectedDevice.id}`,
              );
            } catch (keyError) {
              console.warn(
                `[BLE Context] Failed to remove encryption key for ${connectedDevice.id}:`,
                keyError,
              );
            }
          }
        } catch (error) {
          console.warn("[BLE Context] Disconnect error:", error);
        }
      } else {
        console.log(
          "[BLE Context] No device connected, clearing state only",
        );
      }

      console.log(
        "[BLE Context] Clearing connection state and encryption key",
      );
      // Track disconnection
      if (connectedDevice?.id) {
        trackBleDisconnection(connectedDevice.id, "user_initiated");
      }
      setConnectedDevice(null);
      setEncryptionKey(null);
      setConnectionState("disconnected");
      console.log("[BLE Context] Device disconnection complete");
    },

    scanForDevice: async (
      serialNumber: string,
      onProgress?: BLEConnectionCallback,
      config?: BLEConnectionConfig,
    ): Promise<Peripheral | null> => {
      console.log(
        `[BLE Context] scanForDevice called:`,
        JSON.stringify(
          {
            serialNumber,
            hasProgressCallback: !!onProgress,
            config: config ?? "using defaults",
            currentState: connectionState,
          },
          null,
          2,
        ),
      );

      const defaultConfig: Required<BLEConnectionConfig> = {
        maxRetries: 3,
        connectionTimeoutMs: 20000,
        stabilizationDelayMs: 900,
        mtuSize: 512,
        scanTimeoutSeconds: 30,
        ...config,
      };

      console.log(
        `[BLE Context] scanForDevice config:`,
        JSON.stringify(defaultConfig, null, 2),
      );

      return new Promise((resolve, reject) => {
        console.log(
          `[BLE Context] Setting scan timeout for ${defaultConfig.scanTimeoutSeconds} seconds`,
        );
        const scanTimeout = setTimeout(() => {
          console.log(
            `[BLE Context] Scan timeout reached (${defaultConfig.scanTimeoutSeconds}s), stopping scan`,
          );
          BleManager.stopScan()
            .then(() => {
              console.log(`[BLE Context] Scan stopped due to timeout`);
              if (!foundDevice) {
                console.log(
                  `[BLE Context] No target device found within timeout period`,
                );
                onProgress?.({
                  step: "scan_timeout",
                  progress: 0,
                  message: "Device not found within timeout",
                  isError: true,
                });
                resolve(null);
              }
            })
            .catch(reject);
        }, defaultConfig.scanTimeoutSeconds * 1000);

        let foundDevice: Peripheral | null = null;

        const handleDiscoverPeripheral = (peripheral: Peripheral) => {
          const advName =
            peripheral.name ?? peripheral.advertising?.localName ?? "";
          if (!/^gently/i.test(advName)) {
            return;
          }

          console.log(
            `[BLE Context] Found Gently device, checking serial number...`,
          );

          if (peripheral.advertising.manufacturerRawData) {
            try {
              console.log(
                `[BLE Context] Processing advertisement data for device: ${peripheral.id}`,
              );
              const adData = extractAndDecryptAdvertisementData(
                peripheral.advertising.manufacturerRawData,
              );

              console.log(
                `[BLE Context] Advertisement data:`,
                JSON.stringify(
                  {
                    deviceId: peripheral.id,
                    hasAdData: !!adData,
                    adSerialNumber: adData?.serialNumber ?? "none",
                    targetSerialNumber: serialNumber,
                    matchesTarget: adData
                      ? adData.serialNumber === serialNumber ||
                        adData.serialNumber.toUpperCase() ===
                          serialNumber.toUpperCase()
                      : false,
                  },
                  null,
                  2,
                ),
              );

              if (
                adData &&
                (adData.serialNumber === serialNumber ||
                  adData.serialNumber.toUpperCase() ===
                    serialNumber.toUpperCase())
              ) {
                console.log(
                  `[BLE Context] Target device found! Serial: ${adData.serialNumber}, Device: ${peripheral.id}`,
                );

                onProgress?.({
                  step: "device_found",
                  progress: 50,
                  message: `Target device found: ${serialNumber}`,
                });

                foundDevice = peripheral;
                clearTimeout(scanTimeout);

                console.log(
                  `[BLE Context] Stopping scan after finding target device`,
                );
                BleManager.stopScan()
                  .then(() => {
                    console.log(
                      `[BLE Context] Scan stopped successfully, resolving with device`,
                    );
                    resolve(peripheral);
                  })
                  .catch(reject);
              } else {
                console.log(
                  `[BLE Context] Serial number mismatch - looking for: ${serialNumber}, found: ${adData?.serialNumber ?? "none"}`,
                );
              }
            } catch (error) {
              console.warn(
                "[BLE Context] Error processing advertisement data:",
                error,
              );
            }
          } else {
            console.log(
              `[BLE Context] No manufacturer data found for device: ${peripheral.id}`,
            );
          }
        };

        // Start scanning
        console.log(`[BLE Context] Setting up peripheral discovery handler`);
        BleManager.onDiscoverPeripheral(handleDiscoverPeripheral);

        console.log(
          `[BLE Context] Starting BLE scan with parameters:`,
          JSON.stringify(
            {
              serviceUUIDs: [],
              scanTimeoutSeconds: defaultConfig.scanTimeoutSeconds,
              allowDuplicates: false,
              scanOptions: {
                matchMode: "Sticky",
                scanMode: "LowLatency",
                callbackType: "AllMatches",
                legacy: false,
              },
            },
            null,
            2,
          ),
        );

        console.log(`[BLE Context] Initiating BLE scan...`);
        BleManager.scan({
          serviceUUIDs: [],
          seconds: defaultConfig.scanTimeoutSeconds,
          allowDuplicates: false,
          matchMode: BleScanMatchMode.Sticky,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
        }).catch((error) => {
          clearTimeout(scanTimeout);
          reject(
            new Error(error instanceof Error ? error.message : String(error)),
          );
        });
      });
    },

    scanForDevices: async (
      onDeviceFound: (
        peripheral: Peripheral,
        advertisementData?: unknown,
      ) => void,
      timeoutSeconds = 30,
    ): Promise<void> => {
      console.log("[DIAG-V2] scanForDevices ENTRY — diagnostic build is live");
      console.log(
        `[BLE Context] Starting scanForDevices with timeout: ${timeoutSeconds}s`,
      );

      // Use mock BLE for test users
      if (isTestUser) {
        console.log(`[BLE Context] Using mock BLE scanning for test user`);
        return mockBLE.mockScanForDevices(onDeviceFound, timeoutSeconds);
      }

      return new Promise((resolve, reject) => {
        let gentlyDevicesFound = 0;

        const scanTimeout = setTimeout(() => {
          console.log(
            `[BLE Context] Scan timeout reached after ${timeoutSeconds}s`,
          );
          BleManager.stopScan()
            .then(async () => {
              console.log(
                `[BLE Context] Device scan completed after ${timeoutSeconds}s, found ${gentlyDevicesFound} Gently devices`,
              );

              // DIAG-V4 — if the native side saw any peripherals at all, they
              // accumulate in BleManager's internal cache. Querying it directly
              // distinguishes "native scan saw nothing" from "native saw stuff
              // but events never crossed the bridge to JS".
              try {
                const cached = await BleManager.getDiscoveredPeripherals();
                console.log(
                  "[DIAG-V4] getDiscoveredPeripherals returned",
                  cached.length,
                  "peripherals",
                );
                cached.slice(0, 10).forEach((p, i) => {
                  console.log(
                    `[DIAG-V4]   [${i}]`,
                    p.id,
                    JSON.stringify({
                      name: p.name,
                      rssi: p.rssi,
                      localName: p.advertising?.localName,
                    }),
                  );
                });
              } catch (e) {
                console.log(
                  "[DIAG-V4] getDiscoveredPeripherals threw:",
                  e instanceof Error ? e.message : String(e),
                );
              }

              resolve();
            })
            .catch((error) => {
              console.error(`[BLE Context] Error stopping scan:`, error);
              reject(error instanceof Error ? error : new Error(String(error)));
            });
        }, timeoutSeconds * 1000);

        const handleDiscoverPeripheral = (peripheral: Peripheral) => {
          // TEMP DIAGNOSTIC — dump every peripheral the scan sees so we can
          // identify what field exposes the bracelet's "Gently" name. Remove
          // once name matching is reliable.
          console.log("[BLE SCAN DIAG]", {
            id: peripheral.id,
            name: peripheral.name,
            rssi: peripheral.rssi,
            localName: peripheral.advertising?.localName,
            serviceUUIDs: peripheral.advertising?.serviceUUIDs,
            hasManufacturerData: Boolean(
              peripheral.advertising?.manufacturerRawData,
            ),
          });
          // Only process and return Gently devices (case-insensitive; also
          // checks scan-response localName so we don't miss firmwares that
          // put the name in the scan response rather than the advert).
          const advName =
            peripheral.name ?? peripheral.advertising?.localName ?? "";
          if (/^gently/i.test(advName)) {
            gentlyDevicesFound++;
            console.log(
              `[BLE Context] Gently device discovered: ${peripheral.id} (${gentlyDevicesFound} total)`,
            );

            try {
              if (peripheral.advertising.manufacturerRawData) {
                const adData = extractAndDecryptAdvertisementData(
                  peripheral.advertising.manufacturerRawData,
                );
                if (adData) {
                  console.log(
                    `[BLE Context] Successfully decrypted advertisement data:`,
                    adData,
                  );
                } else {
                  console.warn(
                    `[BLE Context] Failed to decrypt advertisement data for Gently device ${peripheral.id}`,
                  );
                }
                onDeviceFound(peripheral, adData);
              } else {
                console.log(
                  `[BLE Context] No manufacturer data for Gently device ${peripheral.id}, calling onDeviceFound anyway`,
                );
                onDeviceFound(peripheral);
              }
            } catch (error) {
              console.error(
                `[BLE Context] Error processing Gently device ${peripheral.id}:`,
                error,
              );
              onDeviceFound(peripheral);
            }
          }
        };

        // Start scanning
        console.log(`[BLE Context] Setting up discovery listener`);
        BleManager.onDiscoverPeripheral(handleDiscoverPeripheral);

        // DIAG-V2 — also attach a totally unfiltered listener that logs every
        // single peripheral the OS hands us, to confirm whether the BLE event
        // pipeline is delivering anything at all.
        BleManager.onDiscoverPeripheral((p) => {
          console.log(
            "[DIAG-V2] RAW PERIPHERAL",
            p.id,
            JSON.stringify({
              name: p.name,
              rssi: p.rssi,
              localName: p.advertising?.localName,
            }),
          );
        });

        console.log(`[BLE Context] Initiating BLE scan...`);
        // DIAG-V6 — THE FIX: enable extended-advertising scans on all PHYs.
        // The Gently bracelet uses Bluetooth 5 Advertising Extension with
        // Secondary PHY LE 2M. Android's default scan is legacy-only (BLE 4.2
        // and below) listening on PHY LE 1M only. Without `legacy: false` +
        // `phy: ALL_SUPPORTED`, the bracelet's adverts are completely
        // invisible to our scan even at -50 dBm right next to the phone.
        // nRF Connect uses these settings by default which is why it sees it
        // and we didn't. Confirmed via nRF: "Advertising type: Bluetooth 5
        // Advertising Extension, Primary PHY LE 1M, Secondary PHY LE 2M".
        BleManager.scan({
          serviceUUIDs: [],
          seconds: timeoutSeconds,
          allowDuplicates: true,
          matchMode: BleScanMatchMode.Aggressive,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
          legacy: false,
          phy: BleScanPhyMode.ALL_SUPPORTED,
        })
          .then(() => {
            console.log(`[BLE Context] BLE scan initiated successfully`);
          })
          .catch((error) => {
            console.error(`[BLE Context] Failed to start BLE scan:`, error);
            clearTimeout(scanTimeout);
            reject(
              new Error(error instanceof Error ? error.message : String(error)),
            );
          });
      });
    },
  };
  const connectToFoundPeripheral = async (
    peripheral: Peripheral,
    serialNumber: string,
    onProgress?: BLEConnectionCallback,
    config: Required<BLEConnectionConfig> = {
      maxRetries: 3,
      connectionTimeoutMs: 20000,
      stabilizationDelayMs: 900,
      mtuSize: 512,
      scanTimeoutSeconds: 30,
    },
  ) => {
    setConnectionState("connecting");

    onProgress?.({
      step: "connecting",
      progress: 60,
      message: "Connecting to device...",
    });

    // Check if already connected and disconnect first
    const isConnected = await BleManager.isPeripheralConnected(peripheral.id);
    if (isConnected) {
      try {
        await BleManager.disconnect(peripheral.id);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (disconnectError) {
        console.warn("Disconnect error:", disconnectError);
      }
    }

    let connected = false;
    let lastError: Error | null = null;

    for (
      let attempt = 1;
      attempt <= config.maxRetries && !connected;
      attempt++
    ) {
      console.log(
        `[BLE Context] Starting connection attempt ${attempt}/${config.maxRetries} to ${peripheral.id}`,
      );

      onProgress?.({
        step: "connecting",
        progress: 60 + (attempt - 1) * 10,
        message: `Connection attempt ${attempt}/${config.maxRetries}...`,
      });

      try {
        console.log(
          `[BLE Context] Calling BleManager.connect() for ${peripheral.id}...`,
        );

        // Connect with timeout
        const connectPromise = BleManager.connect(peripheral.id);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `Connection timeout after ${config.connectionTimeoutMs / 1000}s`,
                ),
              ),
            config.connectionTimeoutMs,
          );
        });

        await Promise.race([connectPromise, timeoutPromise]);

        console.log(
          `[BLE Context] BleManager.connect() succeeded for ${peripheral.id}`,
        );

        // Stabilization delay
        console.log(
          `[BLE Context] Waiting ${config.stabilizationDelayMs}ms for connection to stabilize...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, config.stabilizationDelayMs),
        );

        // Verify connection
        console.log(
          `[BLE Context] Verifying connection to ${peripheral.id}...`,
        );
        const isNowConnected = await BleManager.isPeripheralConnected(
          peripheral.id,
        );
        if (!isNowConnected) {
          throw new Error("Connection verification failed");
        }

        console.log(
          `[BLE Context] Connection verified for ${peripheral.id}`,
        );

        // Configure MTU for Android
        if (Platform.OS === "android") {
          try {
            console.log(
              `[BLE Context] Requesting MTU ${config.mtuSize} for ${peripheral.id}...`,
            );
            await BleManager.requestMTU(peripheral.id, config.mtuSize);
            console.log(
              `[BLE Context] MTU configured successfully for ${peripheral.id}`,
            );
          } catch (mtuError) {
            console.warn("MTU configuration failed:", mtuError);
          }
        }

        // Retrieve services and start notifications
        console.log(
          `[BLE Context] Retrieving services for ${peripheral.id}...`,
        );
        await BleManager.retrieveServices(peripheral.id);
        console.log(`[BLE Context] Services retrieved for ${peripheral.id}`);

        console.log(
          `[BLE Context] Starting notifications for ${peripheral.id}...`,
        );
        await startNotifications(peripheral.id);
        console.log(
          "[BLE Context] Notifications enabled for new connection",
        );

        connected = true;

        onProgress?.({
          step: "generating_key",
          progress: 80,
          message: "Generating encryption key...",
        });
      } catch (attemptError) {
        lastError =
          attemptError instanceof Error
            ? attemptError
            : new Error(String(attemptError));

        console.error(
          `[BLE Context] Connection attempt ${attempt} failed:`,
          lastError.message,
        );

        if (attempt < config.maxRetries) {
          const retryDelay = 2000;
          onProgress?.({
            step: "retrying",
            progress: 60 + (attempt - 1) * 10,
            message: `Attempt ${attempt} failed, retrying in ${retryDelay / 1000}s...`,
          });
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    if (!connected) {
      throw lastError ?? new Error("Connection failed after all attempts");
    }

    // Generate encryption key
    const uptimeResponse = await sendCommand({
      peripheralId: peripheral.id,
      command: createGetUptimeRequest(),
      encryptionKey: FACTORY_BRACELET_KEY,
    });

    const uptimeData = parseGetUptimeResponse(uptimeResponse.payload);
    const foundEncryptionKey = generateDynamicKey(
      FACTORY_BRACELET_KEY,
      uptimeData.uptimeBytes,
      serialNumber,
    );

    onProgress?.({
      step: "validating",
      progress: 90,
      message: "Validating connection...",
    });

    // Validate with device info
    const deviceInfoResponse = await sendCommand({
      peripheralId: peripheral.id,
      command: createGetDeviceInfoRequest(),
      encryptionKey: foundEncryptionKey,
    });

    if (deviceInfoResponse.status !== ResponseStatus.OK) {
      throw new Error(
        `Device info validation failed: Status=0x${deviceInfoResponse.status.toString(16)}`,
      );
    }

    // Set device time to current time
    console.log(`[BLE Context] Syncing device time for ${peripheral.id}...`);
    try {
      await sendCommand({
        peripheralId: peripheral.id,
        command: createSetTimeRequest(new Date()),
        encryptionKey: foundEncryptionKey,
        timeoutMs: 10000,
      });
      console.log(`[BLE Context] Device time synced successfully`);
    } catch (timeError) {
      console.warn(
        `[BLE Context] Failed to sync device time (non-critical):`,
        timeError,
      );
    }

    // Store the encryption key
    const sanitizedDeviceId = peripheral.id.replace(/[^a-zA-Z0-9._-]/g, "_");
    await SecureStore.setItemAsync(
      `ble_device_${sanitizedDeviceId}`,
      foundEncryptionKey,
    );

    // Persist a pointer to the most-recently-paired device so we can
    // auto-restore connection state on JS reload / app cold-start without
    // forcing the user to re-pair. Cleared in disconnectDevice/delete flow.
    await SecureStore.setItemAsync(
      "ble_last_paired_device",
      JSON.stringify({
        id: peripheral.id,
        name: peripheral.name ?? null,
        serialNumber,
      }),
    );

    // Create OS-level bond on Android. The bracelet uses a Resolvable Private
    // Address (RPA) — its MAC rotates over time. Without an OS-level bond,
    // Android can't resolve a rotated RPA back to the same device, so any
    // `BleManager.connect(storedMac)` call fails after range-loss with
    // "Device disconnected". Bonding exchanges an IRK so the OS resolves
    // future RPAs to the same identity, AND it enables `autoConnect: true`
    // to actually trigger reconnect on range return. This pops a one-time
    // Android system pairing dialog the user must accept. Fire-and-forget —
    // if user dismisses the dialog, the session still works but auto-reconnect
    // after range loss won't. iOS handles this implicitly via Core Bluetooth.
    if (Platform.OS === "android") {
      void BleManager.createBond(peripheral.id)
        .then(() => {
          console.log(
            `[BLE Context] OS-level bond established for ${peripheral.id} — auto-reconnect on range return now enabled`,
          );
        })
        .catch((bondErr) => {
          console.warn(
            `[BLE Context] createBond failed for ${peripheral.id} (auto-reconnect after range loss may not work):`,
            bondErr,
          );
        });
    }

    // Update context state
    setConnectedDevice({
      id: peripheral.id,
      name: peripheral.name,
      serialNumber: serialNumber,
      peripheral: peripheral,
    });
    setEncryptionKey(foundEncryptionKey);
    setConnectionState("connected");

    // Track successful connection
    trackBleConnectionSuccess(peripheral.id);

    onProgress?.({
      step: "connection_complete",
      progress: 100,
      message: "Device connected successfully!",
    });
  };

  return (
    <BLEContext.Provider value={contextValue}>{children}</BLEContext.Provider>
  );
}
