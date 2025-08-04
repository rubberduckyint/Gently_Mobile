/**
 * Device management service for storing and retrieving paired Gently devices
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GentlyPairedDevice, GentlyDeviceInfo, GentlyDeviceSyncStatus } from './GentlyTypes';
import { GentlyEncryption } from './GentlyEncryption';

const STORAGE_KEY = 'gently_paired_devices';

export class GentlyDeviceManager {
  private static instance: GentlyDeviceManager;
  private pairedDevices: Map<string, GentlyPairedDevice> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): GentlyDeviceManager {
    if (!GentlyDeviceManager.instance) {
      GentlyDeviceManager.instance = new GentlyDeviceManager();
    }
    return GentlyDeviceManager.instance;
  }

  /**
   * Initialize the device manager by loading stored devices
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const storedData = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedData) {
        const devices: GentlyPairedDevice[] = JSON.parse(storedData);
        
        // Convert stored data back to proper format
        for (const device of devices) {
          // Convert bracelet key from hex string back to Uint8Array
          if (typeof device.braceletKey === 'string') {
            device.braceletKey = GentlyEncryption.hexToBytes(device.braceletKey as any);
          }
          
          // Convert dates
          device.pairedAt = new Date(device.pairedAt);
          if (device.lastConnected) {
            device.lastConnected = new Date(device.lastConnected);
          }

          this.pairedDevices.set(device.uniqueId, device);
        }
      }
      
      this.initialized = true;
      console.log(`Loaded ${this.pairedDevices.size} paired devices`);
    } catch (error) {
      console.error('Failed to load paired devices:', error);
      this.initialized = true;
    }
  }

  /**
   * Save all paired devices to storage
   */
  private async saveDevices(): Promise<void> {
    try {
      const devices = Array.from(this.pairedDevices.values()).map(device => ({
        ...device,
        // Convert Uint8Array to hex string for storage
        braceletKey: GentlyEncryption.bytesToHex(device.braceletKey),
      }));

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
    } catch (error) {
      console.error('Failed to save paired devices:', error);
    }
  }

  /**
   * Add a new paired device
   */
  async addPairedDevice(
    uniqueId: string,
    name: string,
    braceletKey: Uint8Array,
    deviceInfo?: GentlyDeviceInfo
  ): Promise<void> {
    await this.initialize();

    const device: GentlyPairedDevice = {
      uniqueId,
      name,
      braceletKey: new Uint8Array(braceletKey), // Create a copy
      pairedAt: new Date(),
      deviceInfo,
    };

    this.pairedDevices.set(uniqueId, device);
    await this.saveDevices();
    
    console.log(`Added paired device: ${name} (${uniqueId})`);
  }

  /**
   * Remove a paired device
   */
  async removePairedDevice(uniqueId: string): Promise<boolean> {
    await this.initialize();

    const removed = this.pairedDevices.delete(uniqueId);
    if (removed) {
      await this.saveDevices();
      console.log(`Removed paired device: ${uniqueId}`);
    }
    
    return removed;
  }

  /**
   * Get a paired device by unique ID
   */
  async getPairedDevice(uniqueId: string): Promise<GentlyPairedDevice | null> {
    await this.initialize();
    return this.pairedDevices.get(uniqueId) || null;
  }

  /**
   * Get all paired devices (excluding those marked as deleted locally)
   */
  async getAllPairedDevices(): Promise<GentlyPairedDevice[]> {
    await this.initialize();
    return Array.from(this.pairedDevices.values())
      .filter(device => !device.deletedLocally);
  }

  /**
   * Get all paired devices including those marked for deletion
   */
  async getAllPairedDevicesIncludingDeleted(): Promise<GentlyPairedDevice[]> {
    await this.initialize();
    return Array.from(this.pairedDevices.values());
  }

  /**
   * Check if a device is already paired
   */
  async isPaired(uniqueId: string): Promise<boolean> {
    await this.initialize();
    return this.pairedDevices.has(uniqueId);
  }

  /**
   * Update last connected time for a device
   */
  async updateLastConnected(uniqueId: string): Promise<void> {
    await this.initialize();
    
    const device = this.pairedDevices.get(uniqueId);
    if (device) {
      device.lastConnected = new Date();
      await this.saveDevices();
    }
  }

  /**
   * Update device info for a paired device
   */
  async updateDeviceInfo(uniqueId: string, deviceInfo: GentlyDeviceInfo): Promise<void> {
    await this.initialize();
    
    const device = this.pairedDevices.get(uniqueId);
    if (device) {
      device.deviceInfo = deviceInfo;
      await this.saveDevices();
    }
  }

  /**
   * Get the bracelet key for a paired device
   */
  async getBraceletKey(uniqueId: string): Promise<Uint8Array | null> {
    const device = await this.getPairedDevice(uniqueId);
    return device ? device.braceletKey : null;
  }

  /**
   * Clear all paired devices (for testing/reset)
   */
  async clearAllDevices(): Promise<void> {
    this.pairedDevices.clear();
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('Cleared all paired devices');
  }

  /**
   * Get device count (excluding deleted devices)
   */
  async getDeviceCount(): Promise<number> {
    await this.initialize();
    return Array.from(this.pairedDevices.values())
      .filter(device => !device.deletedLocally).length;
  }

  /**
   * Mark device as deleted locally (local-first deletion)
   */
  async markDeviceAsDeleted(uniqueId: string): Promise<boolean> {
    await this.initialize();
    
    const device = this.pairedDevices.get(uniqueId);
    if (device) {
      device.deletedLocally = true;
      device.syncStatus = GentlyDeviceSyncStatus.PENDING_DELETE;
      await this.saveDevices();
      console.log(`Marked device as deleted locally: ${uniqueId}`);
      return true;
    }
    
    return false;
  }

  /**
   * Restore device from deleted state (undo local deletion)
   */
  async restoreDeletedDevice(uniqueId: string): Promise<boolean> {
    await this.initialize();
    
    const device = this.pairedDevices.get(uniqueId);
    if (device && device.deletedLocally) {
      device.deletedLocally = false;
      device.syncStatus = GentlyDeviceSyncStatus.SYNCED;
      await this.saveDevices();
      console.log(`Restored device from deleted state: ${uniqueId}`);
      return true;
    }
    
    return false;
  }

  /**
   * Permanently remove device (after successful sync)
   */
  async permanentlyRemoveDevice(uniqueId: string): Promise<boolean> {
    await this.initialize();

    const removed = this.pairedDevices.delete(uniqueId);
    if (removed) {
      await this.saveDevices();
      console.log(`Permanently removed device: ${uniqueId}`);
    }
    
    return removed;
  }

  /**
   * Update device sync status
   */
  async updateSyncStatus(uniqueId: string, status: GentlyDeviceSyncStatus): Promise<void> {
    await this.initialize();
    
    const device = this.pairedDevices.get(uniqueId);
    if (device) {
      device.syncStatus = status;
      await this.saveDevices();
    }
  }

  /**
   * Get devices with pending sync operations
   */
  async getDevicesWithPendingSync(): Promise<GentlyPairedDevice[]> {
    await this.initialize();
    return Array.from(this.pairedDevices.values())
      .filter(device => 
        device.syncStatus === GentlyDeviceSyncStatus.PENDING_DELETE ||
        device.syncStatus === GentlyDeviceSyncStatus.PENDING_UPDATE ||
        device.syncStatus === GentlyDeviceSyncStatus.SYNC_ERROR
      );
  }
}

// Export singleton instance
export const gentlyDeviceManager = GentlyDeviceManager.getInstance();
