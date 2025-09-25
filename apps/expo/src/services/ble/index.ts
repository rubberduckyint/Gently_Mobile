/**
 * BLE Service Main Entry Point
 * Exports all BLE functionality for Gently Bracelets
 */

// Core functionality
export {
  connectBySerialNumber,
  disconnectDevice,
  getConnectionState,
  executeBLECommand,
  getConnectedGentlyDevices,
} from "./connection";

// Scanning
export {
  scanForGentlyDevices,
  findGentlyDeviceBySerial,
  stopScan,
  requestBlePermissions,
  getBleState,
  cleanupBleManager,
  monitorBleState,
} from "./scanner";

// Commands - re-export from commands module
export * from "./commands";

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
} from "./storage";

// Encryption utilities
export {
  TEAEncryption,
  generateDynamicKey,
  parseAdvertisementData,
} from "./encryption";

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

export type { DiscoveredGentlyDevice } from "./scanner";
