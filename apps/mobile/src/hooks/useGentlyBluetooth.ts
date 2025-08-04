/**
 * React hook for managing Gently device Bluetooth connections
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  GentlyDiscoveredDevice, 
  GentlyConnectionState, 
  GentlyPairedDevice,
  GentlyDeviceInfo,
  GentlyDeviceStatus 
} from '../services/GentlyTypes';
import { gentlyBluetoothService } from '../services/GentlyBluetoothService';
import { gentlyDeviceManager } from '../services/GentlyDeviceManager';
import { gentlyDeviceSyncService } from '../services/GentlyDeviceSyncService';

export interface UseGentlyBluetoothReturn {
  // State
  connectionState: GentlyConnectionState;
  discoveredDevices: GentlyDiscoveredDevice[];
  pairedDevices: GentlyPairedDevice[];
  connectedDevice: GentlyPairedDevice | null;
  isScanning: boolean;
  error: string | null;
  pendingSyncCount: number;

  // Actions
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  connectToDevice: (uniqueId: string) => Promise<void>;
  disconnectDevice: () => Promise<void>;
  refreshPairedDevices: () => Promise<void>;
  removePairedDevice: (uniqueId: string) => Promise<void>;
  deleteDevice: (uniqueId: string) => Promise<void>;
  
  // Device operations
  getDeviceInfo: () => Promise<GentlyDeviceInfo | null>;
  getDeviceStatus: () => Promise<GentlyDeviceStatus | null>;
  setDeviceTime: (date?: Date) => Promise<void>;

  // Sync operations
  syncWithCloud: (trpcClient: any) => Promise<{ success: boolean; syncedCount: number; failedCount: number }>;
  getPendingSyncCount: () => Promise<number>;
}

export const useGentlyBluetooth = (): UseGentlyBluetoothReturn => {
  const [connectionState, setConnectionState] = useState<GentlyConnectionState>(
    GentlyConnectionState.DISCONNECTED
  );
  const [discoveredDevices, setDiscoveredDevices] = useState<GentlyDiscoveredDevice[]>([]);
  const [pairedDevices, setPairedDevices] = useState<GentlyPairedDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<GentlyPairedDevice | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Load paired devices and sync count on mount
  useEffect(() => {
    refreshPairedDevices();
    updatePendingSyncCount();
  }, []);

  // Monitor connection state
  useEffect(() => {
    const interval = setInterval(() => {
      const currentState = gentlyBluetoothService.getConnectionState();
      setConnectionState(currentState);
      setIsScanning(currentState === GentlyConnectionState.SCANNING);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const updatePendingSyncCount = useCallback(async () => {
    try {
      const count = await gentlyDeviceSyncService.getPendingOperationsCount();
      setPendingSyncCount(count);
    } catch (err) {
      console.error('Failed to get pending sync count:', err);
    }
  }, []);

  const refreshPairedDevices = useCallback(async () => {
    try {
      const devices = await gentlyDeviceManager.getAllPairedDevices();
      setPairedDevices(devices);
      await updatePendingSyncCount();
    } catch (err) {
      console.error('Failed to load paired devices:', err);
      setError('Failed to load paired devices');
    }
  }, [updatePendingSyncCount]);

  const startScan = useCallback(async () => {
    try {
      setError(null);
      setDiscoveredDevices([]);
      
      // Clear any previous device mappings
      gentlyBluetoothService.clearDiscoveredDevices();
      
      await gentlyBluetoothService.startScan(
        (device: GentlyDiscoveredDevice) => {
          setDiscoveredDevices(prev => {
            // Remove any existing device with the same uniqueId and add the new one
            const filtered = prev.filter(d => d.uniqueId !== device.uniqueId);
            return [...filtered, device];
          });
        },
        (scanError: string) => {
          setError(scanError);
        }
      );
    } catch (err) {
      const errorMessage = `Failed to start scan: ${err instanceof Error ? err.message : 'Unknown error'}`;
      setError(errorMessage);
      console.error('Scan failed:', err);
    }
  }, []);

  const stopScan = useCallback(async () => {
    try {
      await gentlyBluetoothService.stopScan();
      setIsScanning(false);
    } catch (err) {
      console.error('Failed to stop scan:', err);
    }
  }, []);

  const connectToDevice = useCallback(async (uniqueId: string) => {
    try {
      setError(null);
      const device = await gentlyBluetoothService.connectToDevice(uniqueId);
      setConnectedDevice(device);
      
      // Refresh paired devices list
      await refreshPairedDevices();
      
      // Stop scanning if we were scanning
      if (isScanning) {
        await stopScan();
      }
    } catch (err) {
      setError(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setConnectedDevice(null);
    }
  }, [isScanning, stopScan, refreshPairedDevices]);

  const disconnectDevice = useCallback(async () => {
    try {
      await gentlyBluetoothService.disconnectDevice();
      setConnectedDevice(null);
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setError('Failed to disconnect from device');
    }
  }, []);

  const removePairedDevice = useCallback(async (uniqueId: string) => {
    try {
      const success = await gentlyDeviceManager.removePairedDevice(uniqueId);
      if (success) {
        await refreshPairedDevices();
        
        // If this was the connected device, disconnect
        if (connectedDevice?.uniqueId === uniqueId) {
          await disconnectDevice();
        }
      }
    } catch (err) {
      setError(`Failed to remove device: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [connectedDevice, disconnectDevice, refreshPairedDevices]);

  const getDeviceInfo = useCallback(async (): Promise<GentlyDeviceInfo | null> => {
    try {
      if (connectionState !== GentlyConnectionState.CONNECTED) {
        throw new Error('No device connected');
      }
      
      const info = await gentlyBluetoothService.getDeviceInfo();
      
      // Update paired device with latest info
      if (connectedDevice) {
        await gentlyDeviceManager.updateDeviceInfo(connectedDevice.uniqueId, info);
        await refreshPairedDevices();
      }
      
      return info;
    } catch (err) {
      setError(`Failed to get device info: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  }, [connectionState, connectedDevice, refreshPairedDevices]);

  const getDeviceStatus = useCallback(async (): Promise<GentlyDeviceStatus | null> => {
    try {
      if (connectionState !== GentlyConnectionState.CONNECTED) {
        throw new Error('No device connected');
      }
      
      return await gentlyBluetoothService.getDeviceStatus();
    } catch (err) {
      setError(`Failed to get device status: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  }, [connectionState]);

  const deleteDevice = useCallback(async (uniqueId: string): Promise<void> => {
    try {
      setError(null);
      console.log('Starting local-first device deletion:', uniqueId);
      
      // Use the new local-first deletion approach
      await gentlyBluetoothService.deleteDevice(uniqueId);
      
      // Refresh the device list and sync count
      await refreshPairedDevices();
      
      // If this was the connected device, clear connection state
      if (connectedDevice?.uniqueId === uniqueId) {
        setConnectedDevice(null);
        setConnectionState(GentlyConnectionState.DISCONNECTED);
      }
      
      console.log('Device deletion completed successfully (local-first)');
    } catch (err) {
      const errorMessage = `Failed to delete device: ${err instanceof Error ? err.message : 'Unknown error'}`;
      setError(errorMessage);
      console.error('Device deletion failed:', err);
      throw new Error(errorMessage);
    }
  }, [connectedDevice, refreshPairedDevices]);

  const setDeviceTime = useCallback(async (date: Date = new Date()): Promise<void> => {
    try {
      if (connectionState !== GentlyConnectionState.CONNECTED) {
        throw new Error('No device connected');
      }
      
      await gentlyBluetoothService.setTime(date);
    } catch (err) {
      setError(`Failed to set device time: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err;
    }
  }, [connectionState]);

  const syncWithCloud = useCallback(async (trpcClient: any): Promise<{ success: boolean; syncedCount: number; failedCount: number }> => {
    try {
      setError(null);
      console.log('Starting cloud sync...');
      
      const result = await gentlyDeviceSyncService.syncWithCloud(trpcClient);
      
      // Refresh the device list and sync count after sync
      await refreshPairedDevices();
      
      console.log(`Cloud sync completed: ${result.syncedOperations.length} synced, ${result.failedOperations.length} failed`);
      
      return {
        success: result.success,
        syncedCount: result.syncedOperations.length,
        failedCount: result.failedOperations.length,
      };
    } catch (err) {
      const errorMessage = `Cloud sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      setError(errorMessage);
      console.error('Cloud sync failed:', err);
      throw new Error(errorMessage);
    }
  }, [refreshPairedDevices]);

  const getPendingSyncCount = useCallback(async (): Promise<number> => {
    try {
      const count = await gentlyDeviceSyncService.getPendingOperationsCount();
      setPendingSyncCount(count);
      return count;
    } catch (err) {
      console.error('Failed to get pending sync count:', err);
      return pendingSyncCount;
    }
  }, [pendingSyncCount]);

  return {
    // State
    connectionState,
    discoveredDevices,
    pairedDevices,
    connectedDevice,
    isScanning,
    error,
    pendingSyncCount,

    // Actions
    startScan,
    stopScan,
    connectToDevice,
    disconnectDevice,
    refreshPairedDevices,
    removePairedDevice,
    deleteDevice,

    // Device operations
    getDeviceInfo,
    getDeviceStatus,
    setDeviceTime,

    // Sync operations
    syncWithCloud,
    getPendingSyncCount,
  };
};
