/**
 * BLE Connection Module for Gently Bracelets
 * Handles device connection, pairing, and encryption key management
 */

import type {
  BleError,
  Device,
  Subscription,
} from "@b1naryth1ef/react-native-ble-plx";
import { Platform } from "react-native";
import { BleManager } from "@b1naryth1ef/react-native-ble-plx";

import type {
  BLECommandRequest,
  BLECommandResponse,
  ConnectionState,
  DeviceInfo,
} from "./types";
import { base64ToUint8Array, uint8ArrayToBase64 } from "../../utils/base64";
import { generateDynamicKey, TEAEncryption } from "./encryption";
import { findGentlyDeviceBySerial, requestBlePermissions } from "./scanner";
import { getDeviceKeyBySerial, storeDeviceKey } from "./storage";
import {
  API_VERSION,
  BLE_REQUEST_CHARACTERISTIC_UUID,
  BLE_RESPONSE_CHARACTERISTIC_UUID,
  BLE_SERVICE_UUID,
  CommandCode,
  FACTORY_BRACELET_KEY,
  ResponseStatus,
} from "./types";

export interface BLEConnectionOptions {
  timeoutMs?: number;
}

// Singleton BLE Manager - shared with scanner
let bleManager: BleManager | null = null;

/**
 * Get or create BLE manager instance
 */
function getBleManager(): BleManager {
  bleManager ??= new BleManager();
  return bleManager;
}

function formatCommandLabel(command?: CommandCode | number): string {
  if (command === undefined) {
    return "Unknown Command";
  }

  const numericValue = Number(command);
  const hex = `0x${numericValue.toString(16).toUpperCase().padStart(2, "0")}`;
  const name = (CommandCode as Record<number, string>)[numericValue];

  return name ? `${name} (${hex})` : hex;
}

function formatStatusLabel(status: ResponseStatus): string {
  const label = (ResponseStatus as unknown as Record<number, string>)[status];
  const hex = `0x${status.toString(16).toUpperCase().padStart(2, "0")}`;
  return label ? `${label} (${hex})` : hex;
}

function formatPayloadPreview(payload: Uint8Array, maxBytes = 16): string {
  if (payload.length === 0) {
    return "—";
  }

  const bytes = Array.from(payload.slice(0, maxBytes))
    .map((byte) => `0x${byte.toString(16).padStart(2, "0")}`)
    .join(" ");

  return payload.length > maxBytes ? `${bytes} …` : bytes;
}

function formatByteArray(payload: Uint8Array): string {
  if (payload.length === 0) {
    return "—";
  }

  return Array.from(payload)
    .map((byte) => `0x${byte.toString(16).padStart(2, "0")}`)
    .join(" ");
}

function isGattStatus133(error: unknown): boolean {
  const bleError = error as BleError | undefined;
  const errorCodeRaw = bleError?.errorCode;
  const errorCode =
    typeof errorCodeRaw === "number"
      ? errorCodeRaw
      : typeof errorCodeRaw === "string"
        ? Number.parseInt(errorCodeRaw, 10)
        : null;
  if (errorCode === 133 || errorCode === 0x85) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!message) {
    return false;
  }

  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("status 133") ||
    lowerMessage.includes("status 0x85") ||
    lowerMessage.includes("gatt_error")
  );
}

interface NotificationMonitorEntry {
  subscription: Subscription;
  deviceId: string;
  encryptionKey: string;
  transactionId: string;
  removed?: boolean;
}

const asyncNotificationMonitors = new Map<string, NotificationMonitorEntry>();

function safelyRemoveNotificationMonitor(
  serialNumber: string,
  entry: NotificationMonitorEntry,
  context: "teardown" | "refresh" | "error",
): void {
  if (entry.removed) {
    return;
  }

  entry.removed = true;

  try {
    entry.subscription.remove();
    console.log(
      `🔕 Removed async notification monitor (${context}) for ${serialNumber}`,
      {
        transactionId: entry.transactionId,
      },
    );
  } catch (error) {
    console.warn("⚠️ Failed to remove async notification monitor", {
      serialNumber,
      transactionId: entry.transactionId,
      context,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

const BATTERY_LEVEL_LABELS = ["CRITICAL", "LOW", "MEDIUM", "GOOD", "FULL"];

const EVENT_STATE_LABELS: Record<number, string> = {
  0x00: "OFF",
  0x01: "ON (inactive)",
  0x02: "ON (vibrating)",
  0x03: "ON (retrigger delay)",
  0x04: "ON (snooze)",
};

/**
 * Get currently connected Gently devices
 */
async function getConnectedGentlyDevices(): Promise<Device[]> {
  try {
    const manager = getBleManager();
    const connectedDevices = await manager.connectedDevices([BLE_SERVICE_UUID]);

    if (connectedDevices.length === 0) {
      console.log("📱 No connected devices reported by BLE manager");
      return [];
    }

    connectedDevices.forEach((device) => {
      if (device.localName !== "Gently" && device.name !== "Gently") {
        console.log("🕵️ Detected connected device without expected name", {
          deviceId: device.id,
          localName: device.localName,
          name: device.name,
        });
      }
    });

    console.log(`📱 Found ${connectedDevices.length} connected device(s)`);
    return connectedDevices;
  } catch (error) {
    console.error("❌ Failed to get connected devices:", error);
    return [];
  }
}

/**
 * Find connected device by serial number
 */
async function findConnectedDeviceBySerial(
  serialNumber: string,
): Promise<Device | null> {
  try {
    const manager = getBleManager();

    const storedKey = await getDeviceKeyBySerial(serialNumber);
    if (storedKey?.deviceId) {
      try {
        const [storedDevice] = await manager.devices([storedKey.deviceId]);
        if (storedDevice) {
          const isConnected = await storedDevice.isConnected();
          if (isConnected) {
            console.log(
              `✅ Found connected device ${storedDevice.id} for serial ${serialNumber} via stored device ID`,
            );
            return storedDevice;
          }
        }
      } catch (lookupError) {
        console.warn(
          `⚠️ Failed to resolve stored device ${storedKey.deviceId} for serial ${serialNumber}:`,
          lookupError,
        );
      }
    }

    const connectedDevices = await getConnectedGentlyDevices();

    // We need to check each connected device to see if it matches our serial
    // This would require querying device info or checking stored mappings
    for (const device of connectedDevices) {
      // Check if we have this device stored with the serial number
      const storedKey = await getDeviceKeyBySerial(serialNumber);
      if (storedKey && storedKey.deviceId === device.id) {
        console.log(
          `✅ Found connected device ${device.id} for serial ${serialNumber}`,
        );
        return device;
      }
    }

    console.log(`❌ No connected device found for serial ${serialNumber}`);
    return null;
  } catch (error) {
    console.error("❌ Error finding connected device:", error);
    return null;
  }
}

function buildCommandRequestPayload(
  command: CommandCode,
  payload?: Uint8Array,
  apiVersion: number = API_VERSION,
): Uint8Array {
  const payloadLength = payload?.length ?? 0;
  const baseLength = 2 + payloadLength; // API + command + payload
  const paddedLength = Math.max(8, Math.ceil(baseLength / 8) * 8);

  const buffer = new Uint8Array(paddedLength);
  buffer[0] = apiVersion;
  buffer[1] = command;

  if (payloadLength > 0 && payload) {
    buffer.set(payload, 2);
  }

  return buffer;
}

function parseCommandResponse(data: Uint8Array): BLECommandResponse {
  if (data.length < 3) {
    throw new Error("Invalid BLE response payload");
  }

  const apiVersion = data[0] ?? 0;
  const commandCode = data[1] as CommandCode;
  const status = (data[2] ?? 0) as ResponseStatus;
  const payload = data.length > 3 ? data.slice(3) : new Uint8Array(0);

  return {
    apiVersion,
    commandCode,
    status,
    payload,
  };
}

function teardownAsyncNotificationMonitor(serialNumber: string): void {
  const existing = asyncNotificationMonitors.get(serialNumber);
  if (!existing) {
    return;
  }

  safelyRemoveNotificationMonitor(serialNumber, existing, "teardown");
  asyncNotificationMonitors.delete(serialNumber);
  console.log(`🔕 Stopped async notification monitor for ${serialNumber}`);
}

function handleBatteryStatusNotification(
  serialNumber: string,
  payload: Uint8Array,
): void {
  if (payload.length < 3) {
    console.warn("⚠️ Battery notify payload too short", {
      serialNumber,
      payload: formatByteArray(payload),
    });
    return;
  }

  const batteryVoltage = (payload[0] ?? 0) | ((payload[1] ?? 0) << 8);
  const statusByte = payload[2] ?? 0;
  const charging = (statusByte & 0x01) === 0x01;
  const rawLevel = (statusByte >> 1) & 0x7f;
  const levelIndex = Math.min(rawLevel, BATTERY_LEVEL_LABELS.length - 1);
  const reservedBytes = payload.slice(3);

  console.log(`\n🔔 Battery status notify for ${serialNumber}`);
  console.log(`   • Voltage     : ${batteryVoltage} mV`);
  console.log(
    `   • Level       : ${levelIndex}/4 (${BATTERY_LEVEL_LABELS[levelIndex] ?? "UNKNOWN"}) [raw: ${rawLevel}]`,
  );
  console.log(`   • Charging    : ${charging ? "Yes" : "No"}`);
  if (reservedBytes.length > 0) {
    console.log(`   • Reserved    : ${formatByteArray(reservedBytes)}`);
  }
  console.log(`   • Raw Bytes   : ${formatByteArray(payload)}`);
}

function handleActiveEventNotification(
  serialNumber: string,
  payload: Uint8Array,
): void {
  if (payload.length < 2) {
    console.warn("⚠️ Active event notify payload too short", {
      serialNumber,
      payload: formatByteArray(payload),
    });
    return;
  }

  const eventIndex = payload[0] ?? 0;
  const state = payload[1] ?? 0;
  const stateLabel = EVENT_STATE_LABELS[state] ?? "RESERVED";
  const reservedBytes = payload.slice(2);

  console.log(`\n🔔 Active event notify for ${serialNumber}`);
  console.log(`   • Event Index : ${eventIndex}`);
  console.log(
    `   • State       : ${stateLabel} (0x${state.toString(16).toUpperCase().padStart(2, "0")})`,
  );
  if (reservedBytes.length > 0) {
    console.log(`   • Reserved    : ${formatByteArray(reservedBytes)}`);
  }
  console.log(`   • Raw Bytes   : ${formatByteArray(payload)}`);
}

function bcdToDecimal(value: number): number {
  return ((value >> 4) & 0x0f) * 10 + (value & 0x0f);
}

function handleTimeNotification(
  serialNumber: string,
  payload: Uint8Array,
): void {
  if (payload.length < 7) {
    console.warn("⚠️ Time notify payload too short", {
      serialNumber,
      payload: formatByteArray(payload),
    });
    return;
  }

  const year = 2000 + bcdToDecimal(payload[0] ?? 0);
  const month = bcdToDecimal(payload[1] ?? 0);
  const day = bcdToDecimal(payload[2] ?? 0);
  const weekDay = payload[3] ?? 0;
  const hour = bcdToDecimal(payload[4] ?? 0);
  const minute = bcdToDecimal(payload[5] ?? 0);
  const seconds = bcdToDecimal(payload[6] ?? 0);
  const reservedBytes = payload.slice(7);

  const date = new Date(
    year,
    Math.max(0, month - 1),
    day,
    hour,
    minute,
    seconds,
  );
  const weekDayLabel =
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekDay] ?? "Unknown";

  console.log(`\n🔔 Time notify for ${serialNumber}`);
  console.log(`   • ISO Time    : ${date.toISOString()}`);
  console.log(`   • Local Time  : ${date.toLocaleString()}`);
  console.log(
    `   • Components : ${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")} (${weekDayLabel}) ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
  );
  if (reservedBytes.length > 0) {
    console.log(`   • Reserved    : ${formatByteArray(reservedBytes)}`);
  }
  console.log(`   • Raw Bytes   : ${formatByteArray(payload)}`);
}

function handleAsyncNotification(
  serialNumber: string,
  response: BLECommandResponse,
): void {
  switch (response.commandCode) {
    case CommandCode.BATTERY_STATUS_NOTIFY:
      handleBatteryStatusNotification(serialNumber, response.payload);
      break;
    case CommandCode.ACTIVE_EVENT_NOTIFY:
      handleActiveEventNotification(serialNumber, response.payload);
      break;
    case CommandCode.TIME_NOTIFY:
      handleTimeNotification(serialNumber, response.payload);
      break;
    default:
      break;
  }
}

function ensureAsyncNotificationMonitor(
  serialNumber: string,
  device: Device,
  encryptionKey: string,
): void {
  const current = asyncNotificationMonitors.get(serialNumber);
  if (
    current &&
    current.deviceId === device.id &&
    current.encryptionKey === encryptionKey
  ) {
    return;
  }

  if (current) {
    safelyRemoveNotificationMonitor(serialNumber, current, "refresh");
    asyncNotificationMonitors.delete(serialNumber);
  }

  const manager = getBleManager();
  const tea = new TEAEncryption(encryptionKey);
  const transactionId = `async-monitor-${device.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const subscription = manager.monitorCharacteristicForDevice(
      device.id,
      BLE_SERVICE_UUID,
      BLE_RESPONSE_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          const bleError = error as BleError | undefined;
          console.error("📡 Async notification error", {
            serialNumber,
            deviceId: device.id,
            message: error instanceof Error ? error.message : String(error),
            errorCode: bleError?.errorCode,
            attErrorCode: bleError?.attErrorCode,
            iosErrorCode: bleError?.iosErrorCode,
            androidErrorCode: bleError?.androidErrorCode,
            reason: bleError?.reason,
          });

          const monitorEntry = asyncNotificationMonitors.get(serialNumber);
          if (
            monitorEntry &&
            monitorEntry.transactionId === transactionId &&
            !monitorEntry.removed
          ) {
            safelyRemoveNotificationMonitor(
              serialNumber,
              monitorEntry,
              "error",
            );
            asyncNotificationMonitors.delete(serialNumber);
          }
          return;
        }

        const value = characteristic?.value ?? null;
        if (!value) {
          return;
        }

        let decrypted: Uint8Array;
        try {
          decrypted = tea.decryptData(base64ToUint8Array(value));
        } catch (decryptError) {
          console.error("🔐 Failed to decrypt async notification", {
            serialNumber,
            deviceId: device.id,
            message:
              decryptError instanceof Error
                ? decryptError.message
                : String(decryptError),
          });
          return;
        }

        let response: BLECommandResponse;
        try {
          response = parseCommandResponse(decrypted);
        } catch (parseError) {
          console.error("🧩 Failed to parse async notification", {
            serialNumber,
            deviceId: device.id,
            message:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
            decrypted: formatByteArray(decrypted),
          });
          return;
        }

        if (
          response.commandCode === CommandCode.BATTERY_STATUS_NOTIFY ||
          response.commandCode === CommandCode.ACTIVE_EVENT_NOTIFY ||
          response.commandCode === CommandCode.TIME_NOTIFY
        ) {
          handleAsyncNotification(serialNumber, response);
        }
      },
      transactionId,
    );

    asyncNotificationMonitors.set(serialNumber, {
      subscription,
      deviceId: device.id,
      encryptionKey,
      transactionId,
      removed: false,
    });

    console.log(`🛰️ Subscribed to async notifications for ${serialNumber}`);
  } catch (error) {
    console.error("❌ Failed to subscribe to async notifications", {
      serialNumber,
      deviceId: device.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function sendEncryptedCommand(
  deviceId: string,
  encryptionKey: string,
  request: BLECommandRequest,
  timeoutMs: number,
): Promise<BLECommandResponse> {
  let command: CommandCode | undefined = request.command as
    | CommandCode
    | undefined;
  if (command === undefined && request.commandCode !== undefined) {
    command = request.commandCode;
  }
  if (command === undefined) {
    throw new Error("BLE command request is missing a command code");
  }

  const manager = getBleManager();
  const tea = new TEAEncryption(encryptionKey);
  const transactionId = `ble-command-${deviceId}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

  const payload = buildCommandRequestPayload(
    command,
    request.payload,
    request.apiVersion ?? API_VERSION,
  );
  const commandValue = command as number;
  const commandHex = `0x${commandValue.toString(16).toUpperCase().padStart(2, "0")}`;
  const commandLogValue = commandHex;
  const payloadHex = Array.from(payload).map(
    (byte) => `0x${byte.toString(16).padStart(2, "0")}`,
  );
  const encryptedPayload = tea.encryptData(payload);
  const base64Payload = uint8ArrayToBase64(encryptedPayload);
  const encryptionKeyPreview = `${encryptionKey.slice(0, 8).toUpperCase()}…`;

  console.log("🚀 Sending BLE command", {
    deviceId,
    command: commandLogValue,
    transactionId,
    timeoutMs,
    payloadLength: payload.length,
    payloadHex,
    encryptionKeyPreview,
  });

  let cleanup: (() => void) | undefined;

  const responsePromise = new Promise<BLECommandResponse>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let subscription: Subscription | null = null;
    const commandLabel =
      (CommandCode as Record<number, string>)[command as number] ??
      String(command);

    const clearResources = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      subscription?.remove();
      subscription = null;
    };

    cleanup = clearResources;

    const resolveWithResponse = (response: BLECommandResponse) => {
      if (timeoutId === null) {
        return;
      }
      clearResources();
      console.log("✅ BLE command resolved", {
        deviceId,
        command: commandLogValue,
        status: response.status,
        payloadLength: response.payload.length,
      });
      resolve(response);
    };

    const rejectWithError = (error: Error) => {
      if (timeoutId === null) {
        return;
      }
      clearResources();
      reject(error);
    };

    timeoutId = setTimeout(() => {
      console.error("⌛️ BLE command timeout triggered", {
        deviceId,
        command: commandLogValue,
        transactionId,
        timeoutMs,
      });
      rejectWithError(
        new Error(`BLE command ${commandLabel} timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    try {
      subscription = manager.monitorCharacteristicForDevice(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_RESPONSE_CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (timeoutId === null) {
            return;
          }

          if (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            const bleError = error as BleError | undefined;
            console.error("📡 BLE notification error", {
              deviceId,
              command: commandLogValue,
              transactionId,
              message,
              errorCode: bleError?.errorCode,
              attErrorCode: bleError?.attErrorCode,
              iosErrorCode: bleError?.iosErrorCode,
              androidErrorCode: bleError?.androidErrorCode,
              reason: bleError?.reason,
            });
            const reasonSuffix = bleError?.reason
              ? ` (reason: ${bleError.reason})`
              : "";
            rejectWithError(
              new Error(`BLE notification failed: ${message}${reasonSuffix}`),
            );
            return;
          }

          if (!characteristic) {
            console.warn(
              "⚠️ BLE notification callback without characteristic",
              {
                deviceId,
                command: commandLogValue,
                transactionId,
              },
            );
            return;
          }

          const value = characteristic.value ?? null;
          console.log("🔔 BLE notification received", {
            deviceId,
            command: commandLogValue,
            transactionId,
            hasValue: Boolean(value),
            valuePreview:
              value && value.length > 32 ? `${value.slice(0, 32)}…` : value,
          });

          if (!value) {
            console.log("⏳ BLE notification had no value yet", {
              deviceId,
              command: commandLogValue,
              transactionId,
            });
            return;
          }

          const encryptedResponse = base64ToUint8Array(value);
          const decryptedResponse = tea.decryptData(encryptedResponse);
          console.log("🔓 Decrypted BLE response", {
            deviceId,
            command: commandLogValue,
            transactionId,
            decryptedLength: decryptedResponse.length,
          });
          const response = parseCommandResponse(decryptedResponse);

          if (response.commandCode !== command) {
            console.debug("🔁 Received response for different command", {
              expected: command,
              received: response.commandCode,
              transactionId,
            });
            return;
          }

          resolveWithResponse(response);
        },
        `${transactionId}-monitor`,
      );
      console.log("🛎️ Listening for BLE response notifications", {
        deviceId,
        command: commandLogValue,
        transactionId,
      });
    } catch (monitorError) {
      const message =
        monitorError instanceof Error
          ? monitorError.message
          : String(monitorError);
      const bleError = monitorError as BleError | undefined;
      console.error("❌ Failed to monitor BLE response characteristic", {
        deviceId,
        command: commandLogValue,
        transactionId,
        message,
        errorCode: bleError?.errorCode,
        attErrorCode: bleError?.attErrorCode,
        iosErrorCode: bleError?.iosErrorCode,
        androidErrorCode: bleError?.androidErrorCode,
        reason: bleError?.reason,
      });
      rejectWithError(
        new Error(
          `BLE notification subscription failed: ${message}${bleError?.reason ? ` (reason: ${bleError.reason})` : ""}`,
        ),
      );
    }
  });

  try {
    await manager.writeCharacteristicWithResponseForDevice(
      deviceId,
      BLE_SERVICE_UUID,
      BLE_REQUEST_CHARACTERISTIC_UUID,
      base64Payload,
      transactionId,
    );
    console.log("✍️ Wrote BLE request characteristic", {
      deviceId,
      command: commandLogValue,
      transactionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const bleError = error as BleError | undefined;
    console.error("💥 BLE write failed", {
      deviceId,
      command: commandLogValue,
      transactionId,
      message,
      errorCode: bleError?.errorCode,
      attErrorCode: bleError?.attErrorCode,
      iosErrorCode: bleError?.iosErrorCode,
      androidErrorCode: bleError?.androidErrorCode,
      reason: bleError?.reason,
    });
    cleanup?.();
    throw new Error(
      `BLE write failed: ${message}${bleError?.reason ? ` (reason: ${bleError.reason})` : ""}`,
    );
  }

  return await responsePromise;
}

/**
 * Execute BLE command with proper encryption and response handling
 */
async function executeBLECommand(
  request: BLECommandRequest,
  serialNumber: string,
): Promise<BLECommandResponse> {
  let device = await findConnectedDeviceBySerial(serialNumber);
  if (!device) {
    console.warn(
      `🔄 Device ${serialNumber} not currently connected; attempting reconnection`,
    );
    try {
      const deviceInfo = await connectBySerialNumber(serialNumber);
      const reconnectedDevice = deviceInfo.device ?? null;
      if (!reconnectedDevice) {
        throw new Error("Reconnection did not return a device instance");
      }
      device = reconnectedDevice;
      console.log("🔁 Reconnected to device", {
        serialNumber,
        deviceId: device.id,
      });
    } catch (reconnectError) {
      console.error("❌ Reconnection attempt failed", {
        serialNumber,
        message:
          reconnectError instanceof Error
            ? reconnectError.message
            : String(reconnectError),
      });
      throw new Error(`Device with serial ${serialNumber} is not connected`);
    }
  }

  const storedKey = await getDeviceKeyBySerial(serialNumber);
  if (!storedKey) {
    throw new Error(`No encryption key found for device ${serialNumber}`);
  }

  const encryptionKey = storedKey.dynamicKey ?? storedKey.customEncryptionKey;
  if (!encryptionKey) {
    throw new Error(`No valid encryption key available for ${serialNumber}`);
  }

  ensureAsyncNotificationMonitor(serialNumber, device, encryptionKey);

  const requestWithTimeout = request as BLECommandRequest & {
    timeoutMs?: number;
  };
  const timeout =
    typeof requestWithTimeout.timeoutMs === "number"
      ? requestWithTimeout.timeoutMs
      : 10000;
  const response = await sendEncryptedCommand(
    device.id,
    encryptionKey,
    request,
    timeout,
  );

  const commandLabel = formatCommandLabel(response.commandCode);
  const statusLabel = formatStatusLabel(response.status);
  const payloadPreview = formatPayloadPreview(response.payload);
  const byteLabel = response.payload.length === 1 ? "byte" : "bytes";

  console.log(`\n🔚 ${commandLabel} response for ${serialNumber}`);
  console.log(`   • Status : ${statusLabel}`);
  console.log(`   • Payload: ${response.payload.length} ${byteLabel}`);
  if (response.payload.length > 0) {
    console.log(`   • Bytes  : ${payloadPreview}`);
  }

  return response;
}

async function executeBLECommandWithKey(
  request: BLECommandRequest,
  device: Device,
  encryptionKey: string,
  timeoutMs = 10000,
): Promise<BLECommandResponse> {
  if (!encryptionKey) {
    throw new Error("Encryption key is required to execute BLE command");
  }

  return await sendEncryptedCommand(
    device.id,
    encryptionKey,
    request,
    timeoutMs,
  );
}

async function getConnectionState(
  serialNumber: string,
): Promise<ConnectionState> {
  try {
    const device = await findConnectedDeviceBySerial(serialNumber);
    if (!device) {
      return {
        isConnected: false,
        deviceId: undefined,
        serialNumber,
        hasCustomKey: false,
      };
    }

    return {
      isConnected: true,
      deviceId: device.id,
      serialNumber,
      hasCustomKey: false,
    };
  } catch (error) {
    console.error("❌ Failed to get connection state:", error);
    return {
      isConnected: false,
      deviceId: undefined,
      serialNumber,
      hasCustomKey: false,
    };
  }
}

/**
 * Main function to connect to a bracelet by serial number
 * Implements 3-step logic: check existing connection, pair if needed, scan and connect if not connected
 */
async function connectBySerialNumber(
  serialNumber: string,
): Promise<DeviceInfo> {
  try {
    console.log(`🔗 Starting connection process for serial: ${serialNumber}`);

    // Request permissions first
    await requestBlePermissions();

    // STEP 1: Check if we're already connected to this device
    const existingDevice = await findConnectedDeviceBySerial(serialNumber);
    if (existingDevice) {
      console.log(`✅ Already connected to device ${serialNumber}`);
      console.log(
        "🔁 Refreshing session key using factory bracelet key for current connection",
      );
      return await performPairing(existingDevice, serialNumber);
    }

    // STEP 2: If not connected, scan for the device
    console.log("📡 Device not connected, scanning...");
    const discoveredDevice = await findGentlyDeviceBySerial(serialNumber);

    if (!discoveredDevice) {
      throw new Error(
        `Device with serial ${serialNumber} not found during scan`,
      );
    }

    // STEP 3: Connect to the discovered device
    console.log(`🔌 Connecting to device ${serialNumber}...`);
    const manager = getBleManager();
    let device = await manager.connectToDevice(discoveredDevice.device.id);

    if (Platform.OS === "android") {
      try {
        const requestedMtu = 512;
        device = await device.requestMTU(requestedMtu);
        console.log("📏 Requested MTU", {
          serialNumber,
          requestedMtu,
          negotiatedMtu: device.mtu,
        });
      } catch (mtuError) {
        console.warn("⚠️ Failed to request MTU", {
          serialNumber,
          requestedMtu: 512,
          message:
            mtuError instanceof Error ? mtuError.message : String(mtuError),
        });
      }
    }

    await device.discoverAllServicesAndCharacteristics();

    console.log(`✅ Connected to device ${serialNumber}`);

    // Perform pairing to establish encryption keys
    return await performPairing(device, serialNumber);
  } catch (error) {
    console.error(`❌ Connection failed for ${serialNumber}:`, error);
    throw error;
  }
}

/**
 * Perform pairing process to establish encryption keys
 */
async function performPairing(
  device: Device,
  serialNumber: string,
): Promise<DeviceInfo> {
  try {
    console.log(`🤝 Starting pairing process for ${serialNumber}`);

    const storedKey = await getDeviceKeyBySerial(serialNumber);
    if (storedKey && storedKey.customEncryptionKey !== FACTORY_BRACELET_KEY) {
      console.log(
        "⚠️ Stored custom bracelet key detected; reverting to factory key for pairing.",
      );
    }

    const manager = getBleManager();
    const braceletKey = FACTORY_BRACELET_KEY;

    let activeDevice = device;
    let uptimeResponse: BLECommandResponse | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      console.log("⏰ Getting device uptime for dynamic key generation...", {
        serialNumber,
        deviceId: activeDevice.id,
        attempt: attempt + 1,
      });

      try {
        uptimeResponse = await executeBLECommandWithKey(
          {
            command: CommandCode.GET_UPTIME,
            apiVersion: API_VERSION,
          },
          activeDevice,
          braceletKey,
        );
        break;
      } catch (error) {
        lastError = error;
        if (!isGattStatus133(error) || attempt === 1) {
          throw error;
        }

        console.warn(
          "⚠️ GET_UPTIME failed due to GATT 133, attempting reconnection",
          {
            serialNumber,
            deviceId: activeDevice.id,
          },
        );

        try {
          await manager.cancelDeviceConnection(activeDevice.id);
        } catch (cancelError) {
          console.warn("⚠️ Failed to cancel device connection before retry", {
            serialNumber,
            deviceId: activeDevice.id,
            message:
              cancelError instanceof Error
                ? cancelError.message
                : String(cancelError),
          });
        }

        try {
          let reconnectedDevice = await manager.connectToDevice(
            activeDevice.id,
          );

          if (Platform.OS === "android") {
            try {
              const requestedMtu = 512;
              reconnectedDevice =
                await reconnectedDevice.requestMTU(requestedMtu);
              console.log("📏 Requested MTU after reconnect", {
                serialNumber,
                requestedMtu,
                negotiatedMtu: reconnectedDevice.mtu,
              });
            } catch (mtuError) {
              console.warn("⚠️ Failed to request MTU after reconnect", {
                serialNumber,
                requestedMtu: 512,
                message:
                  mtuError instanceof Error
                    ? mtuError.message
                    : String(mtuError),
              });
            }
          }

          await reconnectedDevice.discoverAllServicesAndCharacteristics();
          activeDevice = reconnectedDevice;
          console.log("🔁 Re-established connection after GATT 133", {
            serialNumber,
            deviceId: activeDevice.id,
          });
        } catch (reconnectError) {
          console.error("❌ Reconnect after GATT 133 failed", {
            serialNumber,
            deviceId: activeDevice.id,
            message:
              reconnectError instanceof Error
                ? reconnectError.message
                : String(reconnectError),
          });
          throw reconnectError instanceof Error
            ? reconnectError
            : new Error(String(reconnectError));
        }
      }
    }

    if (!uptimeResponse) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Failed to retrieve uptime from device");
    }

    if (uptimeResponse.payload.length < 8) {
      throw new Error("Invalid uptime response: payload too short");
    }

    // Extract uptime bytes from response payload
    const uptimeBytes = uptimeResponse.payload.slice(0, 8);
    console.log(
      "⏰ Got device uptime bytes:",
      Array.from(uptimeBytes)
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(" "),
    );

    // Generate dynamic key using real uptime data
    const dynamicKey = generateDynamicKey(
      braceletKey,
      uptimeBytes,
      serialNumber,
    );
    console.log("🔑 Generated dynamic key for session using real uptime");

    console.log(
      "🔐 Using session dynamic key derived from uptime without updating bracelet storage",
    );

    // Store device information
    await storeDeviceKey({
      serialNumber,
      deviceId: activeDevice.id,
      customEncryptionKey: braceletKey,
      dynamicKey: dynamicKey,
      lastConnected: Date.now(),
      apiVersion: API_VERSION,
      createdAt: Date.now(),
    });

    ensureAsyncNotificationMonitor(serialNumber, activeDevice, dynamicKey);

    console.log(`✅ Pairing complete for ${serialNumber}`);

    return {
      device: activeDevice,
      serialNumber,
      braceletKey: FACTORY_BRACELET_KEY,
      dynamicKey,
      isConnected: true,
    };
  } catch (error) {
    console.error(`❌ Pairing failed for ${serialNumber}:`, error);
    throw error;
  }
}

/**
 * Disconnect from device by serial number
 */
async function disconnectDevice(serialNumber: string): Promise<void> {
  try {
    const device = await findConnectedDeviceBySerial(serialNumber);
    if (device) {
      const manager = getBleManager();
      await manager.cancelDeviceConnection(device.id);
      console.log(`🔌 Disconnected from device ${serialNumber}`);
    }

    teardownAsyncNotificationMonitor(serialNumber);
  } catch (error) {
    console.error(`❌ Disconnect failed for ${serialNumber}:`, error);
    throw error;
  }
}

export {
  connectBySerialNumber,
  getConnectionState,
  executeBLECommand,
  disconnectDevice,
  getConnectedGentlyDevices,
};
