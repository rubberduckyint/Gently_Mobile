/**
 * Storage module for persistent BLE encryption keys
 * Uses Expo SecureStore for secure storage of custom encryption keys mapped to device IDs
 */

import * as SecureStore from "expo-secure-store";

import type { StoredDeviceKey } from "./types";

const STORAGE_KEY_PREFIX = "ble_device_key_";
const STORAGE_KEYS_LIST = "ble_device_keys_list";
const SESSION_KEY_PREFIX = "ble_session_";

export interface BraceletSessionRecord {
  serialNumber: string;
  peripheralId: string;
  customKey: string;
  braceletKey: string;
  createdAt: number;
}

/**
 * Sanitize device ID to create a valid SecureStore key
 * SecureStore keys must be alphanumeric with underscores and dashes allowed
 * BLE device IDs often contain colons and other characters that need to be sanitized
 */
function sanitizeDeviceId(deviceId: string): string {
  // Replace invalid characters with underscores
  // Keep alphanumeric, underscores, and dashes only
  return deviceId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Create a secure storage key for a device
 */
function createDeviceStorageKey(deviceId: string): string {
  const sanitizedId = sanitizeDeviceId(deviceId);
  return `${STORAGE_KEY_PREFIX}${sanitizedId}`;
}

function createSessionStorageKey(serialNumber: string): string {
  return `${SESSION_KEY_PREFIX}${serialNumber.toUpperCase()}`;
}

/**
 * Store a custom encryption key for a device
 */
export async function storeDeviceKey(
  deviceKey: StoredDeviceKey,
): Promise<void> {
  try {
    const existingDeviceIds = await getAllStoredDeviceIds();

    for (const existingDeviceId of existingDeviceIds) {
      if (existingDeviceId === deviceKey.deviceId) {
        continue;
      }

      const existingKey = await getDeviceKey(existingDeviceId);
      if (existingKey?.serialNumber === deviceKey.serialNumber) {
        await removeDeviceKey(existingDeviceId);
      }
    }

    const key = createDeviceStorageKey(deviceKey.deviceId);
    await SecureStore.setItemAsync(key, JSON.stringify(deviceKey));

    // Also maintain a list of all stored device IDs for easy retrieval
    await addDeviceIdToList(deviceKey.deviceId);

    console.log(`✅ Stored encryption key for device ${deviceKey.deviceId}`);
  } catch (error) {
    console.error("Failed to store device key:", error);
    throw new Error("Failed to store device encryption key");
  }
}

/**
 * Retrieve a custom encryption key for a device
 */
export async function getDeviceKey(
  deviceId: string,
): Promise<StoredDeviceKey | null> {
  try {
    const key = createDeviceStorageKey(deviceId);
    const storedData = await SecureStore.getItemAsync(key);

    if (!storedData) {
      return null;
    }

    const deviceKey = JSON.parse(storedData) as StoredDeviceKey;
    console.log(`✅ Retrieved encryption key for device ${deviceId}`);
    return deviceKey;
  } catch (error) {
    console.error("Failed to retrieve device key:", error);
    return null;
  }
}

/**
 * Find device key by serial number
 */
export async function getDeviceKeyBySerial(
  serialNumber: string,
): Promise<StoredDeviceKey | null> {
  try {
    const deviceIds = await getAllStoredDeviceIds();

    for (const deviceId of deviceIds) {
      const deviceKey = await getDeviceKey(deviceId);
      if (deviceKey?.serialNumber === serialNumber) {
        console.log(
          `✅ Found device key for serial ${serialNumber} (device ${deviceId})`,
        );
        return deviceKey;
      }
    }

    console.log(`❌ No device key found for serial ${serialNumber}`);
    return null;
  } catch (error) {
    console.error("Failed to find device key by serial:", error);
    return null;
  }
}

/**
 * Remove a device key
 */
export async function removeDeviceKey(deviceId: string): Promise<void> {
  try {
    const key = createDeviceStorageKey(deviceId);
    await SecureStore.deleteItemAsync(key);
    await removeDeviceIdFromList(deviceId);

    console.log(`✅ Removed encryption key for device ${deviceId}`);
  } catch (error) {
    console.error("Failed to remove device key:", error);
    throw new Error("Failed to remove device encryption key");
  }
}

/**
 * Get all stored device IDs
 */
export async function getAllStoredDeviceIds(): Promise<string[]> {
  try {
    const storedList = await SecureStore.getItemAsync(STORAGE_KEYS_LIST);
    return storedList ? (JSON.parse(storedList) as string[]) : [];
  } catch (error) {
    console.error("Failed to get stored device IDs:", error);
    return [];
  }
}

/**
 * Get all stored device keys
 */
export async function getAllStoredDeviceKeys(): Promise<StoredDeviceKey[]> {
  try {
    const deviceIds = await getAllStoredDeviceIds();
    const deviceKeys: StoredDeviceKey[] = [];

    for (const deviceId of deviceIds) {
      const deviceKey = await getDeviceKey(deviceId);
      if (deviceKey) {
        deviceKeys.push(deviceKey);
      }
    }

    return deviceKeys;
  } catch (error) {
    console.error("Failed to get all stored device keys:", error);
    return [];
  }
}

/**
 * Clear all stored device keys
 */
export async function clearAllDeviceKeys(): Promise<void> {
  try {
    const deviceIds = await getAllStoredDeviceIds();

    // Remove each device key
    for (const deviceId of deviceIds) {
      const key = createDeviceStorageKey(deviceId);
      await SecureStore.deleteItemAsync(key);
    }

    // Clear the device IDs list
    await SecureStore.deleteItemAsync(STORAGE_KEYS_LIST);

    console.log("✅ Cleared all device encryption keys");
  } catch (error) {
    console.error("Failed to clear all device keys:", error);
    throw new Error("Failed to clear device encryption keys");
  }
}

/**
 * Check if a device has a stored key
 */
export async function hasDeviceKey(deviceId: string): Promise<boolean> {
  try {
    const key = createDeviceStorageKey(deviceId);
    const storedData = await SecureStore.getItemAsync(key);
    return storedData !== null;
  } catch (error) {
    console.error("Failed to check if device key exists:", error);
    return false;
  }
}

/**
 * Update the list of stored device IDs
 */
async function addDeviceIdToList(deviceId: string): Promise<void> {
  try {
    const currentList = await getAllStoredDeviceIds();

    if (!currentList.includes(deviceId)) {
      currentList.push(deviceId);
      await SecureStore.setItemAsync(
        STORAGE_KEYS_LIST,
        JSON.stringify(currentList),
      );
    }
  } catch (error) {
    console.error("Failed to add device ID to list:", error);
  }
}

/**
 * Remove device ID from the list
 */
async function removeDeviceIdFromList(deviceId: string): Promise<void> {
  try {
    const currentList = await getAllStoredDeviceIds();
    const updatedList = currentList.filter((id) => id !== deviceId);

    await SecureStore.setItemAsync(
      STORAGE_KEYS_LIST,
      JSON.stringify(updatedList),
    );
  } catch (error) {
    console.error("Failed to remove device ID from list:", error);
  }
}

/**
 * Get storage statistics for debugging
 */
export async function getStorageStats(): Promise<{
  totalDevices: number;
  deviceIds: string[];
  totalStorageSize: number;
}> {
  try {
    const deviceIds = await getAllStoredDeviceIds();
    let totalStorageSize = 0;

    // Estimate storage size
    for (const deviceId of deviceIds) {
      const key = createDeviceStorageKey(deviceId);
      const data = await SecureStore.getItemAsync(key);
      if (data) {
        totalStorageSize += data.length;
      }
    }

    return {
      totalDevices: deviceIds.length,
      deviceIds,
      totalStorageSize,
    };
  } catch (error) {
    console.error("Failed to get storage stats:", error);
    return {
      totalDevices: 0,
      deviceIds: [],
      totalStorageSize: 0,
    };
  }
}

export async function saveSessionRecord(
  record: BraceletSessionRecord,
): Promise<void> {
  await SecureStore.setItemAsync(
    createSessionStorageKey(record.serialNumber),
    JSON.stringify(record),
  );
}

export async function getSessionRecord(
  serialNumber: string,
): Promise<BraceletSessionRecord | null> {
  const value = await SecureStore.getItemAsync(
    createSessionStorageKey(serialNumber),
  );

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as BraceletSessionRecord;
  } catch (error) {
    console.warn("Failed to parse stored BLE session", {
      serialNumber,
      message: error instanceof Error ? error.message : String(error),
    });
    await SecureStore.deleteItemAsync(createSessionStorageKey(serialNumber));
    return null;
  }
}

export async function clearSessionRecord(serialNumber: string): Promise<void> {
  await SecureStore.deleteItemAsync(createSessionStorageKey(serialNumber));
}
