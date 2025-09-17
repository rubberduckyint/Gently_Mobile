/**
 * Shared BLE Protocol Types and Enums
 *
 * This file contains the core types and enums used across the BLE protocol
 * to avoid circular dependencies between protocol.ts and command classes.
 */

// Protocol constants from the BLE specification
export const GENTLY_SERVICE_UUID = "0000F021-0000-1000-8000-00805F9B34FB";
export const REQUEST_CHARACTERISTIC_UUID =
  "0000F023-0000-1000-8000-00805F9B34FB";
export const RESPONSE_CHARACTERISTIC_UUID =
  "0000F024-0000-1000-8000-00805F9B34FB";

export const API_VERSION = 0x01;
export const MOTSAI_COMPANY_ID = 0x0274;

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
  // Notification commands
  BATTERY_STATUS_NOTIFY = 0x80,
  ACTIVE_EVENT_NOTIFY = 0x81,
  TIME_NOTIFY = 0x82,
}

// Response status codes
export enum ResponseStatus {
  OK = 0x00,
  ERROR = 0x01,
}

// Event state enumeration from BLE protocol
export enum EventState {
  OFF = 0x00,
  ON_INACTIVE = 0x01,
  ON_ACTIVE_VIBRATION = 0x02,
  ON_ACTIVE_RETRIGGER_DELAY = 0x03,
  ON_ACTIVE_SNOOZE_PERIOD = 0x04,
}

// Advertisement packet structure
export interface AdvertisementData {
  apiVersion: number;
  packetCounter: number;
  errorCode: number;
  serialNumber: Uint8Array;
  localTime: {
    hour: number;
    minute: number;
    seconds: number;
    year: number;
    month: number;
    date: number;
    weekDay: number;
  };
  batteryVoltage: number;
  flags: {
    charging: boolean;
    batteryLevel: number;
    braceletKeyType: number;
    anyEventActive: boolean;
  };
}

// Device information structure
export interface DeviceInformation {
  hardwareVersion: number;
  firmwareVersionMajor: number;
  firmwareVersionMinor: number;
  firmwareBuildNumber: number;
}

// Device event structure
export interface DeviceEvent {
  index: number; // 0-49
  state: EventState;
  name: string;
  cronExpression: string;
  // Additional fields from the BLE protocol would go here
  // vibrationPattern, ledPattern, priority, etc.
}

// Event synchronization result
export interface EventSyncResult {
  totalEvents: number;
  deviceEvents: DeviceEvent[];
  addedToDevice: number;
  removedFromDevice: number;
  updatedOnDevice: number;
  errors: string[];
}
