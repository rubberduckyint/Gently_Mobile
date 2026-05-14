import type { Peripheral } from "react-native-ble-manager";
import { Platform } from "react-native";

/**
 * BLE Types for Gently Bracelet Communication
 * Based on P308-2101Rev0.5-GentlyBraceletSecureBluetoothCommunicationProtocol
 */

export interface AdvertisementData {
  apiVersion: number;
  packetCounter: number;
  errorCode: number;
  serialNumber: string; // 8 bytes as hex string
  timeHour: number;
  timeMinute: number;
  timeSeconds: number;
  year: number;
  month: number;
  date: number;
  weekDay: number;
  batteryVoltage: number; // in mV
  chargingStatus: boolean;
  batteryLevel: number; // 0-4 (CRITICAL to FULL)
  braceletKeyType: "factory" | "custom";
  anyEventActive: boolean;
}

export interface DeviceInfo {
  device?: Peripheral;
  serialNumber: string;
  braceletKey: string;
  dynamicKey?: string;
  isConnected: boolean;
  hardwareVersion?: number;
  firmwareVersionMajor?: number;
  firmwareVersionMinor?: number;
  firmwareBuildNumber?: number;
}

export interface ConnectionState {
  isConnected: boolean;
  deviceId?: string;
  serialNumber?: string;
  hasCustomKey: boolean;
}

export interface StoredDeviceKey {
  deviceId: string;
  serialNumber: string;
  customEncryptionKey: string; // 16 bytes as hex string
  dynamicKey?: string; // Dynamic key for current session
  lastConnected?: number;
  apiVersion?: number;
  createdAt: number;
}

// BLE Protocol Enums for device feedback
export enum VibrationIntensity {
  LOW = 0x00,
  MEDIUM = 0x01,
  HIGH = 0x02,
  MAXIMUM = 0x03,
}

export enum LedPattern {
  OFF = 0x00,
  BLINK_SLOW = 0x01,
  BLINK_FAST = 0x02,
  SOLID = 0x03,
}

export enum LedColor {
  OFF = 0,
  BLUE = 1,
  GREEN = 2,
  CYAN = 3,
  RED = 4,
  YELLOW = 5,
  MAGENTA = 6,
  WHITE = 7,
}

// BLE Service and Characteristic UUIDs - Raw values
const BLE_SERVICE_UUID_FULL = "0000F021-0000-1000-8000-00805F9B34FB";
const BLE_SERVICE_UUID_SHORT = "F021";

// Full UUID format (used by Android)
const BLE_REQUEST_CHARACTERISTIC_UUID_FULL =
  "0000F023-0000-1000-8000-00805F9B34FB"; // Write requests to bracelet
const BLE_RESPONSE_CHARACTERISTIC_UUID_FULL =
  "0000F024-0000-1000-8000-00805F9B34FB"; // Notifications from bracelet

// Short UUID format (used by iOS)
const BLE_REQUEST_CHARACTERISTIC_UUID_SHORT = "F023";
const BLE_RESPONSE_CHARACTERISTIC_UUID_SHORT = "F024";

// Platform-specific exports - single source of truth for UUID format
export const BLE_SERVICE_UUID =
  Platform.OS === "ios" ? BLE_SERVICE_UUID_SHORT : BLE_SERVICE_UUID_FULL;
export const BLE_REQUEST_CHARACTERISTIC_UUID =
  Platform.OS === "ios"
    ? BLE_REQUEST_CHARACTERISTIC_UUID_SHORT
    : BLE_REQUEST_CHARACTERISTIC_UUID_FULL;
export const BLE_RESPONSE_CHARACTERISTIC_UUID =
  Platform.OS === "ios"
    ? BLE_RESPONSE_CHARACTERISTIC_UUID_SHORT
    : BLE_RESPONSE_CHARACTERISTIC_UUID_FULL;

// Factory default bracelet key (16 bytes)
export const FACTORY_BRACELET_KEY = "43EA5F35659859874A6F184742C32B2B";

// API Version
// Firmware V1.2.0-1 uses API version 2 (per "P308 - 2101 Rev 0.7 - Gently
// Bracelet Secure Bluetooth Communication Protocol [API 2].pdf"). The firmware
// enforces this at bt_manager.c:807 (BLE_PROTOCOL_VERSION check against
// ble/inc/ble_types.h:14). Every outgoing command's byte 0 and every incoming
// response's byte 0 must be 0x02. Was previously 0x01 (Rev 0.3 / API 1, the
// DK test build's protocol); API 2 was a breaking-change release.
export const API_VERSION = 0x02;

// Vibration patterns for preview
export enum VibrationPattern {
  QUICK = 0,
  HEARTBEAT = 1,
  RAPID = 2,
  SYMPHONY = 3,
}

// Command codes
export enum CommandCode {
  GET_UPTIME = 0x01,
  GET_DEVICE_INFO = 0x02,
  GET_EVENT = 0x03,
  ADD_EVENT = 0x04,
  SET_EVENT_ON_OFF = 0x05,
  GET_ALL_EVENTS = 0x06,
  REMOVE_EVENT = 0x07,
  REMOVE_ALL_EVENTS = 0x08,
  GET_NUMBER_OF_EVENTS = 0x09,
  GET_TIME = 0x0a,
  SET_TIME = 0x0b,
  GET_DEVICE_STATUS = 0x0c,
  ACKNOWLEDGE_EVENT = 0x0d,
  SET_BRACELET_KEY = 0x0e,
  GET_BRACELET_KEY = 0x0f,
  FIND_ME = 0x10,
  ENTER_DFU_MODE = 0x11,
  REBOOT_BRACELET = 0x12,
  SET_DYNAMIC_KEY = 0x13,
  // Trigger pattern commands. Opcodes are API-2 values per firmware
  // engineer's spec (bt_manager.c FINDME=0x10, TRIGGER_LED=0x41,
  // TRIGGER_AUDIO=0x42, TRIGGER_VIBRATION=0x43). The old 0x14/0x15/0x16
  // values were API-1 codes — firmware V1.2.0-1 returns Status ERROR if
  // those are sent. See the API 1 → API 2 breaking-change migration note
  // in coordinator memory [[project-srf-deferred-threads]].
  TRIGGER_LED_PATTERN = 0x41,
  TRIGGER_AUDIO_PATTERN = 0x42,
  TRIGGER_VIBRATION_PATTERN = 0x43,
  // Notifications
  BATTERY_STATUS_NOTIFY = 0x80,
  ACTIVE_EVENT_NOTIFY = 0x81,
  TIME_NOTIFY = 0x82,
}

// Response status codes
export enum ResponseStatus {
  OK = 0x00,
  ERROR = 0x01,
}

export interface BLECommandRequest {
  command: CommandCode;
  parameters?: Record<string, unknown>;
  payload?: Uint8Array;
  apiVersion?: number;
  commandCode?: CommandCode; // Legacy support
}

export interface BLECommandResponse {
  apiVersion: number;
  commandCode: CommandCode;
  status: ResponseStatus;
  payload: Uint8Array;
}

export interface BLEConnectionOptions {
  timeoutMs?: number;
  retryCount?: number;
}
