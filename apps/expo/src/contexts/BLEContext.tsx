/**
 * BLE Context Provider
 */

import type { ReactNode } from "react";
import type {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  Peripheral,
} from "react-native-ble-manager";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import BleManager, {
  BleScanCallbackType,
  BleScanMatchMode,
  BleScanMode,
} from "react-native-ble-manager";
import * as SecureStore from "expo-secure-store";

import type {
  BLECommandRequest,
  BLECommandResponse,
} from "../services/ble/types";
import { createGetDeviceInfoRequest } from "../services/ble/commands/getDeviceInfo";
import { createGetDeviceStatusRequest } from "../services/ble/commands/getDeviceStatus";
import {
  createGetUptimeRequest,
  parseGetUptimeResponse,
} from "../services/ble/commands/getUptime";
import { disconnectFromBLEDevice } from "../services/ble/connection";
import {
  extractAndDecryptAdvertisementData,
  generateDynamicKey,
  TEAEncryption,
} from "../services/ble/encryption";
import {
  sendCommand,
  sendMultiPacketCommand,
  startNotifications,
} from "../services/ble/manager";
import {
  parseActiveEventNotification,
  parseBatteryStatusNotification,
  parseNotification,
  parseTimeNotification,
} from "../services/ble/notifications";
import { FACTORY_BRACELET_KEY, ResponseStatus } from "../services/ble/types";
import { requestBluetoothPermissions } from "../services/ble/utils";

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
    0x03: "GET_EVENT",
    0x04: "ADD_EVENT",
    0x05: "SET_EVENT_ON_OFF",
    0x06: "GET_ALL_EVENTS",
    0x07: "REMOVE_EVENT",
    0x08: "REMOVE_ALL_EVENTS",
    0x09: "GET_NUMBER_OF_EVENTS",
    0x0a: "GET_TIME",
    0x0b: "SET_TIME",
    0x0c: "GET_DEVICE_STATUS",
    0x0d: "ACKNOWLEDGE_EVENT",
    0x0e: "SET_BRACELET_KEY",
    0x0f: "GET_BRACELET_KEY",
    0x10: "FIND_ME",
    0x11: "ENTER_DFU_MODE",
    0x12: "REBOOT_BRACELET",
    0x13: "SET_DYNAMIC_KEY",
  };
  return (
    commandNames[command] ??
    `UNKNOWN_COMMAND_${command.toString(16).padStart(2, "0").toUpperCase()}`
  );
}

export function BLEProvider({ children }: BLEProviderProps) {
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

  // Create stable event handlers using refs
  const stableHandleStopScan = useCallback(() => {
    console.log("🛑 [BLE Context] Scan stopped event received");
    console.log(
      `📊 [BLE Context] Current connection state: ${connectionStateRef.current}`,
    );
    if (connectionStateRef.current === "scanning") {
      console.log(
        "🔄 [BLE Context] Changing connection state from scanning to disconnected",
      );
      setConnectionState("disconnected");
    }
  }, []);

  const stableHandleDisconnectedDevice = useCallback(
    (event: BleDisconnectPeripheralEvent) => {
      console.log(`[BLE Context] Device disconnected: ${event.peripheral}`);
      if (
        connectedDeviceRef.current &&
        event.peripheral === connectedDeviceRef.current.id
      ) {
        setEncryptionKey(null);
        setConnectionState("disconnected");
        setConnectedDevice(null);
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

        // Decrypt notifications (simplified version for context)
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
            `📨 [BLE Context] Received ${commandName} response (command 0x${command.toString(16).padStart(2, "0")})`,
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
              `🔋 [BLE Context] Battery Status: ${batteryNotification.batteryLevelText} at ${batteryNotification.batteryVoltage}mV${batteryNotification.isCharging ? " (Charging)" : " (Not Charging)"}`,
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
              `⚡ [BLE Context] Event Status: Event #${eventNotification.eventIndex} is ${eventNotification.eventStateText}`,
            );
            console.log(
              `   └─ State Code: ${eventNotification.eventState} (${eventNotification.eventStateText})`,
            );

            console.log(`   └─ Raw Data:`, Array.from(decryptedData));
            console.log(`   └─ Decrypted Data:`, Array.from(decryptedData));
            console.log(`   └─ Event Notification:`, eventNotification);

            // Log when an alarm/event starts (state 2 = "ON (vibrating)")
            if (eventNotification.eventState === 2) {
              console.log(
                `🚨 [BLE Context] ALARM TRIGGERED: Event #${eventNotification.eventIndex} is now vibrating!`,
              );
              // Alert removed - device will handle vibration/LED notifications
            }
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
              `⏰ [BLE Context] Time Update: ${formattedDate} at ${formattedTime}`,
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
            `📲 [BLE Context] Notification Summary: ${detailedDescription}`,
          );
        } else {
          console.warn(
            "⚠️ [BLE Context] Could not parse notification - unknown format:",
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
      "🚀 [BLE Context] Initializing BLE manager and global listeners...",
    );

    bleInitialized.current = true;

    // Request Bluetooth permissions before starting BLE manager
    void requestBluetoothPermissions().then((granted) => {
      if (!granted) {
        console.warn(
          "⚠️ [BLE Context] Bluetooth permissions not granted, BLE functionality may be limited",
        );
      }

      BleManager.start({ showAlert: false })
        .then(() => {
          console.log("✅ [BLE Context] BLE Manager started successfully");
        })
        .catch((error) => {
          console.error("❌ [BLE Context] BLE Manager failed to start:", error);
          bleInitialized.current = false; // Reset on error
        });
    });

    console.log("👂 [BLE Context] Setting up global BLE event listeners...");
    const listeners = [
      BleManager.onStopScan(stableHandleStopScan),
      BleManager.onDisconnectPeripheral(stableHandleDisconnectedDevice),
      BleManager.onDidUpdateValueForCharacteristic(
        stableHandleUpdateValueForCharacteristic,
      ),
    ];
    listenersRef.current = listeners;
    console.log(
      `✅ [BLE Context] ${listeners.length} global listeners registered`,
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
    sendBLECommand: async (command: BLECommandRequest, timeoutMs = 20000) => {
      if (!connectedDevice || !encryptionKey) {
        throw new Error("Device not connected or encryption key missing");
      }

      if (connectionState !== "connected") {
        throw new Error(`Invalid connection state: ${connectionState}`);
      }

      const maxRetries = 3;
      let lastError: Error = new Error("No attempts made");

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `🔄 [BLE Context] Sending command 0x${command.command.toString(16)} (attempt ${attempt}/${maxRetries})`,
          );

          const response = await sendCommand({
            peripheralId: connectedDevice.id,
            command,
            encryptionKey,
            timeoutMs,
          });

          if (attempt > 1) {
            console.log(
              `✅ [BLE Context] Command succeeded on attempt ${attempt}`,
            );
          }

          return response;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `⚠️ [BLE Context] Command attempt ${attempt}/${maxRetries} failed:`,
            lastError.message,
          );

          if (attempt === maxRetries) {
            console.error(
              `❌ [BLE Context] Command failed after ${maxRetries} attempts`,
            );
            throw lastError;
          }

          const delayMs = attempt * 1000;
          console.log(`⏳ [BLE Context] Waiting ${delayMs}ms before retry...`);
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
        `📤 [BLE Context] sendMultiPacketBLECommand called:`,
        JSON.stringify(
          {
            command: `0x${command.command.toString(16)}`,
            hasDevice: !!connectedDevice,
            deviceId: connectedDevice?.id ?? "none",
            hasEncryptionKey: !!encryptionKey,
            connectionState,
            timeoutMs,
            hasPacketHandler: !!packetHandler,
          },
          null,
          2,
        ),
      );

      if (!connectedDevice || !encryptionKey) {
        console.error(
          "❌ [BLE Context] sendMultiPacketBLECommand failed - device not connected or encryption key missing",
        );
        throw new Error("Device not connected or encryption key missing");
      }

      if (connectionState !== "connected") {
        console.error(
          `❌ [BLE Context] sendMultiPacketBLECommand failed - invalid connection state: ${connectionState}`,
        );
        throw new Error(`Invalid connection state: ${connectionState}`);
      }

      const maxRetries = 3;
      let lastError: Error = new Error("No attempts made");

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `🔄 [BLE Context] Sending multi-packet command 0x${command.command.toString(16)} (attempt ${attempt}/${maxRetries})`,
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
              `✅ [BLE Context] Multi-packet command succeeded on attempt ${attempt}`,
            );
          } else {
            console.log(
              `✅ [BLE Context] Multi-packet command 0x${command.command.toString(16)} succeeded on first attempt`,
            );
          }

          return response;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `⚠️ [BLE Context] Multi-packet command attempt ${attempt}/${maxRetries} failed:`,
            lastError.message,
          );

          if (attempt === maxRetries) {
            console.error(
              `❌ [BLE Context] Multi-packet command 0x${command.command.toString(16)} failed after ${maxRetries} attempts. Final error:`,
              lastError,
            );
            throw lastError;
          }

          const delayMs = attempt * 1000;
          console.log(`⏳ [BLE Context] Waiting ${delayMs}ms before retry...`);
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
        `🔗 [BLE Context] Starting connectToDevice for serial: ${serialNumber}`,
      );

      const defaultConfig: Required<BLEConnectionConfig> = {
        maxRetries: 3,
        connectionTimeoutMs: 20000,
        stabilizationDelayMs: 900,
        mtuSize: 512,
        scanTimeoutSeconds: 10,
        ...config,
      };

      console.log(`⚙️ [BLE Context] Using connection config:`, defaultConfig);

      onProgress?.({
        step: "starting",
        progress: 0,
        message: "🔍 Starting connection process...",
      });

      try {
        setConnectionState("scanning");

        // Start BLE manager
        await BleManager.start({ showAlert: false });

        // Check for existing connections first
        onProgress?.({
          step: "checking_existing",
          progress: 10,
          message: "📱 Checking for existing connections...",
        });

        const connectedDevices = await BleManager.getConnectedPeripherals([]);

        // Try to validate existing connections
        for (const peripheral of connectedDevices) {
          const sanitizedDeviceId = peripheral.id.replace(
            /[^a-zA-Z0-9._-]/g,
            "_",
          );

          try {
            const storedKey = await SecureStore.getItemAsync(
              `ble_device_${sanitizedDeviceId}`,
            );

            if (storedKey) {
              onProgress?.({
                step: "validating_existing",
                progress: 20,
                message: `🔐 Testing existing connection to ${peripheral.id}...`,
              });

              // Configure for existing connection
              if (Platform.OS === "android") {
                try {
                  await BleManager.requestMTU(
                    peripheral.id,
                    defaultConfig.mtuSize,
                  );
                } catch (mtuError) {
                  console.warn("MTU request failed:", mtuError);
                }
              }

              await startNotifications(peripheral.id);
              console.log(
                "🔔 [BLE Context] Notifications enabled for existing connection - device will send battery, event, and time notifications",
              );

              // Validate with device status command
              const statusResponse = await sendCommand({
                peripheralId: peripheral.id,
                command: createGetDeviceStatusRequest(),
                encryptionKey: storedKey,
              });

              if (statusResponse.status === ResponseStatus.OK) {
                onProgress?.({
                  step: "connection_complete",
                  progress: 100,
                  message: "✅ Existing connection validated successfully!",
                });

                setConnectedDevice({
                  id: peripheral.id,
                  name: peripheral.name,
                  serialNumber: serialNumber,
                  peripheral: peripheral,
                });
                setEncryptionKey(storedKey);
                setConnectionState("connected");
                return;
              }
            }
          } catch (error) {
            console.warn("Error validating existing connection:", error);
          }
        }

        // No valid existing connection, start scanning
        onProgress?.({
          step: "scanning",
          progress: 30,
          message: "🔍 Scanning for device...",
        });

        // Scan for device
        let foundPeripheral: Peripheral | null = null;

        // Create a temporary scanForDevice implementation for this context
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
          let isResolved = false; // Flag to prevent double resolution

          const scanTimeout = setTimeout(() => {
            if (isResolved) return; // Already found and resolved

            BleManager.stopScan()
              .then(() => {
                if (!foundDevice && !isResolved) {
                  isResolved = true;
                  onProgress?.({
                    step: "scan_timeout",
                    progress: 0,
                    message: "❌ Device not found within timeout",
                    isError: true,
                  });
                  resolve(null);
                }
              })
              .catch(reject);
          }, defaultScanConfig.scanTimeoutSeconds * 1000);

          const handleDiscoverPeripheral = (peripheral: Peripheral) => {
            if (isResolved) return; // Already found and resolved
            if (peripheral.name !== "Gently") return;

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
                  // Mark as found immediately to prevent timeout race condition
                  foundDevice = peripheral;
                  isResolved = true;
                  clearTimeout(scanTimeout);

                  onProgress?.({
                    step: "device_found",
                    progress: 50,
                    message: `✅ Target device found: ${serialNumber}`,
                  });

                  // Resolve immediately, don't wait for stopScan
                  resolve(peripheral);

                  // Stop scan in background
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

          BleManager.scan([], defaultScanConfig.scanTimeoutSeconds, false, {
            matchMode: BleScanMatchMode.Sticky,
            scanMode: BleScanMode.LowLatency,
            callbackType: BleScanCallbackType.AllMatches,
            legacy: false,
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
          message: `❌ Connection failed: ${errorMessage}`,
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
        `🔗 [BLE Context] Starting connectToPeripheral for serial: ${serialNumber}, peripheral: ${peripheral.id}`,
      );

      const defaultConfig: Required<BLEConnectionConfig> = {
        maxRetries: 3,
        connectionTimeoutMs: 20000,
        stabilizationDelayMs: 900,
        mtuSize: 512,
        scanTimeoutSeconds: 10,
        ...config,
      };

      console.log(`⚙️ [BLE Context] Using connection config:`, defaultConfig);

      onProgress?.({
        step: "starting",
        progress: 0,
        message: "🔍 Starting connection process...",
      });

      try {
        // Start BLE manager
        await BleManager.start({ showAlert: false });

        // Check for existing connections first
        onProgress?.({
          step: "checking_existing",
          progress: 10,
          message: "📱 Checking for existing connections...",
        });

        const connectedDevices = await BleManager.getConnectedPeripherals([]);

        // Try to validate existing connections
        for (const existingPeripheral of connectedDevices) {
          const sanitizedDeviceId = existingPeripheral.id.replace(
            /[^a-zA-Z0-9._-]/g,
            "_",
          );

          try {
            const storedKey = await SecureStore.getItemAsync(
              `ble_device_${sanitizedDeviceId}`,
            );

            if (storedKey) {
              onProgress?.({
                step: "validating_existing",
                progress: 20,
                message: `🔐 Testing existing connection to ${existingPeripheral.id}...`,
              });

              // Configure for existing connection
              if (Platform.OS === "android") {
                try {
                  await BleManager.requestMTU(
                    existingPeripheral.id,
                    defaultConfig.mtuSize,
                  );
                } catch (mtuError) {
                  console.warn("MTU request failed:", mtuError);
                }
              }

              await startNotifications(existingPeripheral.id);
              console.log(
                "🔔 [BLE Context] Notifications enabled for existing connection - device will send battery, event, and time notifications",
              );

              // Validate with device status command
              const statusResponse = await sendCommand({
                peripheralId: existingPeripheral.id,
                command: createGetDeviceStatusRequest(),
                encryptionKey: storedKey,
              });

              if (statusResponse.status === ResponseStatus.OK) {
                onProgress?.({
                  step: "connection_complete",
                  progress: 100,
                  message: "✅ Existing connection validated successfully!",
                });

                setConnectedDevice({
                  id: existingPeripheral.id,
                  name: existingPeripheral.name,
                  serialNumber: serialNumber,
                  peripheral: existingPeripheral,
                });
                setEncryptionKey(storedKey);
                setConnectionState("connected");
                return;
              }
            }
          } catch (error) {
            console.warn("Error validating existing connection:", error);
          }
        }

        // No valid existing connection, connect to the provided peripheral
        onProgress?.({
          step: "connecting",
          progress: 30,
          message: "🔗 Connecting to discovered device...",
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
          message: `❌ Connection failed: ${errorMessage}`,
          isError: true,
        });
        setConnectionState("error");
        throw error;
      }
    },

    disconnectDevice: async () => {
      console.log(
        `🔌 [BLE Context] disconnectDevice called:`,
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
            `🔌 [BLE Context] Disconnecting from device: ${connectedDevice.id} (${connectedDevice.name})`,
          );
          await disconnectFromBLEDevice(connectedDevice.id);
          console.log(
            `✅ [BLE Context] Successfully disconnected from device: ${connectedDevice.id}`,
          );

          // Remove the stored encryption key
          const sanitizedDeviceId = connectedDevice.id.replace(
            /[^a-zA-Z0-9._-]/g,
            "_",
          );
          try {
            await SecureStore.deleteItemAsync(
              `ble_device_${sanitizedDeviceId}`,
            );
            console.log(
              `🗑️ [BLE Context] Removed stored encryption key for ${connectedDevice.id}`,
            );
          } catch (keyError) {
            console.warn(
              `⚠️ [BLE Context] Failed to remove encryption key for ${connectedDevice.id}:`,
              keyError,
            );
          }
        } catch (error) {
          console.warn("❌ [BLE Context] Disconnect error:", error);
        }
      } else {
        console.log(
          "ℹ️ [BLE Context] No device connected, clearing state only",
        );
      }

      console.log(
        "🧹 [BLE Context] Clearing connection state and encryption key",
      );
      setConnectedDevice(null);
      setEncryptionKey(null);
      setConnectionState("disconnected");
      console.log("✅ [BLE Context] Device disconnection complete");
    },

    scanForDevice: async (
      serialNumber: string,
      onProgress?: BLEConnectionCallback,
      config?: BLEConnectionConfig,
    ): Promise<Peripheral | null> => {
      console.log(
        `🔍 [BLE Context] scanForDevice called:`,
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
        `⚙️ [BLE Context] scanForDevice config:`,
        JSON.stringify(defaultConfig, null, 2),
      );

      return new Promise((resolve, reject) => {
        console.log(
          `⏱️ [BLE Context] Setting scan timeout for ${defaultConfig.scanTimeoutSeconds} seconds`,
        );
        const scanTimeout = setTimeout(() => {
          console.log(
            `⏰ [BLE Context] Scan timeout reached (${defaultConfig.scanTimeoutSeconds}s), stopping scan`,
          );
          BleManager.stopScan()
            .then(() => {
              console.log(`🛑 [BLE Context] Scan stopped due to timeout`);
              if (!foundDevice) {
                console.log(
                  `❌ [BLE Context] No target device found within timeout period`,
                );
                onProgress?.({
                  step: "scan_timeout",
                  progress: 0,
                  message: "❌ Device not found within timeout",
                  isError: true,
                });
                resolve(null);
              }
            })
            .catch(reject);
        }, defaultConfig.scanTimeoutSeconds * 1000);

        let foundDevice: Peripheral | null = null;

        const handleDiscoverPeripheral = (peripheral: Peripheral) => {
          if (peripheral.name !== "Gently") {
            return;
          }

          console.log(
            `🎯 [BLE Context] Found Gently device, checking serial number...`,
          );

          if (peripheral.advertising.manufacturerRawData) {
            try {
              console.log(
                `🔍 [BLE Context] Processing advertisement data for device: ${peripheral.id}`,
              );
              const adData = extractAndDecryptAdvertisementData(
                peripheral.advertising.manufacturerRawData,
              );

              console.log(
                `📊 [BLE Context] Advertisement data:`,
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
                  `🎉 [BLE Context] Target device found! Serial: ${adData.serialNumber}, Device: ${peripheral.id}`,
                );

                onProgress?.({
                  step: "device_found",
                  progress: 50,
                  message: `✅ Target device found: ${serialNumber}`,
                });

                foundDevice = peripheral;
                clearTimeout(scanTimeout);

                console.log(
                  `🛑 [BLE Context] Stopping scan after finding target device`,
                );
                BleManager.stopScan()
                  .then(() => {
                    console.log(
                      `✅ [BLE Context] Scan stopped successfully, resolving with device`,
                    );
                    resolve(peripheral);
                  })
                  .catch(reject);
              } else {
                console.log(
                  `❌ [BLE Context] Serial number mismatch - looking for: ${serialNumber}, found: ${adData?.serialNumber ?? "none"}`,
                );
              }
            } catch (error) {
              console.warn(
                "❌ [BLE Context] Error processing advertisement data:",
                error,
              );
            }
          } else {
            console.log(
              `⚠️ [BLE Context] No manufacturer data found for device: ${peripheral.id}`,
            );
          }
        };

        // Start scanning
        console.log(`📡 [BLE Context] Setting up peripheral discovery handler`);
        BleManager.onDiscoverPeripheral(handleDiscoverPeripheral);

        console.log(
          `🚀 [BLE Context] Starting BLE scan with parameters:`,
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

        BleManager.scan([], defaultConfig.scanTimeoutSeconds, false, {
          matchMode: BleScanMatchMode.Sticky,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
          legacy: false,
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
      console.log(
        `🔍 [BLE Context] Starting scanForDevices with timeout: ${timeoutSeconds}s`,
      );

      return new Promise((resolve, reject) => {
        let gentlyDevicesFound = 0;

        const scanTimeout = setTimeout(() => {
          console.log(
            `⏰ [BLE Context] Scan timeout reached after ${timeoutSeconds}s`,
          );
          BleManager.stopScan()
            .then(() => {
              console.log(
                `✅ [BLE Context] Device scan completed after ${timeoutSeconds}s, found ${gentlyDevicesFound} Gently devices`,
              );
              resolve();
            })
            .catch((error) => {
              console.error(`❌ [BLE Context] Error stopping scan:`, error);
              reject(error instanceof Error ? error : new Error(String(error)));
            });
        }, timeoutSeconds * 1000);

        const handleDiscoverPeripheral = (peripheral: Peripheral) => {
          // Only process and return Gently devices
          if (peripheral.name === "Gently") {
            gentlyDevicesFound++;
            console.log(
              `🎯 [BLE Context] Gently device discovered: ${peripheral.id} (${gentlyDevicesFound} total)`,
            );

            try {
              if (peripheral.advertising.manufacturerRawData) {
                const adData = extractAndDecryptAdvertisementData(
                  peripheral.advertising.manufacturerRawData,
                );
                if (adData) {
                  console.log(
                    `✅ [BLE Context] Successfully decrypted advertisement data:`,
                    adData,
                  );
                } else {
                  console.warn(
                    `⚠️ [BLE Context] Failed to decrypt advertisement data for Gently device ${peripheral.id}`,
                  );
                }
                onDeviceFound(peripheral, adData);
              } else {
                console.log(
                  `📡 [BLE Context] No manufacturer data for Gently device ${peripheral.id}, calling onDeviceFound anyway`,
                );
                onDeviceFound(peripheral);
              }
            } catch (error) {
              console.error(
                `❌ [BLE Context] Error processing Gently device ${peripheral.id}:`,
                error,
              );
              onDeviceFound(peripheral);
            }
          }
          // Non-Gently devices are completely ignored - not passed to onDeviceFound
        };

        // Start scanning
        console.log(`🚀 [BLE Context] Starting BLE scan with settings:`, {
          timeout: timeoutSeconds,
          matchMode: BleScanMatchMode.Sticky,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
          legacy: false,
        });

        console.log(`👂 [BLE Context] Setting up discovery listener`);
        BleManager.onDiscoverPeripheral(handleDiscoverPeripheral);

        console.log(`📡 [BLE Context] Initiating BLE scan...`);
        BleManager.scan([], timeoutSeconds, false, {
          matchMode: BleScanMatchMode.Sticky,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
          legacy: false,
        })
          .then(() => {
            console.log(`✅ [BLE Context] BLE scan initiated successfully`);
          })
          .catch((error) => {
            console.error(`❌ [BLE Context] Failed to start BLE scan:`, error);
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
      message: "🔗 Connecting to device...",
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
      onProgress?.({
        step: "connecting",
        progress: 60 + (attempt - 1) * 10,
        message: `🔗 Connection attempt ${attempt}/${config.maxRetries}...`,
      });

      try {
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

        // Stabilization delay
        await new Promise((resolve) =>
          setTimeout(resolve, config.stabilizationDelayMs),
        );

        // Verify connection
        const isNowConnected = await BleManager.isPeripheralConnected(
          peripheral.id,
        );
        if (!isNowConnected) {
          throw new Error("Connection verification failed");
        }

        // Configure MTU for Android
        if (Platform.OS === "android") {
          try {
            await BleManager.requestMTU(peripheral.id, config.mtuSize);
          } catch (mtuError) {
            console.warn("MTU configuration failed:", mtuError);
          }
        }

        // Retrieve services and start notifications
        await BleManager.retrieveServices(peripheral.id);
        await startNotifications(peripheral.id);
        console.log(
          "🔔 [BLE Context] Notifications enabled for new connection - device will send battery, event, and time notifications",
        );

        connected = true;

        onProgress?.({
          step: "generating_key",
          progress: 80,
          message: "🔐 Generating encryption key...",
        });
      } catch (attemptError) {
        lastError =
          attemptError instanceof Error
            ? attemptError
            : new Error(String(attemptError));

        if (attempt < config.maxRetries) {
          const retryDelay = 2000;
          onProgress?.({
            step: "retrying",
            progress: 60 + (attempt - 1) * 10,
            message: `⏳ Attempt ${attempt} failed, retrying in ${retryDelay / 1000}s...`,
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
      message: "📋 Validating connection...",
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

    // Store the encryption key
    const sanitizedDeviceId = peripheral.id.replace(/[^a-zA-Z0-9._-]/g, "_");
    await SecureStore.setItemAsync(
      `ble_device_${sanitizedDeviceId}`,
      foundEncryptionKey,
    );

    // Update context state
    setConnectedDevice({
      id: peripheral.id,
      name: peripheral.name,
      serialNumber: serialNumber,
      peripheral: peripheral,
    });
    setEncryptionKey(foundEncryptionKey);
    setConnectionState("connected");

    onProgress?.({
      step: "connection_complete",
      progress: 100,
      message: "🎉 Device connected successfully!",
    });
  };

  return (
    <BLEContext.Provider value={contextValue}>{children}</BLEContext.Provider>
  );
}
