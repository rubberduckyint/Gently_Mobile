import { BleManager, Device, State, BleError, ScanMode } from 'react-native-ble-plx';
import * as Location from 'expo-location';
import { Platform, PermissionsAndroid, Alert } from 'react-native';

export type BluetoothDevice = {
  id: string;
  name: string;
  rssi: number;
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class BluetoothService {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private scanSubscription: any = null;

  // Gently device service and characteristic UUIDs
  // These would be provided by your hardware team
  private readonly GENTLY_SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
  private readonly DEVICE_INFO_CHAR_UUID = "12345678-1234-1234-1234-123456789abd";
  private readonly BATTERY_CHAR_UUID = "12345678-1234-1234-1234-123456789abe";

  constructor() {
    this.manager = new BleManager();
  }

  /**
   * Initialize the Bluetooth service and request necessary permissions
   */
  async initialize(): Promise<boolean> {
    try {
      // Request permissions
      const hasPermissions = await this.requestPermissions();
      if (!hasPermissions) {
        throw new Error('Bluetooth permissions not granted');
      }

      // Check if Bluetooth is enabled
      const state = await this.manager.state();
      if (state !== State.PoweredOn) {
        throw new Error('Bluetooth is not enabled. Please enable Bluetooth and try again.');
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize Bluetooth service:', error);
      return false;
    }
  }

  /**
   * Request all necessary permissions for Bluetooth scanning and connection
   */
  private async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        // Request location permission (required for BLE scanning on Android)
        const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
        if (locationStatus !== 'granted') {
          Alert.alert(
            'Location Permission Required',
            'Location permission is required to scan for Bluetooth devices on Android.'
          );
          return false;
        }

        // Request Bluetooth permissions for Android 12+
        if (Platform.Version >= 31) {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);

          const allPermissionsGranted = Object.values(granted).every(
            permission => permission === PermissionsAndroid.RESULTS.GRANTED
          );

          if (!allPermissionsGranted) {
            Alert.alert(
              'Bluetooth Permissions Required',
              'Bluetooth permissions are required to connect to your Gently device.'
            );
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Start scanning for Gently devices
   */
  async startScan(
    onDeviceFound: (device: BluetoothDevice) => void,
    onError: (error: string) => void
  ): Promise<void> {
    try {
      // Stop any existing scan
      await this.stopScan();

      // Initialize if not already done
      const initialized = await this.initialize();
      if (!initialized) {
        onError('Failed to initialize Bluetooth');
        return;
      }

      console.log('Starting BLE scan for Gently devices...');

      // Start scanning for devices
      this.scanSubscription = this.manager.startDeviceScan(
        null, // Service UUIDs to scan for (null = scan for all)
        {
          allowDuplicates: false,
          scanMode: ScanMode.LowLatency,
        },
        (error: BleError | null, device: Device | null) => {
          if (error) {
            console.error('Scan error:', error);
            onError(`Scan failed: ${error.message}`);
            return;
          }

          if (device && this.isGentlyDevice(device)) {
            console.log('Found Gently device:', device.name, device.id);
            
            onDeviceFound({
              id: device.id,
              name: device.name || 'Gently',
              rssi: device.rssi || -100,
            });
          }
        }
      );

      // Stop scanning after 30 seconds to preserve battery
      setTimeout(() => {
        this.stopScan();
      }, 30000);

    } catch (error) {
      console.error('Failed to start scan:', error);
      onError('Failed to start scanning for devices');
    }
  }

  /**
   * Stop scanning for devices
   */
  async stopScan(): Promise<void> {
    try {
      if (this.scanSubscription) {
        this.manager.stopDeviceScan();
        this.scanSubscription = null;
        console.log('Stopped BLE scan');
      }
    } catch (error) {
      console.error('Error stopping scan:', error);
    }
  }

  /**
   * Connect to a specific device
   */
  async connectToDevice(deviceId: string): Promise<Device> {
    try {
      console.log('Attempting to connect to device:', deviceId);

      // Connect to the device
      const device = await this.manager.connectToDevice(deviceId);
      
      // Discover services and characteristics
      await device.discoverAllServicesAndCharacteristics();
      
      this.connectedDevice = device;
      
      console.log('Successfully connected to device:', device.name);
      
      // Verify it's a Gently device by reading device info
      await this.verifyGentlyDevice(device);
      
      return device;
    } catch (error) {
      console.error('Failed to connect to device:', error);
      throw new Error(`Failed to connect to device: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Disconnect from the currently connected device
   */
  async disconnectDevice(): Promise<void> {
    try {
      if (this.connectedDevice) {
        await this.manager.cancelDeviceConnection(this.connectedDevice.id);
        this.connectedDevice = null;
        console.log('Disconnected from device');
      }
    } catch (error) {
      console.error('Error disconnecting device:', error);
    }
  }

  /**
   * Read device information from a connected Gently device
   */
  async getDeviceInfo(): Promise<{ serialNumber: string; firmwareVersion: string; batteryLevel: number }> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }

    try {
      // Read device information characteristic
      const deviceInfoCharacteristic = await this.connectedDevice.readCharacteristicForService(
        this.GENTLY_SERVICE_UUID,
        this.DEVICE_INFO_CHAR_UUID
      );

      // Read battery level characteristic  
      const batteryCharacteristic = await this.connectedDevice.readCharacteristicForService(
        this.GENTLY_SERVICE_UUID,
        this.BATTERY_CHAR_UUID
      );

      // Decode the base64 values (this would depend on your device's data format)
      const deviceInfoData = this.decodeDeviceInfo(deviceInfoCharacteristic.value);
      const batteryLevel = this.decodeBatteryLevel(batteryCharacteristic.value);

      return {
        serialNumber: deviceInfoData.serialNumber,
        firmwareVersion: deviceInfoData.firmwareVersion,
        batteryLevel,
      };
    } catch (error) {
      console.error('Failed to read device info:', error);
      // For demo purposes, return mock data if reading fails
      return {
        serialNumber: `GEN-${Date.now().toString().slice(-6)}`,
        firmwareVersion: '1.0.0',
        batteryLevel: 85,
      };
    }
  }

  /**
   * Check if a discovered device is a Gently device
   */
  private isGentlyDevice(device: Device): boolean {
    // Check device name
    if (device.name && device.name.toLowerCase().includes('gently')) {
      return true;
    }

    // You could also check for specific service UUIDs advertised by the device
    // if (device.serviceUUIDs && device.serviceUUIDs.includes(this.GENTLY_SERVICE_UUID)) {
    //   return true;
    // }

    return false;
  }

  /**
   * Verify that a connected device is actually a Gently device
   */
  private async verifyGentlyDevice(device: Device): Promise<void> {
    try {
      // Try to read the device info characteristic
      // If this fails, it's likely not a Gently device
      const services = await device.services();
      const hasGentlyService = services.some(service => 
        service.uuid.toLowerCase() === this.GENTLY_SERVICE_UUID.toLowerCase()
      );

      if (!hasGentlyService) {
        console.warn('Connected device does not appear to be a Gently device');
        // For demo purposes, we'll continue anyway
        // In production, you might want to throw an error here
      }
    } catch (error) {
      console.warn('Could not verify Gently device:', error);
      // For demo purposes, continue anyway
    }
  }

  /**
   * Decode device information from characteristic value
   */
  private decodeDeviceInfo(base64Value: string | null): { serialNumber: string; firmwareVersion: string } {
    if (!base64Value) {
      return { serialNumber: 'Unknown', firmwareVersion: 'Unknown' };
    }

    try {
      // This would depend on your device's data format
      // For now, return mock data
      return {
        serialNumber: `GEN-${Date.now().toString().slice(-6)}`,
        firmwareVersion: '1.0.0',
      };
    } catch (error) {
      console.error('Failed to decode device info:', error);
      return { serialNumber: 'Unknown', firmwareVersion: 'Unknown' };
    }
  }

  /**
   * Decode battery level from characteristic value
   */
  private decodeBatteryLevel(base64Value: string | null): number {
    if (!base64Value) {
      return 0;
    }

    try {
      // Decode base64 to get battery level
      // This would depend on your device's data format
      // For now, return a random battery level between 70-100%
      return Math.floor(Math.random() * 30) + 70;
    } catch (error) {
      console.error('Failed to decode battery level:', error);
      return 0;
    }
  }

  /**
   * Get the current Bluetooth state
   */
  async getBluetoothState(): Promise<State> {
    return await this.manager.state();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopScan();
    this.disconnectDevice();
    this.manager.destroy();
  }
}

// Export a singleton instance
export const bluetoothService = new BluetoothService();
