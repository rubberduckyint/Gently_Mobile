// Commands module exports - re-export all command functions for easy importing

// Core command infrastructure
export { sendSecureCommand } from "./core";

// Device info commands
export { readSecureDeviceInfo, readDeviceInfo } from "./deviceInfo";

// Device status commands
export { readSecureBatteryLevel, readSecureDeviceTime } from "./deviceStatus";

// Comprehensive device details
export { readComprehensiveDeviceDetails } from "./comprehensive";

// Device details and time retrieval
export { getDeviceDetailsAndTime } from "./deviceDetails";

// Event/alarm commands
export { syncDeviceAlarms } from "./events";
export type { SyncResult, DeviceDetailsResult } from "./events";

// Advertisement parsing
export {
  decryptAdvertisementPayload,
  parseManufacturerData,
  parseGentlyAdvertisementPayload,
} from "./advertisement";
