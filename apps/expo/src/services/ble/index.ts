/**
 * BLE Service Main Entry Point
 * Exports all BLE functionality for Gently Bracelets
 */

// Storage
export {
  storeDeviceKey,
  getDeviceKey,
  getDeviceKeyBySerial,
  removeDeviceKey,
  getAllStoredDeviceIds,
  getAllStoredDeviceKeys,
  clearAllDeviceKeys,
  hasDeviceKey,
  getStorageStats,
  saveSessionRecord,
  getSessionRecord,
  clearSessionRecord,
} from "./storage";

export type { BraceletSessionRecord } from "./storage";

// Encryption utilities
export {
  TEAEncryption,
  generateDynamicKey,
  parseAdvertisementData,
  extractAdvertisementPayload,
  bytesToHexString,
} from "./encryption";

// Utilities
export { requestBluetoothPermissions } from "./utils";

// Types
export type {
  AdvertisementData,
  DeviceInfo,
  ConnectionState,
  StoredDeviceKey,
  BLEConnectionOptions,
  BLECommandRequest,
  BLECommandResponse,
} from "./types";

export {
  BLE_SERVICE_UUID,
  BLE_REQUEST_CHARACTERISTIC_UUID,
  BLE_RESPONSE_CHARACTERISTIC_UUID,
  FACTORY_BRACELET_KEY,
  API_VERSION,
  CommandCode,
  ResponseStatus,
} from "./types";
