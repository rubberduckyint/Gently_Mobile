/**
 * Device synchronization service for managing local-first device operations
 * This service handles the sync between local device storage and cloud database
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GentlyPairedDevice } from './GentlyTypes';
import { gentlyDeviceManager } from './GentlyDeviceManager';

const SYNC_QUEUE_KEY = 'gently_sync_queue';
const LAST_SYNC_KEY = 'gently_last_sync';

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  deviceId: string;
  timestamp: number;
  data?: any;
  retryCount?: number;
}

export interface SyncResult {
  success: boolean;
  syncedOperations: string[];
  failedOperations: SyncOperation[];
}

export class GentlyDeviceSyncService {
  private static instance: GentlyDeviceSyncService;
  private syncQueue: SyncOperation[] = [];
  private isSyncing = false;
  private initialized = false;

  private constructor() {}

  static getInstance(): GentlyDeviceSyncService {
    if (!GentlyDeviceSyncService.instance) {
      GentlyDeviceSyncService.instance = new GentlyDeviceSyncService();
    }
    return GentlyDeviceSyncService.instance;
  }

  /**
   * Initialize the sync service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadSyncQueue();
      this.initialized = true;
      console.log(`Sync service initialized with ${this.syncQueue.length} pending operations`);
    } catch (error) {
      console.error('Failed to initialize sync service:', error);
      this.initialized = true;
    }
  }

  /**
   * Load sync queue from storage
   */
  private async loadSyncQueue(): Promise<void> {
    try {
      const queueData = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      if (queueData) {
        this.syncQueue = JSON.parse(queueData);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
      this.syncQueue = [];
    }
  }

  /**
   * Save sync queue to storage
   */
  private async saveSyncQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.syncQueue));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  /**
   * Add an operation to the sync queue
   */
  async queueOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    await this.initialize();

    const syncOperation: SyncOperation = {
      ...operation,
      id: this.generateOperationId(),
      timestamp: Date.now(),
      retryCount: 0,
    };

    // Remove any existing operations for the same device of the same type
    this.syncQueue = this.syncQueue.filter(
      op => !(op.deviceId === operation.deviceId && op.type === operation.type)
    );

    this.syncQueue.push(syncOperation);
    await this.saveSyncQueue();

    console.log(`Queued ${operation.type} operation for device ${operation.deviceId}`);
  }

  /**
   * Queue device deletion operation
   */
  async queueDeviceDeletion(deviceId: string): Promise<void> {
    await this.queueOperation({
      type: 'delete',
      deviceId,
    });
  }

  /**
   * Queue device creation operation
   */
  async queueDeviceCreation(deviceId: string, deviceData: any): Promise<void> {
    await this.queueOperation({
      type: 'create',
      deviceId,
      data: deviceData,
    });
  }

  /**
   * Queue device update operation
   */
  async queueDeviceUpdate(deviceId: string, updateData: any): Promise<void> {
    await this.queueOperation({
      type: 'update',
      deviceId,
      data: updateData,
    });
  }

  /**
   * Sync all pending operations with the cloud
   */
  async syncWithCloud(trpcClient: any): Promise<SyncResult> {
    if (this.isSyncing) {
      console.log('Sync already in progress, skipping');
      return { success: true, syncedOperations: [], failedOperations: [] };
    }

    this.isSyncing = true;
    await this.initialize();

    const syncedOperations: string[] = [];
    const failedOperations: SyncOperation[] = [];

    try {
      console.log(`Starting sync with ${this.syncQueue.length} pending operations`);

      // Process operations in chronological order
      const sortedOperations = [...this.syncQueue].sort((a, b) => a.timestamp - b.timestamp);

      for (const operation of sortedOperations) {
        try {
          await this.syncOperation(operation, trpcClient);
          syncedOperations.push(operation.id);
          console.log(`Successfully synced ${operation.type} operation for device ${operation.deviceId}`);
        } catch (error) {
          console.error(`Failed to sync ${operation.type} operation for device ${operation.deviceId}:`, error);
          
          // Increment retry count
          operation.retryCount = (operation.retryCount || 0) + 1;
          
          // If retry count exceeds threshold, mark as failed
          if (operation.retryCount >= 3) {
            failedOperations.push(operation);
            console.error(`Operation ${operation.id} failed after 3 retries, removing from queue`);
          } else {
            // Keep in queue for retry
            console.log(`Operation ${operation.id} will be retried (attempt ${operation.retryCount + 1})`);
          }
        }
      }

      // Remove successfully synced and permanently failed operations from queue
      const operationsToRemove = [...syncedOperations, ...failedOperations.map(op => op.id)];
      this.syncQueue = this.syncQueue.filter(op => !operationsToRemove.includes(op.id));
      
      await this.saveSyncQueue();
      await this.updateLastSyncTime();

      const success = failedOperations.length === 0;
      console.log(`Sync completed: ${syncedOperations.length} succeeded, ${failedOperations.length} failed`);

      return {
        success,
        syncedOperations,
        failedOperations,
      };

    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync a single operation
   */
  private async syncOperation(operation: SyncOperation, trpcClient: any): Promise<void> {
    switch (operation.type) {
      case 'delete':
        await trpcClient.device.delete.mutate({ id: operation.deviceId });
        break;
      
      case 'create':
        await trpcClient.device.create.mutate(operation.data);
        break;
      
      case 'update':
        await trpcClient.device.update.mutate({ 
          id: operation.deviceId, 
          ...operation.data 
        });
        break;
      
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  /**
   * Get pending operations count
   */
  async getPendingOperationsCount(): Promise<number> {
    await this.initialize();
    return this.syncQueue.length;
  }

  /**
   * Get last sync time
   */
  async getLastSyncTime(): Promise<Date | null> {
    try {
      const lastSyncData = await AsyncStorage.getItem(LAST_SYNC_KEY);
      return lastSyncData ? new Date(JSON.parse(lastSyncData)) : null;
    } catch (error) {
      console.error('Failed to get last sync time:', error);
      return null;
    }
  }

  /**
   * Update last sync time
   */
  private async updateLastSyncTime(): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, JSON.stringify(new Date().toISOString()));
    } catch (error) {
      console.error('Failed to update last sync time:', error);
    }
  }

  /**
   * Clear all pending operations (for testing/reset)
   */
  async clearSyncQueue(): Promise<void> {
    this.syncQueue = [];
    await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
    console.log('Cleared sync queue');
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if device has pending operations
   */
  async hasPendingOperations(deviceId: string): Promise<boolean> {
    await this.initialize();
    return this.syncQueue.some(op => op.deviceId === deviceId);
  }

  /**
   * Get pending operations for a specific device
   */
  async getPendingOperations(deviceId: string): Promise<SyncOperation[]> {
    await this.initialize();
    return this.syncQueue.filter(op => op.deviceId === deviceId);
  }

  /**
   * Remove all pending operations for a device (useful when device is re-added)
   */
  async clearDeviceOperations(deviceId: string): Promise<void> {
    await this.initialize();
    this.syncQueue = this.syncQueue.filter(op => op.deviceId !== deviceId);
    await this.saveSyncQueue();
    console.log(`Cleared all pending operations for device ${deviceId}`);
  }
}

// Export singleton instance
export const gentlyDeviceSyncService = GentlyDeviceSyncService.getInstance();
