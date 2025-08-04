/**
 * TypeScript types for Gently BLE Protocol
 * Based on Gently_BLE_Protocol_Full.md specification
 */

// API Version
export const GENTLY_API_VERSION = 0x01;

// BLE Service and Characteristic UUIDs
export const GENTLY_SERVICE_UUID = "0000F021-0000-1000-8000-00805F9B34FB";
export const GENTLY_REQUEST_CHAR_UUID = "0000F023-0000-1000-8000-00805F9B34FB";
export const GENTLY_RESPONSE_CHAR_UUID = "0000F024-0000-1000-8000-00805F9B34FB";

// Advertisement packet structure
export interface GentlyAdvertisementData {
  apiVersion: number;
  packetCounter: number;
  errorCode: number;
  uniqueId: Uint8Array; // 8 bytes
  localTimeHour: number; // BCD format
  localTimeMinute: number; // BCD format
  localTimeSeconds: number; // BCD format
  year: number; // BCD format (2000-2099)
  month: number; // BCD format (1-12)
  date: number; // BCD format (1-31)
  weekDay: number; // 0-6 (Sunday = 0)
  batteryVoltage: number; // mV
  statusByte: number; // Bit flags
}

// Status byte bit definitions
export interface GentlyStatusBits {
  charging: boolean; // Bit 2
  batteryLevel: number; // Bits 3-5 (0-4: CRITICAL, LOW, MEDIUM, GOOD, FULL)
  hasActiveEvent: boolean; // Bit 7
  isFactoryMode: boolean; // Bit 6 = 0 means factory mode
}

// Command definitions
export enum GentlyCommand {
  GET_UPTIME = 0x01,
  GET_DEVICE_INFO = 0x02,
  GET_EVENT = 0x03,
  ADD_EVENT = 0x04,
  SET_EVENT_ON_OFF = 0x05,
  GET_ALL_EVENTS = 0x06,
  REMOVE_EVENT = 0x07,
  REMOVE_ALL_EVENTS = 0x08,
  GET_NUMBER_OF_EVENTS = 0x09,
  GET_TIME = 0x0A,
  SET_TIME = 0x0B,
  GET_DEVICE_STATUS = 0x0C,
  ACKNOWLEDGE_EVENT = 0x0D,
  SET_BRACELET_KEY = 0x0E,
  GET_BRACELET_KEY = 0x0F,
  FIND_ME = 0x10,
  ENTER_DFU_MODE = 0x11,
  
  // Notifications
  BATTERY_STATUS_NOTIFY = 0x80,
  ACTIVE_EVENT_NOTIFY = 0x81,
  TIME_NOTIFY = 0x82,
}

// Generic packet structure
export interface GentlyPacket {
  apiVersion: number;
  command: GentlyCommand;
  payload: Uint8Array;
}

// Device info response
export interface GentlyDeviceInfo {
  apiVersion: number;
  firmwareVersion: string;
  hardwareVersion: string;
  serialNumber: string;
  deviceName: string;
  manufacturerName: string;
}

// Device status response
export interface GentlyDeviceStatus {
  batteryLevel: number; // 0-100%
  batteryVoltage: number; // mV
  isCharging: boolean;
  uptimeSeconds: number;
  hasActiveEvents: boolean;
  errorCode: number;
}

// Event structure
export interface GentlyEvent {
  index: number; // 0-49
  isActive: boolean;
  eventType: GentlyEventType;
  triggerTime: Date;
  repeatDays: number; // Bitmask for days of week
  duration: number; // seconds
  retriggerDelay: number; // seconds
  intensity: number; // 0-100%
}

export enum GentlyEventType {
  SINGLE_VIBRATION = 0x00,
  DOUBLE_VIBRATION = 0x01,
  TRIPLE_VIBRATION = 0x02,
  LONG_VIBRATION = 0x03,
  CUSTOM_PATTERN = 0x04,
}

// Pairing/Connection states
export enum GentlyConnectionState {
  DISCONNECTED = 'disconnected',
  SCANNING = 'scanning',
  CONNECTING = 'connecting',
  AUTHENTICATING = 'authenticating',
  CONNECTED = 'connected',
  ERROR = 'error',
}

// Discovered device information
export interface GentlyDiscoveredDevice {
  id: string;
  name: string;
  rssi: number;
  uniqueId: string; // Hex string of 8-byte unique ID
  isFactoryMode: boolean;
  batteryLevel: number;
  hasActiveEvent: boolean;
  advertisementData: GentlyAdvertisementData;
}

// Device sync status for local-first operations
export enum GentlyDeviceSyncStatus {
  SYNCED = 'synced',
  PENDING_DELETE = 'pending_delete',
  PENDING_UPDATE = 'pending_update',
  SYNC_ERROR = 'sync_error'
}

// Paired device information (stored locally)
export interface GentlyPairedDevice {
  uniqueId: string; // 8-byte unique ID as hex string
  name: string;
  braceletKey: Uint8Array; // 16-byte custom key
  pairedAt: Date;
  lastConnected?: Date;
  deviceInfo?: GentlyDeviceInfo;
  syncStatus?: GentlyDeviceSyncStatus;
  deletedLocally?: boolean; // True if deleted locally but not yet synced
}

// Dynamic key generation data
export interface GentlyDynamicKeyData {
  braceletKey: Uint8Array; // 16 bytes
  uniqueId: Uint8Array; // 8 bytes
  uptime: number; // 4 bytes
}

// Response status codes
export enum GentlyResponseStatus {
  OK = 0x00,
  ERROR = 0x01,
}

// Error codes in advertisement packet
export interface GentlyErrorCodes {
  rtcError: boolean; // Bit 0
  memoryError: boolean; // Bit 1
  sensorError: boolean; // Bit 2
  communicationError: boolean; // Bit 3
  powerError: boolean; // Bit 4
  temperatureError: boolean; // Bit 5
  userButtonError: boolean; // Bit 6
  ledStripError: boolean; // Bit 7
  watchdogError: boolean; // Bit 8
  rtcClockError: boolean; // Bit 9
}

// Utility type for BLE packet parsing
export interface BLEPacketParser {
  parseAdvertisementData(manufacturerData: Uint8Array): GentlyAdvertisementData | null;
  createCommandPacket(command: GentlyCommand, payload?: Uint8Array): Uint8Array;
  parseResponsePacket(data: Uint8Array): { command: GentlyCommand; status: GentlyResponseStatus; payload: Uint8Array };
}
