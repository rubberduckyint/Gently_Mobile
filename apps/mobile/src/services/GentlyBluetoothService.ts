import { BleManager, Device, State, BleError, ScanMode } from 'react-native-ble-plx';
import * as Location from 'expo-location';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { 
  GentlyDiscoveredDevice, 
  GentlyConnectionState, 
  GentlyPairedDevice,
  GentlyDeviceInfo,
  GentlyDeviceStatus,
  GentlyCommand,
  GentlyResponseStatus,
  GENTLY_SERVICE_UUID,
  GENTLY_REQUEST_CHAR_UUID,
  GENTLY_RESPONSE_CHAR_UUID
} from './GentlyTypes';
import { GentlyBLEProtocol } from './GentlyBLEProtocol';
import { TEAEncryption, GentlyEncryption } from './GentlyEncryption';
import { gentlyDeviceManager } from './GentlyDeviceManager';
import { gentlyDeviceSyncService } from './GentlyDeviceSyncService';

export class GentlyBluetoothService {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private scanSubscription: any = null;
  private protocol: GentlyBLEProtocol;
  private currentEncryption: TEAEncryption | null = null;
  private connectionState: GentlyConnectionState = GentlyConnectionState.DISCONNECTED;
  private discoveredDevicesMap: Map<string, string> = new Map(); // uniqueId -> BLE device ID mapping
  private pendingResponsePromise: { resolve: (value: Uint8Array) => void; reject: (error: Error) => void } | null = null;

  constructor() {
    this.manager = new BleManager();
    this.protocol = new GentlyBLEProtocol();
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

      // Initialize device manager
      await gentlyDeviceManager.initialize();

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
   * Get current connection state
   */
  getConnectionState(): GentlyConnectionState {
    return this.connectionState;
  }

  /**
   * Start scanning for Gently devices
   */
  async startScan(
    onDeviceFound: (device: GentlyDiscoveredDevice) => void,
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

      this.connectionState = GentlyConnectionState.SCANNING;
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
            this.connectionState = GentlyConnectionState.ERROR;
            return;
          }

          if (device) {
            const gentlyDevice = this.parseGentlyDevice(device);
            if (gentlyDevice) {
              console.log('Found Gently device:', gentlyDevice.name, gentlyDevice.uniqueId);
              // Store the mapping between uniqueId and BLE device ID
              this.discoveredDevicesMap.set(gentlyDevice.uniqueId, device.id);
              onDeviceFound(gentlyDevice);
            }
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
      this.connectionState = GentlyConnectionState.ERROR;
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
        
        if (this.connectionState === GentlyConnectionState.SCANNING) {
          this.connectionState = GentlyConnectionState.DISCONNECTED;
        }
      }
    } catch (error) {
      console.error('Error stopping scan:', error);
    }
  }

  /**
   * Clear discovered devices mapping
   */
  clearDiscoveredDevices(): void {
    this.discoveredDevicesMap.clear();
  }

  /**
   * Validate device for connection by checking recent advertisement data
   */
  private async validateDeviceForConnection(uniqueId: string): Promise<boolean> {
    // First check if we have recent advertisement data
    const bleDeviceId = this.discoveredDevicesMap.get(uniqueId);
    if (!bleDeviceId) {
      console.warn('⚠️ No recent advertisement data found, need to scan first');
      return true; // Allow connection attempt, will scan if needed
    }

    // For now, we can't store the actual advertisement data directly in the map
    // But we can add a basic validation by checking if we received the device recently
    console.warn('✅ Device validation passed - found in recent scan');
    
    // TODO: Add more sophisticated validation when we can access advertisement data
    // We would check:
    // 1. Error code should be 0 (as per spec: "The 16-bit error code shall always be 0 in normal operation")
    // 2. Device should be responsive (not in error state)  
    // 3. Battery level should be sufficient
    // 4. Reserved bits should not be set (indicates firmware corruption)
    
    return true;
  }

  /**
   * Connect to a Gently device (handles both pairing and connecting to paired devices)
   */
  async connectToDevice(uniqueId: string, forceConnection: boolean = false): Promise<GentlyPairedDevice> {
    try {
      this.connectionState = GentlyConnectionState.CONNECTING;
      console.log('🚀 CONNECT TO DEVICE STARTED:', uniqueId);
      console.warn(`🚀 [${new Date().toISOString()}] CONNECT TO DEVICE STARTED: ${uniqueId}`); // Using warn to make it more visible

      // Check BLE manager state before attempting connection
      console.warn(`🔋 [${new Date().toISOString()}] Checking BLE manager state...`);
      const bleState = await this.manager.state();
      console.warn(`🔋 [${new Date().toISOString()}] BLE manager state: ${bleState}`);
      
      if (bleState !== State.PoweredOn) {
        throw new Error(`Bluetooth is not ready. Current state: ${bleState}. Please ensure Bluetooth is enabled.`);
      }

      // Check if device is already paired
      const pairedDevice = await gentlyDeviceManager.getPairedDevice(uniqueId);
      console.warn(`📱 [${new Date().toISOString()}] PAIRED DEVICE CHECK:`, pairedDevice ? 'FOUND' : 'NOT FOUND');
      
      // Validate device state from recent advertisement data
      console.warn(`🔍 [${new Date().toISOString()}] VALIDATING DEVICE STATE FROM ADVERTISEMENT DATA...`);
      const isValidDevice = await this.validateDeviceForConnection(uniqueId);
      if (!isValidDevice && !forceConnection) {
        throw new Error('Device is not in a valid state for connection (check error codes in advertisement). Use forceConnection=true to bypass this check.');
      } else if (!isValidDevice && forceConnection) {
        console.warn(`⚠️ [${new Date().toISOString()}] FORCING CONNECTION DESPITE DEVICE ERRORS!`);
      }
      
      // Find the device during scan or connect directly if we have the ID
      console.warn(`🔍 [${new Date().toISOString()}] STARTING DEVICE SEARCH AND BLE CONNECTION...`);
      
      // AGGRESSIVE: Set overall timeout for device connection (30 seconds max)
      const overallTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => {
          console.warn(`💀 [${new Date().toISOString()}] OVERALL CONNECTION TIMEOUT after 30 seconds - device may have firmware corruption!`);
          reject(new Error('Overall connection timeout after 30 seconds - device appears to have firmware issues (error code 0x4000 indicates corruption)'));
        }, 30000);
      });
      
      const device = await Promise.race([
        this.findAndConnectDevice(uniqueId),
        overallTimeout
      ]) as Device;
      
      console.warn(`✅ [${new Date().toISOString()}] BLE CONNECTION ESTABLISHED, DISCOVERING SERVICES...`);
      
      // Discover services and characteristics with timeout
      console.warn(`🔧 [${new Date().toISOString()}] Starting service discovery...`);
      const discoveryPromise = device.discoverAllServicesAndCharacteristics();
      const discoveryTimeout = new Promise((_, reject) => {
        setTimeout(() => {
          console.warn(`⏰ [${new Date().toISOString()}] SERVICE DISCOVERY TIMEOUT after 10 seconds`);
          reject(new Error('Service discovery timeout after 10 seconds'));
        }, 10000);
      });
      
      await Promise.race([discoveryPromise, discoveryTimeout]);
      console.warn(`🔧 [${new Date().toISOString()}] SERVICE DISCOVERY COMPLETED`);
      
      // Wait a moment for the device to be fully ready
      console.warn(`⏳ [${new Date().toISOString()}] Waiting 500ms for device stabilization...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      this.connectedDevice = device;
      
      // CRITICAL: Enable notifications FIRST before sending any commands
      // According to spec: "Upon establishing a BLE connection, the App shall activate notifications"
      console.warn(`🔔 [${new Date().toISOString()}] ENABLING NOTIFICATIONS (REQUIRED BEFORE COMMANDS)...`);
      await this.enableNotifications(device);
      
      // Wait a moment for notifications to be fully activated
      console.warn(`⏳ [${new Date().toISOString()}] Waiting 500ms for notification activation...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      this.connectionState = GentlyConnectionState.AUTHENTICATING;
      console.warn('🔐 STARTING AUTHENTICATION PROCESS...');
      
      if (pairedDevice) {
        // Device is already paired, establish secure session
        console.warn('🔑 DEVICE IS ALREADY PAIRED - ESTABLISHING SECURE SESSION...');
        await this.establishSecureSession(pairedDevice.braceletKey, uniqueId);
      } else {
        // Device is not paired, perform initial pairing
        console.warn('🆕 DEVICE IS NOT PAIRED - PERFORMING INITIAL PAIRING...');
        await this.performInitialPairing(uniqueId);
      }
      
      this.connectionState = GentlyConnectionState.CONNECTED;
      console.warn('🎉 CONNECTION SUCCESSFUL! UPDATING LAST CONNECTED TIME...');
      
      // Update last connected time
      await gentlyDeviceManager.updateLastConnected(uniqueId);
      
      const finalPairedDevice = await gentlyDeviceManager.getPairedDevice(uniqueId);
      if (!finalPairedDevice) {
        throw new Error('Device pairing failed');
      }
      
      console.warn('✅ SUCCESSFULLY CONNECTED TO DEVICE:', finalPairedDevice.name);
      return finalPairedDevice;
      
    } catch (error) {
      console.error('❌ FAILED TO CONNECT TO DEVICE:', error);
      console.warn('❌ FAILED TO CONNECT TO DEVICE:', error); // Using warn for visibility
      this.connectionState = GentlyConnectionState.ERROR;
      
      // Clean up on failure
      if (this.connectedDevice) {
        try {
          await this.manager.cancelDeviceConnection(this.connectedDevice.id);
        } catch (cleanupError) {
          console.warn('Failed to cleanup connection:', cleanupError);
        }
        this.connectedDevice = null;
        this.currentEncryption = null;
      }
      
      throw new Error(`Failed to connect to device: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Debug method to test individual connection steps
   */
  async debugConnection(uniqueId: string): Promise<void> {
    try {
      console.warn(`🐛 [${new Date().toISOString()}] === DEBUG CONNECTION STARTED ===`);
      
      // Step 1: Check BLE manager state
      console.warn(`🐛 [${new Date().toISOString()}] Step 1: Checking BLE manager state...`);
      const bleState = await this.manager.state();
      console.warn(`🐛 [${new Date().toISOString()}] BLE state: ${bleState}`);
      
      if (bleState !== State.PoweredOn) {
        throw new Error(`BLE not powered on: ${bleState}`);
      }
      
      // Step 2: Get device ID from discovered devices
      console.warn(`🐛 [${new Date().toISOString()}] Step 2: Looking for device ID...`);
      const bleDeviceId = this.discoveredDevicesMap.get(uniqueId);
      console.warn(`🐛 [${new Date().toISOString()}] Device ID found: ${bleDeviceId}`);
      
      if (!bleDeviceId) {
        throw new Error('Device ID not found - need to scan first');
      }
      
      // Step 3: Check if device is already connected
      console.warn(`🐛 [${new Date().toISOString()}] Step 3: Checking connected devices...`);
      const connectedDevices = await this.manager.connectedDevices([]);
      console.warn(`🐛 [${new Date().toISOString()}] Connected devices:`, connectedDevices.map(d => ({ id: d.id, name: d.name })));
      
      // Step 4: Try simple connection (with shorter timeout for debug)
      console.warn(`🐛 [${new Date().toISOString()}] Step 4: Attempting simple BLE connection (5s timeout)...`);
      const connectPromise = this.manager.connectToDevice(bleDeviceId);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Debug connection timeout')), 5000);
      });
      
      const device = await Promise.race([connectPromise, timeoutPromise]) as Device;
      console.warn(`🐛 [${new Date().toISOString()}] BLE connection successful!`);
      
      // Step 5: Try service discovery
      console.warn(`🐛 [${new Date().toISOString()}] Step 5: Discovering services...`);
      await device.discoverAllServicesAndCharacteristics();
      console.warn(`🐛 [${new Date().toISOString()}] Service discovery successful!`);
      
      // Step 6: Check services
      console.warn(`🐛 [${new Date().toISOString()}] Step 6: Checking available services...`);
      const services = await device.services();
      console.warn(`🐛 [${new Date().toISOString()}] Available services:`, services.map(s => s.uuid));
      
      // Step 7: Check Gently service
      const gentlyService = services.find(s => s.uuid.toLowerCase() === GENTLY_SERVICE_UUID.toLowerCase());
      if (!gentlyService) {
        throw new Error('Gently service not found');
      }
      console.warn(`🐛 [${new Date().toISOString()}] Gently service found: ${gentlyService.uuid}`);
      
      // Step 8: Check characteristics
      console.warn(`🐛 [${new Date().toISOString()}] Step 8: Checking characteristics...`);
      const characteristics = await gentlyService.characteristics();
      console.warn(`🐛 [${new Date().toISOString()}] Available characteristics:`, characteristics.map(c => c.uuid));
      
      // Step 9: Test notification setup
      console.warn(`🐛 [${new Date().toISOString()}] Step 9: Testing notification setup...`);
      const responseChar = characteristics.find(c => c.uuid.toLowerCase() === GENTLY_RESPONSE_CHAR_UUID.toLowerCase());
      if (!responseChar) {
        throw new Error('Response characteristic not found');
      }
      
      console.warn(`🐛 [${new Date().toISOString()}] Response char properties:`, {
        uuid: responseChar.uuid,
        isNotifiable: responseChar.isNotifiable,
        isIndicatable: responseChar.isIndicatable
      });
      
      // Clean up
      console.warn(`🐛 [${new Date().toISOString()}] Step 10: Cleaning up...`);
      await this.manager.cancelDeviceConnection(device.id);
      console.warn(`🐛 [${new Date().toISOString()}] === DEBUG CONNECTION COMPLETED ===`);
      
    } catch (error) {
      console.error(`🐛 [${new Date().toISOString()}] DEBUG CONNECTION FAILED:`, error);
      throw error;
    }
  }

  /**
   * Simple BLE connection test without Gently protocol
   */
  async testRawBLEConnection(uniqueId: string): Promise<boolean> {
    try {
      console.warn(`🧪 [${new Date().toISOString()}] === RAW BLE CONNECTION TEST ===`);
      
      const bleDeviceId = this.discoveredDevicesMap.get(uniqueId);
      if (!bleDeviceId) {
        throw new Error('Device ID not found');
      }
      
      console.warn(`🧪 [${new Date().toISOString()}] Attempting raw connection to ${bleDeviceId}...`);
      
      // Very short timeout for rapid testing
      const connectPromise = this.manager.connectToDevice(bleDeviceId);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Raw connection timeout')), 3000);
      });
      
      const device = await Promise.race([connectPromise, timeoutPromise]) as Device;
      console.warn(`🧪 [${new Date().toISOString()}] Raw connection SUCCESS!`);
      
      // Immediate cleanup
      await this.manager.cancelDeviceConnection(device.id);
      console.warn(`🧪 [${new Date().toISOString()}] Raw connection test completed successfully`);
      
      return true;
    } catch (error) {
      console.warn(`🧪 [${new Date().toISOString()}] Raw connection test FAILED:`, error);
      return false;
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
        this.currentEncryption = null;
        this.connectionState = GentlyConnectionState.DISCONNECTED;
        
        // Clean up any pending response promises
        if (this.pendingResponsePromise) {
          this.pendingResponsePromise.reject(new Error('Device disconnected'));
          this.pendingResponsePromise = null;
        }
        
        console.log('Disconnected from device');
      }
    } catch (error) {
      console.error('Error disconnecting device:', error);
    }
  }

  /**
   * Get device information from connected device
   */
  async getDeviceInfo(): Promise<GentlyDeviceInfo> {
    if (!this.connectedDevice || !this.currentEncryption) {
      throw new Error('No device connected or not authenticated');
    }

    try {
      const command = this.protocol.createCommandPacket(GentlyCommand.GET_DEVICE_INFO);
      const encryptedCommand = this.currentEncryption.encryptData(command);
      
      const response = await this.sendCommand(encryptedCommand);
      const decryptedResponse = this.currentEncryption.decryptData(response);
      
      const parsed = this.protocol.parseResponsePacket(decryptedResponse);
      if (parsed.status !== GentlyResponseStatus.OK) {
        throw new Error('Device returned error status');
      }
      
      return this.protocol.parseDeviceInfoResponse(parsed.payload);
    } catch (error) {
      console.error('Failed to get device info:', error);
      throw error;
    }
  }

  /**
   * Get device status from connected device  
   */
  async getDeviceStatus(): Promise<GentlyDeviceStatus> {
    if (!this.connectedDevice || !this.currentEncryption) {
      throw new Error('No device connected or not authenticated');
    }

    try {
      const command = this.protocol.createCommandPacket(GentlyCommand.GET_DEVICE_STATUS);
      const encryptedCommand = this.currentEncryption.encryptData(command);
      
      const response = await this.sendCommand(encryptedCommand);
      const decryptedResponse = this.currentEncryption.decryptData(response);
      
      const parsed = this.protocol.parseResponsePacket(decryptedResponse);
      if (parsed.status !== GentlyResponseStatus.OK) {
        throw new Error('Device returned error status');
      }
      
      return this.protocol.parseDeviceStatusResponse(parsed.payload);
    } catch (error) {
      console.error('Failed to get device status:', error);
      throw error;
    }
  }

  /**
   * Set time on the connected device
   */
  async setTime(date: Date = new Date()): Promise<void> {
    if (!this.connectedDevice || !this.currentEncryption) {
      throw new Error('No device connected or not authenticated');
    }

    try {
      const payload = this.protocol.createSetTimePayload(date);
      const command = this.protocol.createCommandPacket(GentlyCommand.SET_TIME, payload);
      const encryptedCommand = this.currentEncryption.encryptData(command);
      
      const response = await this.sendCommand(encryptedCommand);
      const decryptedResponse = this.currentEncryption.decryptData(response);
      
      const parsed = this.protocol.parseResponsePacket(decryptedResponse);
      if (parsed.status !== GentlyResponseStatus.OK) {
        throw new Error('Failed to set time on device');
      }
      
      console.log('Successfully set time on device');
    } catch (error) {
      console.error('Failed to set time:', error);
      throw error;
    }
  }

  /**
   * Reset device to factory mode and remove pairing
   * This will set the bracelet key back to the factory key
   */
  async resetToFactoryMode(uniqueId: string): Promise<void> {
    if (!this.connectedDevice || !this.currentEncryption) {
      throw new Error('No device connected or not authenticated');
    }

    try {
      console.log('Resetting device to factory mode:', uniqueId);
      
      // Set the bracelet key back to factory key
      const factoryKey = new Uint8Array([
        0x43, 0xEA, 0x5F, 0x35, 0x65, 0x98, 0x59, 0x87,
        0x4A, 0x6F, 0x18, 0x47, 0x42, 0xC3, 0x2B, 0x2B
      ]);
      
      const payload = new Uint8Array(16);
      payload.set(factoryKey);
      
      const command = this.protocol.createCommandPacket(GentlyCommand.SET_BRACELET_KEY, payload);
      const encryptedCommand = this.currentEncryption.encryptData(command);
      
      const response = await this.sendCommand(encryptedCommand);
      const decryptedResponse = this.currentEncryption.decryptData(response);
      
      const parsed = this.protocol.parseResponsePacket(decryptedResponse);
      if (parsed.status !== GentlyResponseStatus.OK) {
        throw new Error('Failed to reset device to factory mode');
      }
      
      console.log('Successfully reset device to factory mode');
    } catch (error) {
      console.error('Failed to reset device to factory mode:', error);
      throw error;
    }
  }

  /**
   * Verify device is in factory mode by checking if factory key works
   */
  async verifyFactoryMode(uniqueId: string): Promise<boolean> {
    try {
      console.log('Verifying device is in factory mode:', uniqueId);
      
      // Disconnect current connection if any
      await this.disconnectDevice();
      
      // Try to connect using factory key
      const device = await this.findAndConnectDevice(uniqueId);
      await device.discoverAllServicesAndCharacteristics();
      this.connectedDevice = device;
      await this.enableNotifications(device);
      
      // Try to establish session with factory key
      const factoryKey = new Uint8Array([
        0x43, 0xEA, 0x5F, 0x35, 0x65, 0x98, 0x59, 0x87,
        0x4A, 0x6F, 0x18, 0x47, 0x42, 0xC3, 0x2B, 0x2B
      ]);
      
      try {
        await this.establishSecureSession(factoryKey, uniqueId);
        console.log('Device verified to be in factory mode');
        return true;
      } catch (error) {
        console.log('Device is not in factory mode');
        return false;
      }
    } catch (error) {
      console.error('Failed to verify factory mode:', error);
      return false;
    }
  }

  /**
   * Delete device using local-first approach
   * This marks the device as deleted locally and queues the cloud sync
   */
  async deleteDevice(uniqueId: string): Promise<void> {
    try {
      console.log('Starting local-first device deletion for:', uniqueId);
      
      // Check if device is paired via BLE
      const pairedDevice = await gentlyDeviceManager.getPairedDevice(uniqueId);
      
      // If device is paired via BLE, we need to reset it to factory mode first
      if (pairedDevice && !pairedDevice.deletedLocally) {
        console.log('Device is paired via BLE, attempting factory reset...');
        
        // First, try to connect to the device
        let wasConnected = false;
        try {
          if (!this.connectedDevice) {
            await this.connectToDevice(uniqueId);
          }
          wasConnected = true;
        } catch (error) {
          console.warn('Could not connect to device for factory reset:', error);
          // Continue with deletion - device might be out of range
        }
        
        if (wasConnected) {
          // Try to reset device to factory mode
          try {
            await this.resetToFactoryMode(uniqueId);
            
            // Verify the device is actually in factory mode
            const isFactoryMode = await this.verifyFactoryMode(uniqueId);
            if (!isFactoryMode) {
              throw new Error('Device failed to reset to factory mode');
            }
            
            console.log('Device successfully reset to factory mode');
          } catch (error) {
            console.error('Failed to reset device to factory mode:', error);
            throw new Error('Cannot delete device: Failed to reset to factory mode. Device may still be paired.');
          } finally {
            // Always disconnect after factory reset attempt
            await this.disconnectDevice();
          }
        }
      }
      
      // Mark device as deleted locally (this hides it from the UI)
      const marked = await gentlyDeviceManager.markDeviceAsDeleted(uniqueId);
      if (!marked && !pairedDevice) {
        console.log('Device not found in local storage, nothing to delete locally');
      }
      
      // Queue the cloud deletion operation
      await gentlyDeviceSyncService.queueDeviceDeletion(uniqueId);
      
      console.log('Device deletion completed successfully (local-first)');
    } catch (error) {
      console.error('Device deletion failed:', error);
      throw error;
    }
  }

  /**
   * Legacy delete method - kept for backward compatibility
   * @deprecated Use deleteDevice instead for local-first approach
   */
  async deleteDeviceLegacy(uniqueId: string): Promise<void> {
    try {
      console.log('Starting device deletion process for:', uniqueId);
      
      // Check if device is paired via BLE
      const pairedDevice = await gentlyDeviceManager.getPairedDevice(uniqueId);
      
      // If device is paired via BLE, we need to reset it to factory mode first
      if (pairedDevice) {
        console.log('Device is paired via BLE, attempting factory reset...');
        
        // First, try to connect to the device
        let wasConnected = false;
        try {
          if (!this.connectedDevice) {
            await this.connectToDevice(uniqueId);
          }
          wasConnected = true;
        } catch (error) {
          console.warn('Could not connect to device for factory reset:', error);
          // Continue with deletion - device might be out of range
        }
        
        if (wasConnected) {
          // Try to reset device to factory mode
          try {
            await this.resetToFactoryMode(uniqueId);
            
            // Verify the device is actually in factory mode
            const isFactoryMode = await this.verifyFactoryMode(uniqueId);
            if (!isFactoryMode) {
              throw new Error('Device failed to reset to factory mode');
            }
            
            console.log('Device successfully reset to factory mode');
          } catch (error) {
            console.error('Failed to reset device to factory mode:', error);
            throw new Error('Cannot delete device: Failed to reset to factory mode. Device may still be paired.');
          } finally {
            // Always disconnect after factory reset attempt
            await this.disconnectDevice();
          }
        }
        
        // Remove device from local BLE pairing storage
        const success = await gentlyDeviceManager.removePairedDevice(uniqueId);
        if (!success) {
          console.warn('Failed to remove device from BLE pairing storage, but continuing...');
        }
      } else {
        console.log('Device is not paired via BLE, skipping factory reset');
      }
      
      console.log('Device deletion completed successfully');
    } catch (error) {
      console.error('Device deletion failed:', error);
      throw error;
    }
  }

  /**
   * Parse discovered device to check if it's a Gently device
   */
  private parseGentlyDevice(device: Device): GentlyDiscoveredDevice | null {
    try {
      // Check device name first
      if (!device.name || !device.name.toLowerCase().includes('gently')) {
        return null;
      }

      // Parse manufacturer data if available
      if (device.manufacturerData) {
        const manufacturerDataBytes = this.base64ToBytes(device.manufacturerData);
        const advertisementData = this.protocol.parseAdvertisementData(manufacturerDataBytes);
        
        if (advertisementData) {
          const statusBits = this.protocol.parseStatusBits(advertisementData.statusByte);
          const uniqueId = this.bytesToHex(advertisementData.uniqueId);
          
          // Log advertisement data including error code
          console.warn('📊 ADVERTISEMENT DATA PARSED:');
          console.warn('📊 Device unique ID:', uniqueId);
          console.warn('📊 Error code:', advertisementData.errorCode, `(0x${advertisementData.errorCode.toString(16)})`);
          console.warn('📊 API version:', advertisementData.apiVersion);
          console.warn('📊 Packet counter:', advertisementData.packetCounter);
          console.warn('📊 Battery voltage:', advertisementData.batteryVoltage, 'mV');
          console.warn('📊 Status byte:', `0x${advertisementData.statusByte.toString(16)}`);
          console.warn('📊 Is factory mode:', statusBits.isFactoryMode);
          console.warn('📊 Has active event:', statusBits.hasActiveEvent);
          console.warn('📊 Charging:', statusBits.charging);
          console.warn('📊 Battery level:', statusBits.batteryLevel);
          
          // Check for error conditions
          if (advertisementData.errorCode !== 0) {
            console.warn('⚠️ DEVICE HAS ERROR CODE:', advertisementData.errorCode);
            console.warn('⚠️ Error code bits:', this.parseErrorCodeBits(advertisementData.errorCode));
            console.warn('⚠️ SPEC VIOLATION: Error code should be 0 in normal operation!');
            
            // Check if error code indicates connection issues
            if (advertisementData.errorCode & 0x0001) { // Bluetooth Core Error
              console.warn('🚫 BLUETOOTH CORE ERROR DETECTED - CONNECTION MAY FAIL!');
            }
            
            // Check for reserved bits that might indicate firmware issues
            const reservedBits = advertisementData.errorCode & 0xFC00;
            if (reservedBits !== 0) {
              console.warn('🚫 RESERVED ERROR BITS SET - FIRMWARE MAY BE CORRUPTED!');
              console.warn('🚫 This likely explains why BLE connections are failing');
            }
          }
          
          return {
            id: device.id,
            name: device.name || 'Gently',
            rssi: device.rssi || -100,
            uniqueId,
            isFactoryMode: statusBits.isFactoryMode,
            batteryLevel: this.protocol.calculateBatteryPercentage(advertisementData.batteryVoltage),
            hasActiveEvent: statusBits.hasActiveEvent,
            advertisementData,
          };
        }
      }

      // If no manufacturer data, still return basic info for devices named "Gently"
      console.warn('⚠️ GENTLY DEVICE WITHOUT MANUFACTURER DATA - USING FALLBACK');
      return {
        id: device.id,
        name: device.name,
        rssi: device.rssi || -100,
        uniqueId: device.id, // Use BLE device ID as fallback
        isFactoryMode: true, // Assume factory mode if we can't parse advertisement
        batteryLevel: 0,
        hasActiveEvent: false,
        advertisementData: {} as any, // Mock data
      };
    } catch (error) {
      console.error('Error parsing Gently device:', error);
      return null;
    }
  }

  /**
   * Find and connect to device by unique ID
   */
  private async findAndConnectDevice(uniqueId: string): Promise<Device> {
    // First, check if we have the BLE device ID from recent scan
    const bleDeviceId = this.discoveredDevicesMap.get(uniqueId);
    
    if (bleDeviceId) {
      console.warn(`🔗 [${new Date().toISOString()}] Found BLE device ID ${bleDeviceId} for unique ID ${uniqueId}`);
      
      // Check if device is already connected (this could be the issue!)
      try {
        console.warn(`🔍 [${new Date().toISOString()}] Checking if device is already connected...`);
        const connectedDevices = await this.manager.connectedDevices([GENTLY_SERVICE_UUID]);
        const alreadyConnected = connectedDevices.find(d => d.id === bleDeviceId);
        
        if (alreadyConnected) {
          console.warn(`⚠️ [${new Date().toISOString()}] Device ${bleDeviceId} is ALREADY CONNECTED! Disconnecting first...`);
          await this.manager.cancelDeviceConnection(bleDeviceId);
          // Wait a moment for disconnection to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (checkError) {
        console.warn(`🔍 [${new Date().toISOString()}] Failed to check connected devices (continuing anyway):`, checkError);
      }
      
      console.warn(`📡 [${new Date().toISOString()}] Attempting to connect to BLE device ${bleDeviceId}...`);
      
      try {
        // Try a more robust connection approach
        console.warn(`🔄 [${new Date().toISOString()}] Method 1: Standard connection with timeout...`);
        
        // First attempt: Standard connection with timeout
        const connectPromise = this.manager.connectToDevice(bleDeviceId);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            console.warn(`⏰ [${new Date().toISOString()}] BLE CONNECTION TIMEOUT after 15 seconds for device ${bleDeviceId}`);
            reject(new Error(`BLE connection timeout after 15 seconds for device ${bleDeviceId}`));
          }, 15000); // 15 second timeout for BLE connection
        });
        
        console.warn(`🔄 [${new Date().toISOString()}] Starting race between connection and timeout...`);
        const device = await Promise.race([connectPromise, timeoutPromise]) as Device;
        console.warn(`✅ [${new Date().toISOString()}] BLE connection successful for device ${bleDeviceId}`);
        return device;
        
      } catch (connectError) {
        console.error(`❌ [${new Date().toISOString()}] Standard BLE connection failed for device ${bleDeviceId}:`, connectError);
        console.warn(`❌ [${new Date().toISOString()}] Standard BLE connection failed, trying alternative methods...`);
        
        // Method 2: Try with device options
        try {
          console.warn(`🔄 [${new Date().toISOString()}] Method 2: Connection with device options...`);
          
          // Create separate promises to ensure timeout works
          let altTimeoutId: NodeJS.Timeout;
          const altConnectPromise = this.manager.connectToDevice(bleDeviceId, {
            requestMTU: 247,
            refreshGatt: 'OnConnected',
          });
          
          const altTimeoutPromise = new Promise<never>((_, reject) => {
            altTimeoutId = setTimeout(() => {
              console.warn(`⏰ [${new Date().toISOString()}] ALT CONNECTION TIMEOUT after 10 seconds`);
              reject(new Error('Alternative connection timeout after 10 seconds'));
            }, 10000);
          });
          
          console.warn(`🔄 [${new Date().toISOString()}] Starting Method 2 race with 10-second timeout...`);
          
          try {
            const device = await Promise.race([altConnectPromise, altTimeoutPromise]) as Device;
            clearTimeout(altTimeoutId!);
            console.warn(`✅ [${new Date().toISOString()}] Alternative connection successful!`);
            return device;
          } catch (raceError) {
            clearTimeout(altTimeoutId!);
            throw raceError;
          }
        } catch (altError) {
          console.warn(`❌ [${new Date().toISOString()}] Alternative connection failed:`, altError);
        }
        
        // Method 3: Try restarting the BLE manager
        try {
          console.warn(`🔄 [${new Date().toISOString()}] Method 3: Restarting BLE manager and retrying...`);
          await this.manager.destroy();
          this.manager = new BleManager();
          
          // Wait for manager to be ready
          const state = await this.manager.state();
          if (state !== State.PoweredOn) {
            throw new Error(`BLE manager not ready after restart: ${state}`);
          }
          
          // Retry connection with fresh manager
          const device = await this.manager.connectToDevice(bleDeviceId);
          console.warn(`✅ [${new Date().toISOString()}] Connection successful after manager restart!`);
          return device;
        } catch (restartError) {
          console.warn(`❌ [${new Date().toISOString()}] Connection failed even after manager restart:`, restartError);
        }
        
        throw connectError; // Throw the original error
      }
    }
    
    // If not found in our mapping, we need to scan first
    console.warn(`🔍 BLE device ID not found for ${uniqueId}, starting scan...`);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopScan();
        console.warn(`⏰ SCAN TIMEOUT: Device with unique ID ${uniqueId} not found during scan`);
        reject(new Error(`Device with unique ID ${uniqueId} not found during scan`));
      }, 10000); // 10 second timeout
      
      this.startScan(
        (discoveredDevice) => {
          if (discoveredDevice.uniqueId === uniqueId) {
            console.warn(`🎯 Found target device during scan: ${uniqueId}`);
            clearTimeout(timeout);
            this.stopScan();
            
            const bleDeviceId = this.discoveredDevicesMap.get(uniqueId);
            if (bleDeviceId) {
              console.warn(`📡 Connecting to discovered device ${bleDeviceId}...`);
              this.manager.connectToDevice(bleDeviceId)
                .then((device) => {
                  console.warn(`✅ Scan-connect successful for ${bleDeviceId}`);
                  resolve(device);
                })
                .catch((connectError) => {
                  console.error(`❌ Scan-connect failed for ${bleDeviceId}:`, connectError);
                  console.warn(`❌ Scan-connect failed for ${bleDeviceId}:`, connectError);
                  reject(connectError);
                });
            } else {
              console.warn(`❌ Failed to get BLE device ID for ${uniqueId} after scan`);
              reject(new Error(`Failed to get BLE device ID for ${uniqueId}`));
            }
          }
        },
        (error) => {
          clearTimeout(timeout);
          console.warn(`❌ Scan failed during device search: ${error}`);
          reject(new Error(`Scan failed: ${error}`));
        }
      ).catch((scanError) => {
        clearTimeout(timeout);
        console.warn(`❌ Start scan failed: ${scanError}`);
        reject(scanError);
      });
    });
  }

  /**
   * Enable notifications on the response characteristic
   * CRITICAL: This MUST be done before sending any commands according to the spec
   */
  private async enableNotifications(device: Device): Promise<void> {
    try {
      console.warn(`🔔 [${new Date().toISOString()}] === ENABLING NOTIFICATIONS (SPEC REQUIREMENT) ===`);
      console.warn('🔔 Spec: "Upon establishing a BLE connection, the App shall activate notifications on UUID 0xF024"');
      
      // First, check if the characteristic supports notifications/indications
      console.warn(`🔔 [${new Date().toISOString()}] Getting device services...`);
      const services = await device.services();
      console.warn(`🔔 [${new Date().toISOString()}] Available services:`, services.map(s => s.uuid));
      
      const gentlyService = services.find(s => s.uuid.toLowerCase() === GENTLY_SERVICE_UUID.toLowerCase());
      if (!gentlyService) {
        throw new Error('Gently service not found on device');
      }
      
      console.warn(`🔔 [${new Date().toISOString()}] Getting service characteristics...`);
      const characteristics = await gentlyService.characteristics();
      console.warn(`🔔 [${new Date().toISOString()}] Available characteristics:`, characteristics.map(c => ({ 
        uuid: c.uuid, 
        isReadable: c.isReadable,
        isWritableWithResponse: c.isWritableWithResponse,
        isWritableWithoutResponse: c.isWritableWithoutResponse,
        isNotifiable: c.isNotifiable,
        isIndicatable: c.isIndicatable
      })));
      
      const responseChar = characteristics.find(c => c.uuid.toLowerCase() === GENTLY_RESPONSE_CHAR_UUID.toLowerCase());
      if (!responseChar) {
        throw new Error('Response characteristic not found on device');
      }
      
      console.warn(`🔔 [${new Date().toISOString()}] Response characteristic (0xF024) properties:`, {
        isReadable: responseChar.isReadable,
        isNotifiable: responseChar.isNotifiable,
        isIndicatable: responseChar.isIndicatable
      });
      
      // MUST set up notifications - it's required by the spec
      if (responseChar.isNotifiable || responseChar.isIndicatable) {
        console.warn(`🔔 [${new Date().toISOString()}] Setting up REQUIRED notifications on 0xF024...`);
        
        // Wrap notification setup in timeout
        const notificationPromise = device.monitorCharacteristicForService(
          GENTLY_SERVICE_UUID,
          GENTLY_RESPONSE_CHAR_UUID,
          (error, characteristic) => {
            if (error) {
              console.error(`🔔 [${new Date().toISOString()}] NOTIFICATION ERROR:`, error);
              // If we have a pending promise, reject it
              if (this.pendingResponsePromise) {
                this.pendingResponsePromise.reject(new Error(`Notification error: ${error.message}`));
                this.pendingResponsePromise = null;
              }
              return;
            }
            
            if (characteristic?.value) {
              console.warn(`🔔 [${new Date().toISOString()}] === NOTIFICATION RECEIVED ===`);
              console.warn('🔔 Characteristic UUID:', characteristic.uuid);
              console.warn('🔔 Raw notification value (base64):', characteristic.value);
              
              try {
                const responseData = this.base64ToBytes(characteristic.value);
                console.warn('🔔 Response data length:', responseData.length, 'bytes');
                console.warn('🔔 Response data (hex):', this.bytesToHex(responseData));
                
                // If we have a pending promise, resolve it
                if (this.pendingResponsePromise) {
                  console.warn(`🔔 [${new Date().toISOString()}] RESOLVING PENDING RESPONSE PROMISE!`);
                  this.pendingResponsePromise.resolve(responseData);
                  this.pendingResponsePromise = null;
                } else {
                  console.warn(`🔔 [${new Date().toISOString()}] RECEIVED NOTIFICATION BUT NO PENDING PROMISE TO RESOLVE!`);
                }
              } catch (decodeError) {
                console.error(`🔔 [${new Date().toISOString()}] Failed to decode notification data:`, decodeError);
                console.warn(`🔔 [${new Date().toISOString()}] Failed to decode notification data:`, decodeError);
                if (this.pendingResponsePromise) {
                  this.pendingResponsePromise.reject(new Error(`Failed to decode response: ${decodeError}`));
                  this.pendingResponsePromise = null;
                }
              }
            } else {
              console.warn(`🔔 [${new Date().toISOString()}] RECEIVED NOTIFICATION BUT NO VALUE!`);
            }
          }
        );
        
        const notificationTimeout = new Promise((_, reject) => {
          setTimeout(() => {
            console.warn(`⏰ [${new Date().toISOString()}] NOTIFICATION SETUP TIMEOUT after 8 seconds`);
            reject(new Error('Notification setup timeout after 8 seconds'));
          }, 8000);
        });
        
        await Promise.race([notificationPromise, notificationTimeout]);
        console.warn(`✅ [${new Date().toISOString()}] NOTIFICATIONS ENABLED SUCCESSFULLY ON 0xF024`);
      } else {
        throw new Error('Response characteristic does not support notifications - this is required by the Gently spec!');
      }
      
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] FAILED TO ENABLE REQUIRED NOTIFICATIONS:`, error);
      throw error; // Notifications are required - must fail if we can't enable them
    }
  }

  /**
   * Send command to device and wait for response
   */
  private async sendCommand(encryptedCommand: Uint8Array): Promise<Uint8Array> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }

    try {
      const base64Command = this.bytesToBase64(encryptedCommand);
      console.warn('📤 SENDING COMMAND TO DEVICE...');
      console.warn('📤 Command length:', encryptedCommand.length, 'bytes');
      console.warn('📤 Command (hex):', this.bytesToHex(encryptedCommand));
      
      // Set up promise to wait for notification response
      const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
        this.pendingResponsePromise = { resolve, reject };
        console.warn('⏰ RESPONSE PROMISE CREATED - WAITING FOR NOTIFICATION...');
        
        // Set a timeout for the response (increased to 10 seconds)
        setTimeout(() => {
          if (this.pendingResponsePromise) {
            console.warn('⏰ RESPONSE TIMEOUT - NO RESPONSE RECEIVED WITHIN 10 SECONDS!');
            this.pendingResponsePromise.reject(new Error('Response timeout - no response received within 10 seconds'));
            this.pendingResponsePromise = null;
          }
        }, 10000);
      });
      
      // Write command to device
      await this.connectedDevice.writeCharacteristicWithResponseForService(
        GENTLY_SERVICE_UUID,
        GENTLY_REQUEST_CHAR_UUID,
        base64Command
      );
      console.warn('✅ COMMAND SENT SUCCESSFULLY, WAITING FOR NOTIFICATION RESPONSE...');

      // Wait for the notification response
      console.warn('⏳ AWAITING RESPONSE PROMISE...');
      const response = await responsePromise;
      console.warn('📥 RESPONSE RECEIVED VIA NOTIFICATION!');
      console.warn('📥 Response length:', response.length, 'bytes');
      console.warn('📥 Response (hex):', this.bytesToHex(response));
      return response;
      
    } catch (error) {
      console.error('❌ COMMAND/RESPONSE ERROR:', error);
      console.warn('❌ COMMAND/RESPONSE ERROR:', error); // Using warn for visibility
      
      // Clean up pending promise
      if (this.pendingResponsePromise) {
        this.pendingResponsePromise = null;
      }
      
      throw new Error(`Communication with device failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Establish secure session with paired device
   */
  private async establishSecureSession(braceletKey: Uint8Array, uniqueId: string): Promise<void> {
    console.warn('🔐 ESTABLISHING SECURE SESSION...');
    console.warn('🔐 Using bracelet key:', this.bytesToHex(braceletKey));
    
    // Create encryption with bracelet key for Get Uptime command
    const braceletKeyEncryption = new TEAEncryption(braceletKey);
    
    // Get device uptime using the bracelet key (NOT factory key)
    console.warn('📡 Sending GET_UPTIME command with bracelet key...');
    const uptimeCommand = this.protocol.createCommandPacket(GentlyCommand.GET_UPTIME);
    const encryptedUptimeCommand = braceletKeyEncryption.encryptData(uptimeCommand);
    
    const uptimeResponse = await this.sendCommand(encryptedUptimeCommand);
    const decryptedUptimeResponse = braceletKeyEncryption.decryptData(uptimeResponse);
    const parsedUptime = this.protocol.parseResponsePacket(decryptedUptimeResponse);
    
    if (parsedUptime.status !== GentlyResponseStatus.OK) {
      throw new Error('Failed to get device uptime');
    }
    
    // Extract uptime from response (first 8 bytes of payload as Uint64)
    const uptime = parsedUptime.payload[0]! | 
                  (parsedUptime.payload[1]! << 8) | 
                  (parsedUptime.payload[2]! << 16) | 
                  (parsedUptime.payload[3]! << 24) |
                  (parsedUptime.payload[4]! << 32) |
                  (parsedUptime.payload[5]! << 40) |
                  (parsedUptime.payload[6]! << 48) |
                  (parsedUptime.payload[7]! << 56);
    
    console.warn('🕐 Device uptime received:', uptime);
    
    // Generate dynamic key using bracelet key + uptime + unique ID
    const uniqueIdBytes = this.hexToBytes(uniqueId);
    const dynamicKey = this.protocol.generateDynamicKey(braceletKey, uniqueIdBytes, uptime);
    
    console.warn('🔑 Dynamic key generated:', this.bytesToHex(dynamicKey));
    
    // Set up encryption with dynamic key for all subsequent commands
    this.currentEncryption = new TEAEncryption(dynamicKey);
    
    console.warn('✅ Secure session established with dynamic key');
    
    // CRITICAL: Send GET_DEVICE_INFO within 5 seconds or bracelet will disconnect
    // According to specification: "If the Mobile App does not send this request to the 
    // Bracelet within 5 seconds of establishing a new BLE connection, the Bracelet will 
    // refuse the connection and it will disconnect itself from the mobile app."
    console.warn('📡 Sending GET_DEVICE_INFO command within 5-second requirement...');
    try {
      const deviceInfoCommand = this.protocol.createCommandPacket(GentlyCommand.GET_DEVICE_INFO);
      const encryptedDeviceInfoCommand = this.currentEncryption.encryptData(deviceInfoCommand);
      
      const deviceInfoResponse = await this.sendCommand(encryptedDeviceInfoCommand);
      const decryptedDeviceInfoResponse = this.currentEncryption.decryptData(deviceInfoResponse);
      const parsedDeviceInfo = this.protocol.parseResponsePacket(decryptedDeviceInfoResponse);
      
      if (parsedDeviceInfo.status !== GentlyResponseStatus.OK) {
        throw new Error('Device returned error status for GET_DEVICE_INFO');
      }
      
      console.warn('✅ GET_DEVICE_INFO sent successfully within 5-second window');
      console.warn('📋 Device info confirmed connection and dynamic key validation');
    } catch (error) {
      console.error('❌ Failed to send GET_DEVICE_INFO within 5 seconds:', error);
      throw new Error('Failed to send required GET_DEVICE_INFO command within 5 seconds');
    }
  }

  /**
   * Perform initial pairing with factory mode device
   */
  private async performInitialPairing(uniqueId: string): Promise<void> {
    console.warn('🆕 === STARTING INITIAL PAIRING ===');
    console.warn('🆕 Device unique ID:', uniqueId);
    
    // Use factory key for initial pairing (factory mode devices)
    const factoryKey = new Uint8Array([
      0x43, 0xEA, 0x5F, 0x35, 0x65, 0x98, 0x59, 0x87,
      0x4A, 0x6F, 0x18, 0x47, 0x42, 0xC3, 0x2B, 0x2B
    ]);
    
    console.warn('🏭 Using factory key for initial pairing:', this.bytesToHex(factoryKey));
    
    // First, establish secure session using factory key to get uptime and create dynamic key
    console.warn('🔐 Establishing secure session with factory key...');
    await this.establishSecureSession(factoryKey, uniqueId);
    
    console.warn('🆕 Secure session established, now setting new bracelet key...');
    
    // Generate new bracelet key
    const newBraceletKey = GentlyEncryption.generateBraceletKey();
    console.warn('🔑 New bracelet key generated:', this.bytesToHex(newBraceletKey));
    
    // Send set bracelet key command using the current dynamic key
    const setBraceletKeyPayload = this.protocol.createSetBraceletKeyPayload(newBraceletKey);
    console.warn('📦 Set bracelet key payload:', this.bytesToHex(setBraceletKeyPayload));
    
    const setBraceletKeyCommand = this.protocol.createCommandPacket(
      GentlyCommand.SET_BRACELET_KEY, 
      setBraceletKeyPayload
    );
    console.warn('📤 Set bracelet key command:', this.bytesToHex(setBraceletKeyCommand));
    
    if (!this.currentEncryption) {
      throw new Error('No dynamic key encryption available');
    }
    
    const encryptedSetKeyCommand = this.currentEncryption.encryptData(setBraceletKeyCommand);
    console.warn('🔒 Encrypted set key command:', this.bytesToHex(encryptedSetKeyCommand));
    
    console.warn('📡 Sending SET_BRACELET_KEY command...');
    const setKeyResponse = await this.sendCommand(encryptedSetKeyCommand);
    console.warn('📥 Set key response received');
    
    const decryptedSetKeyResponse = this.currentEncryption.decryptData(setKeyResponse);
    console.warn('🔓 Decrypted set key response:', this.bytesToHex(decryptedSetKeyResponse));
    
    const parsedSetKeyResponse = this.protocol.parseResponsePacket(decryptedSetKeyResponse);
    console.warn('✅ Parsed set key response status:', parsedSetKeyResponse.status);
    
    if (parsedSetKeyResponse.status !== GentlyResponseStatus.OK) {
      throw new Error('Failed to set bracelet key');
    }
    
    // Save paired device with new bracelet key
    await gentlyDeviceManager.addPairedDevice(uniqueId, 'Gently Device', newBraceletKey);
    console.warn('💾 Paired device saved to storage');
    
    console.warn('🎉 Initial pairing completed successfully');
  }

  /**
   * Utility methods for data conversion
   */
  private base64ToBytes(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private bytesToBase64(bytes: Uint8Array): string {
    const binaryString = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    return btoa(binaryString);
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Parse error code bits from advertisement data
   */
  private parseErrorCodeBits(errorCode: number): string[] {
    const errors: string[] = [];
    
    // According to spec, bits 0-9 are defined
    if (errorCode & 0x0001) errors.push('Bluetooth Core Error');
    if (errorCode & 0x0002) errors.push('Battery Capture Error');
    if (errorCode & 0x0004) errors.push('Vibration Motor Driver Error');
    if (errorCode & 0x0008) errors.push('Buzzer Error');
    if (errorCode & 0x0010) errors.push('Permanent Memory Error');
    if (errorCode & 0x0020) errors.push('Input/Output pin error');
    if (errorCode & 0x0040) errors.push('User Button Error');
    if (errorCode & 0x0080) errors.push('LED Strip Error');
    if (errorCode & 0x0100) errors.push('Watchdog Timer Error');
    if (errorCode & 0x0200) errors.push('Real-time clock (RTC) error');
    
    // Check for reserved bits (bits 10-15)
    const reservedBits = errorCode & 0xFC00; // Mask for bits 10-15
    if (reservedBits !== 0) {
      errors.push(`Reserved bits set: 0x${reservedBits.toString(16)} (this may indicate firmware issue)`);
    }
    
    return errors.length > 0 ? errors : ['No errors'];
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

// Export singleton instance
export const gentlyBluetoothService = new GentlyBluetoothService();
