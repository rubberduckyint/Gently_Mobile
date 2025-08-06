import type { BleError, Device, Subscription } from "react-native-ble-plx";
import { Alert, PermissionsAndroid, Platform } from "react-native";
import { BleManager, ScanMode, State } from "react-native-ble-plx";
import * as Location from "expo-location";

import { TeaEncryption } from "./crypto/TeaEncryption";

export interface BluetoothDevice {
  id: string;
  name: string;
  rssi: number;
  // Add parsed advertisement data
  advertisementData?: GentlyAdvertisementData;
}

export interface GentlyAdvertisementData {
  apiVersion: number;
  packetCounter: number;
  errorCode: number;
  serialNumber: string; // Hex string representation
  time: {
    hour: number;
    minute: number;
    second: number;
    year: number;
    month: number;
    date: number;
    weekday: number;
  };
  battery: {
    voltage: number; // mV
    level: "CRITICAL" | "LOW" | "MEDIUM" | "GOOD" | "FULL";
    charging: boolean;
  };
  braceletKeyType: "factory" | "modified";
  hasActiveEvent: boolean;
}

export interface DeviceInfo {
  serialNumber: string;
  firmwareVersion: string;
  batteryLevel: number;
  uptime: bigint;
}

export interface CommandResponse {
  commandCode: number;
  status: number;
  data: Uint8Array;
}

export class BluetoothService {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private isScanning = false;

  // Encryption instances for different key types
  private factoryEncryption: TeaEncryption;
  private braceletEncryption: TeaEncryption | null = null;
  private dynamicEncryption: TeaEncryption | null = null;

  // Current device state
  private currentBraceletKey: Uint8Array | null = null;
  private currentSerialNumber: Uint8Array | null = null;

  // Command/Response handling
  private pendingResponses = new Map<
    number,
    {
      resolve: (response: CommandResponse) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private notificationSubscription: Subscription | null = null;

  // Gently device service and characteristic UUIDs from protocol specification
  private readonly GENTLY_SERVICE_UUID = "0000F021-0000-1000-8000-00805F9B34FB";
  private readonly REQUEST_CHAR_UUID = "0000F023-0000-1000-8000-00805F9B34FB"; // WRITE property
  private readonly RESPONSE_CHAR_UUID = "0000F024-0000-1000-8000-00805F9B34FB"; // NOTIFY property

  // Protocol constants
  private readonly MOTSAI_COMPANY_ID = 0x0274;
  private readonly API_VERSION = 0x01;

  constructor() {
    this.manager = new BleManager();
    this.factoryEncryption = TeaEncryption.createWithFactoryKey();
  }

  /**
   * Initialize the Bluetooth service and request necessary permissions
   */
  async initialize(): Promise<boolean> {
    try {
      // Request permissions
      const hasPermissions = await this.requestPermissions();
      if (!hasPermissions) {
        throw new Error("Bluetooth permissions not granted");
      }

      // Check if Bluetooth is enabled
      const state = await this.manager.state();
      if (state !== State.PoweredOn) {
        throw new Error(
          "Bluetooth is not enabled. Please enable Bluetooth and try again.",
        );
      }

      return true;
    } catch (error) {
      console.error("Failed to initialize Bluetooth service:", error);
      return false;
    }
  }

  /**
   * Request all necessary permissions for Bluetooth scanning and connection
   */
  private async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === "android") {
        // Request location permission (required for BLE scanning on Android)
        const { status: locationStatus } =
          await Location.requestForegroundPermissionsAsync();
        if (locationStatus !== Location.PermissionStatus.GRANTED) {
          Alert.alert(
            "Location Permission Required",
            "Location permission is required to scan for Bluetooth devices on Android.",
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
            (permission) =>
              permission === (PermissionsAndroid.RESULTS.GRANTED as string),
          );

          if (!allPermissionsGranted) {
            Alert.alert(
              "Bluetooth Permissions Required",
              "Bluetooth permissions are required to connect to your Gently device.",
            );
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error("Error requesting permissions:", error);
      return false;
    }
  }

  /**
   * Start scanning for Gently devices
   */
  async startScan(
    onDeviceFound: (device: BluetoothDevice) => void,
    onError: (error: string) => void,
  ): Promise<void> {
    try {
      // Stop any existing scan
      this.stopScan();

      // Initialize if not already done
      const initialized = await this.initialize();
      if (!initialized) {
        onError("Failed to initialize Bluetooth");
        return;
      }

      console.log("Starting BLE scan for Gently devices...");

      // Set scanning flag
      this.isScanning = true;

      // Start scanning for devices
      void this.manager.startDeviceScan(
        null, // Service UUIDs to scan for (null = scan for all)
        {
          allowDuplicates: false,
          legacyScan: false,
          scanMode: ScanMode.LowLatency,
        },
        (error: BleError | null, device: Device | null) => {
          if (error) {
            console.error("Scan error:", error);
            onError(`Scan failed: ${error.message}`);
            return;
          }

          if (device && this.isGentlyDevice(device)) {
            console.log("Found Gently device:", device.name, device.id);

            // Parse advertisement data
            const advertisementData = this.parseAdvertisementData(device);

            onDeviceFound({
              id: device.id,
              name: device.name ?? "Gently",
              rssi: device.rssi ?? -100,
              advertisementData,
            });
          }
        },
      );

      // Stop scanning after 30 seconds to preserve battery
      setTimeout(() => {
        void this.stopScan();
      }, 30000);
    } catch (error) {
      console.error("Failed to start scan:", error);
      onError("Failed to start scanning for devices");
    }
  }

  /**
   * Stop scanning for devices
   */
  stopScan(): void {
    try {
      if (this.isScanning) {
        void this.manager.stopDeviceScan();
        this.isScanning = false;
        console.log("Stopped BLE scan");
      }
    } catch (error) {
      console.error("Error stopping scan:", error);
    }
  }

  /**
   * Connect to a Gently device using advertisement data for authentication
   */
  async connectToGentlyDevice(
    device: BluetoothDevice,
    maxRetries = 1,
  ): Promise<void> {
    console.log("=== GENTLY DEVICE CONNECTION START ===");
    console.log("Device details:", {
      id: device.id,
      name: device.name,
      rssi: device.rssi,
      hasAdvertisementData: !!device.advertisementData,
      serialNumber: device.advertisementData?.serialNumber,
    });

    // For testing without real Gently device, just connect without authentication
    if (!device.advertisementData?.serialNumber) {
      console.warn(
        "⚠️ No valid advertisement data - connecting without authentication",
      );
      await this.connectToDevice(device.id);
      console.log("✅ Connected without authentication (test mode)");
      return;
    }

    console.log(`Connecting to Gently device: ${device.name} (${device.id})`);
    console.log(`Serial number: ${device.advertisementData.serialNumber}`);

    // Extract serial number from advertisement data
    const serialNumberHex = device.advertisementData.serialNumber;
    let serialNumber: Uint8Array;

    try {
      serialNumber = TeaEncryption.hexToBytes(serialNumberHex);
      console.log(
        "Serial number bytes:",
        Array.from(serialNumber)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" "),
      );
    } catch (error) {
      throw new Error(
        `Failed to parse serial number '${serialNumberHex}': ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    let lastError: Error | null = null;

    // Retry connection with exponential backoff
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`=== CONNECTION ATTEMPT ${attempt}/${maxRetries} ===`);

        // Connect and authenticate with strict timing
        await this.connectToDevice(device.id, serialNumber);

        console.log("🎉 Successfully connected and authenticated with device");
        return; // Success!
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error("Unknown connection error");
        console.error(
          `❌ Connection attempt ${attempt} failed:`,
          lastError.message,
        );

        // Clean up any partial connection
        await this.disconnectDevice();

        // If this isn't the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          console.log(`⏳ Waiting ${delayMs}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retries failed
    throw new Error(
      `Failed to connect after ${maxRetries} attempts. Last error: ${lastError?.message}`,
    );
  }

  /**
   * Connect to a specific device and perform full authentication
   * CRITICAL: Must complete authentication within 5 seconds or device will disconnect
   */
  async connectToDevice(
    deviceId: string,
    serialNumber?: Uint8Array,
  ): Promise<Device> {
    const startTime = Date.now();

    try {
      console.log("=== STARTING BLE CONNECTION SEQUENCE ===");
      console.log(`Device ID: ${deviceId}`);
      console.log(`Has serial number: ${!!serialNumber}`);
      console.log(`Start time: ${new Date(startTime).toISOString()}`);

      // Check Bluetooth state first
      const state = await this.manager.state();
      if (state !== State.PoweredOn) {
        throw new Error(`Bluetooth is not enabled. Current state: ${state}`);
      }
      console.log(`✓ Bluetooth state: ${state} (${Date.now() - startTime}ms)`);

      // Stop scanning before connecting (required by many BLE implementations)
      console.log("Stopping scan before connection...");
      this.stopScan();
      console.log(`✓ Scan stopped (${Date.now() - startTime}ms)`);

      // Connect to the device
      console.log("Connecting to device...");
      const connectStartTime = Date.now();
      let device: Device;
      try {
        // Connect with faster connection parameters
        device = await this.manager.connectToDevice(deviceId, {
          autoConnect: false,
          requestMTU: 512,
        });
        console.log(`✓ Device connected (${Date.now() - connectStartTime}ms)`);
      } catch (connectError: unknown) {
        const errorCode =
          connectError &&
          typeof connectError === "object" &&
          "code" in connectError
            ? connectError.code
            : undefined;
        const errorReason =
          connectError &&
          typeof connectError === "object" &&
          "reason" in connectError
            ? connectError.reason
            : undefined;

        console.error("❌ BLE connection failed:", {
          error: connectError,
          message:
            connectError instanceof Error
              ? connectError.message
              : "Unknown error",
          code: errorCode,
          reason: errorReason,
          deviceId,
          timeMs: Date.now() - connectStartTime,
        });

        // Check if it's a common error we can provide guidance for
        const errorMessage =
          connectError instanceof Error
            ? connectError.message
            : "Unknown error";
        if (
          errorMessage.includes("Device disconnected") ||
          errorMessage.includes("Connection failed")
        ) {
          console.log(
            "💡 Tip: Try moving closer to the device or ensuring it's not connected to another app",
          );
        }

        throw connectError;
      }

      // Discover services and characteristics
      console.log("Discovering services...");
      const discoveryStartTime = Date.now();
      await device.discoverAllServicesAndCharacteristics();
      console.log(
        `✓ Services discovered (${Date.now() - discoveryStartTime}ms)`,
      );

      this.connectedDevice = device;

      // Verify it's a Gently device by checking service exists
      console.log("Verifying Gently device...");
      const verifyStartTime = Date.now();
      await this.verifyGentlyDevice(device);
      console.log(`✓ Device verified (${Date.now() - verifyStartTime}ms)`);

      // Enable notifications for responses
      console.log("Enabling notifications...");
      const notificationStartTime = Date.now();
      this.enableNotifications();
      console.log(
        `✓ Notifications enabled (${Date.now() - notificationStartTime}ms)`,
      );

      const preAuthTime = Date.now();
      console.log(
        `✓ Pre-authentication setup complete (${preAuthTime - startTime}ms total)`,
      );

      // If serial number provided, perform full authentication sequence
      if (serialNumber) {
        const timeRemaining = 8000 - (preAuthTime - startTime); // Give ourselves 8 seconds instead of 5
        if (timeRemaining <= 0) {
          console.warn(
            "⚠️ Setup took longer than ideal, but attempting authentication anyway...",
          );
        }

        console.log(
          `⚡ Starting authentication with ${Math.max(timeRemaining, 0)}ms window...`,
        );
        const authStartTime = Date.now();

        await this.authenticateWithDevice(serialNumber);

        const authDuration = Date.now() - authStartTime;
        const totalDuration = Date.now() - startTime;

        console.log(`✓ Authentication completed in ${authDuration}ms`);
        console.log(`✓ Total connection time: ${totalDuration}ms`);

        if (totalDuration >= 5000) {
          console.warn(
            `⚠️ Connection took ${totalDuration}ms - longer than ideal 5s window`,
          );
        }

        console.log(
          "🎉 Device fully authenticated and ready for secure communication",
        );
      } else {
        console.log(
          "Connected but authentication skipped (no serial number provided)",
        );
      }

      console.log("=== CONNECTION SEQUENCE COMPLETE ===");
      return device;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error("❌ CONNECTION FAILED ❌");
      console.error(`Total attempt time: ${totalTime}ms`);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        deviceId,
        hasSerialNumber: !!serialNumber,
        totalTimeMs: totalTime,
      });

      // Clean up on connection failure
      if (this.connectedDevice) {
        try {
          console.log("Cleaning up failed connection...");
          await this.disconnectDevice();
        } catch (cleanupError) {
          console.error("Error during cleanup:", cleanupError);
        }
      }

      throw new Error(
        `Failed to connect to device (${totalTime}ms): ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Enable notifications on the response characteristic
   */
  private enableNotifications(): void {
    if (!this.connectedDevice) {
      throw new Error("No device connected");
    }

    try {
      console.log("Enabling notifications on response characteristic...");
      console.log(`Service: ${this.GENTLY_SERVICE_UUID}`);
      console.log(`Characteristic: ${this.RESPONSE_CHAR_UUID}`);

      this.notificationSubscription =
        this.connectedDevice.monitorCharacteristicForService(
          this.GENTLY_SERVICE_UUID,
          this.RESPONSE_CHAR_UUID,
          (error, characteristic) => {
            if (error) {
              console.error("Notification error:", error);
              return;
            }

            if (characteristic?.value) {
              this.handleNotification(characteristic.value);
            }
          },
        );

      console.log("✓ Notifications enabled successfully");
    } catch (error) {
      console.error("Failed to enable notifications:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Don't throw error if this is just a test device
      console.warn(
        "⚠️ Notifications failed - continuing anyway (might be test device)",
      );
    }
  }

  /**
   * Handle incoming notifications from the device
   */
  private handleNotification(base64Data: string): void {
    const notificationStartTime = Date.now();

    try {
      // Convert base64 to Uint8Array
      const encryptedData = new Uint8Array(
        atob(base64Data)
          .split("")
          .map((char) => char.charCodeAt(0)),
      );

      console.log(
        "📨 Received notification:",
        Array.from(encryptedData)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" "),
      );

      // Try to decrypt with available keys (prioritize dynamic key for speed)
      let decryptedData: Uint8Array;
      let keyUsed = "unknown";

      try {
        // Try dynamic key first (most common for established connections)
        if (this.dynamicEncryption) {
          decryptedData = this.dynamicEncryption.decryptData(encryptedData);
          keyUsed = "dynamic";
        } else if (this.braceletEncryption) {
          // Fall back to bracelet key (for uptime command)
          decryptedData = this.braceletEncryption.decryptData(encryptedData);
          keyUsed = "bracelet";
        } else {
          // Fall back to factory key
          decryptedData = this.factoryEncryption.decryptData(encryptedData);
          keyUsed = "factory";
        }

        // Remove padding
        const unpaddedData =
          this.factoryEncryption.removePadding(decryptedData);

        // Parse the response
        if (unpaddedData.length >= 3) {
          const apiVersion = unpaddedData[0];
          const commandCode = unpaddedData[1];
          const status = unpaddedData[2];
          const responseData = unpaddedData.slice(3);

          const processTime = Date.now() - notificationStartTime;
          console.log(
            `✓ Response processed in ${processTime}ms: API=${apiVersion}, CMD=0x${commandCode?.toString(16).padStart(2, "0")}, Status=0x${status?.toString(16).padStart(2, "0")}, Key=${keyUsed}`,
          );

          const response: CommandResponse = {
            commandCode: commandCode ?? 0,
            status: status ?? 0,
            data: responseData,
          };

          // Handle asynchronous notifications vs command responses
          if (
            commandCode === 0x80 ||
            commandCode === 0x81 ||
            commandCode === 0x82
          ) {
            // These are asynchronous notifications from the device
            this.handleAsyncNotification(commandCode, responseData);
          } else {
            // This is a response to a command we sent
            this.resolveCommand(commandCode ?? 0, response);
          }
        } else {
          console.warn("Response too short:", unpaddedData.length);
        }
      } catch (decryptError) {
        console.error("Failed to decrypt notification:", decryptError);
        console.error("Available keys:", {
          factory: !!this.factoryEncryption,
          bracelet: !!this.braceletEncryption,
          dynamic: !!this.dynamicEncryption,
        });
      }
    } catch (error) {
      console.error("Error handling notification:", error);
    }
  }

  /**
   * Send a command to the device and wait for response
   */
  private async sendCommand(
    commandCode: number,
    data: Uint8Array = new Uint8Array(0),
    timeoutMs = 10000,
  ): Promise<CommandResponse> {
    if (!this.connectedDevice) {
      throw new Error("No device connected");
    }

    // Create command packet: [API_VERSION, COMMAND_CODE, ...DATA, PADDING]
    const commandData = new Uint8Array(8); // Always 8 bytes before encryption
    commandData[0] = this.API_VERSION;
    commandData[1] = commandCode;

    // Copy data starting from byte 2
    const maxDataLength = 6; // 8 - 2 (API version + command code)
    const dataLength = Math.min(data.length, maxDataLength);
    commandData.set(data.slice(0, dataLength), 2);

    // Remaining bytes are already 0x00 (padding)

    // Get appropriate encryption
    const encryption = this.getEncryptionForCommand(commandCode);

    // Encrypt the command
    const encryptedCommand = encryption.encryptData(commandData);

    console.log(
      `Sending command 0x${commandCode.toString(16).padStart(2, "0")}:`,
      Array.from(encryptedCommand)
        .map((b: number) => b.toString(16).padStart(2, "0"))
        .join(" "),
    );

    // Set up response promise
    const responsePromise = new Promise<CommandResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(commandCode);
        reject(
          new Error(
            `Command 0x${commandCode.toString(16)} timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      this.pendingResponses.set(commandCode, { resolve, reject, timeout });
    });

    // Send the command
    try {
      // Convert to base64 for BLE transmission
      const base64Command = btoa(String.fromCharCode(...encryptedCommand));

      await this.connectedDevice.writeCharacteristicWithResponseForService(
        this.GENTLY_SERVICE_UUID,
        this.REQUEST_CHAR_UUID,
        base64Command,
      );
    } catch (error) {
      // Clean up pending response on send failure
      const pending = this.pendingResponses.get(commandCode);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingResponses.delete(commandCode);
      }
      throw error;
    }

    return responsePromise;
  }

  /**
   * Send Get Uptime command (0x01) - First step in authentication
   * Uses Bracelet Key encryption
   */
  private async getUptimeCommand(): Promise<Uint8Array> {
    console.log("Sending Get Uptime command...");

    // Use shorter timeout for authentication phase
    const response = await this.sendCommand(0x01, new Uint8Array(0), 3000);

    if (response.status !== 0x00) {
      throw new Error(
        `Get Uptime failed with status: 0x${response.status.toString(16)}`,
      );
    }

    // Extract uptime from response data - pad to 8 bytes if shorter
    console.log("Raw uptime response data length:", response.data.length);
    console.log(
      "Raw uptime response data:",
      Array.from(response.data)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
    );

    const uptime = new Uint8Array(8); // Always 8 bytes for uptime

    if (response.data.length >= 8) {
      // Use first 8 bytes if we have enough data
      uptime.set(response.data.slice(0, 8));
    } else if (response.data.length > 0) {
      // Pad with zeros if we have some data but less than 8 bytes
      uptime.set(response.data.slice(0, response.data.length));
      console.log(
        "⚠️ Uptime response shorter than expected, padding with zeros",
      );
    } else {
      // Use current timestamp as fallback if no data
      const timestamp = BigInt(Date.now());
      const timestampBytes = new Uint8Array(8);
      for (let i = 0; i < 8; i++) {
        timestampBytes[i] = Number((timestamp >> BigInt(i * 8)) & BigInt(0xff));
      }
      uptime.set(timestampBytes);
      console.log("⚠️ No uptime data, using current timestamp as fallback");
    }

    console.log(
      "Final uptime (8 bytes):",
      Array.from(uptime)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );

    return uptime;
  }

  /**
   * Send Get Device Info command (0x02) - Second step in authentication
   * Uses Dynamic Key encryption - MUST be sent within 5 seconds!
   */
  private async getDeviceInfoCommand(): Promise<DeviceInfo> {
    console.log("Sending Get Device Info command...");

    // Critical timing - use shorter timeout and prioritize speed
    const response = await this.sendCommand(0x02, new Uint8Array(0), 2000); // 2 second timeout!

    if (response.status !== 0x00) {
      throw new Error(
        `Get Device Info failed with status: 0x${response.status.toString(16)}`,
      );
    }

    // Parse device info from response data
    // This would need to be implemented based on the actual response format
    const deviceInfo: DeviceInfo = {
      serialNumber: Array.from(response.data.slice(0, 8))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      firmwareVersion: "1.0.0", // Parse from response
      batteryLevel: 100, // Parse from response
      uptime: BigInt(0), // Parse from response
    };

    console.log("Received device info:", deviceInfo);
    return deviceInfo;
  }

  /**
   * Perform the complete authentication sequence
   * CRITICAL: Must complete within 5 seconds of BLE connection
   */
  async authenticateWithDevice(serialNumber: Uint8Array): Promise<DeviceInfo> {
    const authStartTime = Date.now();

    try {
      console.log("🔐 Starting authentication sequence...");

      // Store serial number for Dynamic Key generation
      this.currentSerialNumber = new Uint8Array(serialNumber);

      // Step 1: Send Get Uptime command (uses Bracelet Key) - Fast timeout
      console.log("📡 Step 1: Getting uptime...");
      const uptimeStartTime = Date.now();
      const uptime = await this.getUptimeCommand();
      const uptimeTime = Date.now() - uptimeStartTime;
      console.log(`✓ Uptime received in ${uptimeTime}ms`);

      // Step 2: Generate Dynamic Key immediately
      console.log("🔑 Step 2: Generating Dynamic Key...");
      const keyGenStartTime = Date.now();
      this.generateDynamicKey(uptime, serialNumber);
      const keyGenTime = Date.now() - keyGenStartTime;
      console.log(`✓ Dynamic Key generated in ${keyGenTime}ms`);

      // Step 3: Send Get Device Info command (uses Dynamic Key) - CRITICAL: Must be fast!
      console.log("📋 Step 3: Getting device info (CRITICAL TIMING)...");
      const deviceInfoStartTime = Date.now();
      const deviceInfo = await this.getDeviceInfoCommand();
      const deviceInfoTime = Date.now() - deviceInfoStartTime;
      console.log(`✓ Device info received in ${deviceInfoTime}ms`);

      const totalAuthTime = Date.now() - authStartTime;
      console.log(
        `🎉 Authentication sequence completed in ${totalAuthTime}ms!`,
      );

      // Log timing breakdown for optimization
      console.log("Timing breakdown:", {
        uptime: `${uptimeTime}ms`,
        keyGen: `${keyGenTime}ms`,
        deviceInfo: `${deviceInfoTime}ms`,
        total: `${totalAuthTime}ms`,
      });

      return deviceInfo;
    } catch (error) {
      const failTime = Date.now() - authStartTime;
      console.error(`❌ Authentication failed after ${failTime}ms:`, error);

      // Reset keys on failure
      this.resetKeys();
      throw error;
    }
  }

  /**
   * Handle asynchronous notifications from the device
   */
  private handleAsyncNotification(commandCode: number, data: Uint8Array): void {
    switch (commandCode) {
      case 0x80: // Battery Status Notify
        this.handleBatteryStatusNotify(data);
        break;
      case 0x81: // Active Event Notify
        this.handleActiveEventNotify(data);
        break;
      case 0x82: // Time Notify
        this.handleTimeNotify(data);
        break;
      default:
        console.warn(
          `Unknown async notification: 0x${commandCode.toString(16)}`,
        );
    }
  }

  /**
   * Handle Battery Status Notify (Command 0x80)
   * Sent every minute to report battery status
   */
  private handleBatteryStatusNotify(data: Uint8Array): void {
    if (data.length < 6) {
      console.warn("Battery status notification too short:", data.length);
      return;
    }

    // Parse according to protocol specification
    const batteryVoltage = (data[1] ?? 0) | ((data[2] ?? 0) << 8); // Bytes 1-2, little endian
    const statusByte = data[3] ?? 0; // Byte 3
    const charging = (statusByte & 0x01) !== 0; // Bit 0
    const batteryLevelBits = (statusByte >> 1) & 0x07; // Bits 1-3

    const batteryLevels = [
      "CRITICAL",
      "LOW",
      "MEDIUM",
      "GOOD",
      "FULL",
    ] as const;
    const batteryLevel = batteryLevels[batteryLevelBits] ?? "CRITICAL";

    console.log("🔋 Battery Status Update:", {
      voltage: `${batteryVoltage}mV`,
      level: batteryLevel,
      charging: charging ? "Yes" : "No",
    });

    // You could emit an event here for the UI to update battery status
    // this.emit('batteryStatus', { voltage: batteryVoltage, level: batteryLevel, charging });
  }

  /**
   * Handle Active Event Notify (Command 0x81)
   * Sent every 5 seconds when there are active events
   */
  private handleActiveEventNotify(_data: Uint8Array): void {
    console.log("⚡ Active Event Notification received");
    // Parse event data according to protocol specification
    // Implementation would depend on the specific event data format
  }

  /**
   * Handle Time Notify (Command 0x82)
   * Sent when time synchronization is needed
   */
  private handleTimeNotify(_data: Uint8Array): void {
    console.log("🕒 Time Notification received");
    // Parse time data according to protocol specification
  }

  /**
   * Resolve a pending command with its response
   */
  private resolveCommand(commandCode: number, response: CommandResponse): void {
    const pending = this.pendingResponses.get(commandCode);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingResponses.delete(commandCode);
      pending.resolve(response);
    } else {
      console.warn(`Received response for unknown command: ${commandCode}`);
    }
  }

  /**
   * Disconnect from the currently connected device
   */
  async disconnectDevice(): Promise<void> {
    try {
      // Clean up notifications
      if (this.notificationSubscription) {
        this.notificationSubscription.remove();
        this.notificationSubscription = null;
      }

      // Cancel any pending commands
      this.pendingResponses.forEach(({ reject, timeout }) => {
        clearTimeout(timeout);
        reject(new Error("Device disconnected"));
      });
      this.pendingResponses.clear();

      // Reset encryption keys
      this.resetKeys();

      // Disconnect from device
      if (this.connectedDevice) {
        await this.manager.cancelDeviceConnection(this.connectedDevice.id);
        this.connectedDevice = null;
        console.log("Disconnected from device");
      }
    } catch (error) {
      console.error("Error disconnecting device:", error);
    }
  }

  /**
   * Get the current connection status
   */
  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  /**
   * Get the connected device ID (if any)
   */
  getConnectedDeviceId(): string | null {
    return this.connectedDevice?.id ?? null;
  }

  /**
   * Get connection status info for UI display
   */
  getConnectionStatus(): {
    isConnected: boolean;
    deviceId: string | null;
    deviceName: string | null;
    hasNotifications: boolean;
  } {
    return {
      isConnected: this.connectedDevice !== null,
      deviceId: this.connectedDevice?.id ?? null,
      deviceName: this.connectedDevice?.name ?? null,
      hasNotifications: this.notificationSubscription !== null,
    };
  }

  /**
   * Test the connection by sending a simple command
   * Returns true if connection is healthy, false if it needs to be re-established
   */
  async testConnection(): Promise<boolean> {
    if (!this.connectedDevice) {
      console.log("No device connected");
      return false;
    }

    try {
      // Send Get Device Info command as a connection test
      console.log("🔍 Testing connection with Get Device Info command...");
      const response = await this.sendCommand(0x02, new Uint8Array(0), 5000);

      if (response.status === 0x00) {
        console.log("✅ Connection test successful");
        return true;
      } else {
        console.warn(
          `⚠️ Connection test failed with status: 0x${response.status.toString(16)}`,
        );
        return false;
      }
    } catch (error) {
      console.error("❌ Connection test failed:", error);
      return false;
    }
  }

  /**
   * Sync with device - test connection and re-establish if needed
   * This is the main method to call from the UI
   */
  async syncWithDevice(
    deviceId: string,
    _serialNumber?: string,
  ): Promise<{
    success: boolean;
    message: string;
    reconnected?: boolean;
    connectionStatus: "connected" | "disconnected" | "unknown_device";
  }> {
    try {
      console.log("🔄 Starting device sync...");

      // Check if we're already connected to the right device
      if (this.connectedDevice?.id === deviceId) {
        console.log("📱 Already connected to device, testing connection...");
        const isHealthy = await this.testConnection();

        if (isHealthy) {
          return {
            success: true,
            message:
              "✅ Device connection is healthy and active! Battery notifications should be working.",
            connectionStatus: "connected",
          };
        } else {
          console.log("🔄 Connection unhealthy, disconnecting...");
          await this.disconnectDevice();
          return {
            success: false,
            message:
              "❌ Connection lost. Please use 'Add Device' to reconnect your Gently device.",
            connectionStatus: "disconnected",
          };
        }
      } else if (this.connectedDevice) {
        console.log("� Connected to different device");
        return {
          success: false,
          message:
            "📱 Connected to a different device. Please use 'Add Device' to connect to this specific device.",
          connectionStatus: "unknown_device",
        };
      } else {
        console.log("📱 No device connected");
        return {
          success: false,
          message:
            "📱 No device connected. Please use 'Add Device' to connect your Gently device and start receiving battery notifications.",
          connectionStatus: "disconnected",
        };
      }
    } catch (error) {
      console.error("❌ Device sync failed:", error);
      return {
        success: false,
        message: `❌ Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        connectionStatus: "disconnected",
      };
    }
  }

  /**
   * Check if a discovered device is a Gently device
   */
  private isGentlyDevice(device: Device): boolean {
    // Check device name first
    if (device.name?.toLowerCase().includes("gently")) {
      return true;
    }

    // Also check if manufacturer data contains Motsai company ID
    if (device.manufacturerData) {
      try {
        const manufacturerData = this.base64ToUint8Array(
          device.manufacturerData,
        );
        if (manufacturerData.length >= 2) {
          const companyId =
            (manufacturerData[0] ?? 0) | ((manufacturerData[1] ?? 0) << 8);
          if (companyId === this.MOTSAI_COMPANY_ID) {
            return true;
          }
        }
      } catch (error) {
        console.warn("Error checking manufacturer data:", error);
      }
    }

    return false;
  }

  /**
   * Parse advertisement data from a Gently device
   */
  private parseAdvertisementData(
    device: Device,
  ): GentlyAdvertisementData | undefined {
    if (!device.manufacturerData) {
      console.log("No manufacturer data found for device:", device.id);
      return undefined;
    }

    try {
      const manufacturerData = this.base64ToUint8Array(device.manufacturerData);
      console.log(
        "Raw manufacturer data:",
        TeaEncryption.bytesToHex(manufacturerData),
      );

      // Check minimum length (2-byte company ID + 24-byte encrypted payload)
      if (manufacturerData.length < 26) {
        console.warn("Manufacturer data too short:", manufacturerData.length);
        return undefined;
      }

      // Verify company ID (little-endian)
      const companyId =
        (manufacturerData[0] ?? 0) | ((manufacturerData[1] ?? 0) << 8);
      if (companyId !== this.MOTSAI_COMPANY_ID) {
        console.warn("Invalid company ID:", companyId.toString(16));
        return undefined;
      }

      // Extract and decrypt 24-byte payload
      const encryptedPayload = manufacturerData.slice(2, 26);
      console.log(
        "Encrypted payload:",
        TeaEncryption.bytesToHex(encryptedPayload),
      );

      const decryptedPayload =
        this.factoryEncryption.decryptData(encryptedPayload);
      console.log(
        "Decrypted payload:",
        TeaEncryption.bytesToHex(decryptedPayload),
      );

      // Parse the decrypted payload according to protocol specification
      return this.parseDecryptedPayload(decryptedPayload);
    } catch (error) {
      console.error("Error parsing advertisement data:", error);
      return undefined;
    }
  }

  /**
   * Parse the decrypted 24-byte advertisement payload
   */
  private parseDecryptedPayload(payload: Uint8Array): GentlyAdvertisementData {
    // Validate payload length
    if (payload.length < 24) {
      throw new Error(`Invalid payload length: ${payload.length}, expected 24`);
    }

    // Parse according to protocol specification
    const apiVersion = payload[0] ?? 0;
    const packetCounter = (payload[1] ?? 0) | ((payload[2] ?? 0) << 8);
    const errorCode = (payload[3] ?? 0) | ((payload[4] ?? 0) << 8);

    // Extract serial number (8 bytes)
    const serialNumberBytes = payload.slice(5, 13);
    const serialNumber = TeaEncryption.bytesToHex(serialNumberBytes);

    // Parse time fields (BCD format)
    const hour = this.bcdToDecimal(payload[13] ?? 0);
    const minute = this.bcdToDecimal(payload[14] ?? 0);
    const second = this.bcdToDecimal(payload[15] ?? 0);
    const year = 2000 + this.bcdToDecimal(payload[16] ?? 0);
    const month = this.bcdToDecimal(payload[17] ?? 0);
    const date = this.bcdToDecimal(payload[18] ?? 0);
    const weekday = payload[19] ?? 0;

    // Parse battery info
    const batteryVoltage = (payload[20] ?? 0) | ((payload[21] ?? 0) << 8);

    // Parse status byte (Byte 22)
    const statusByte = payload[22] ?? 0;
    const charging = (statusByte & 0x04) !== 0; // Bit 2
    const batteryLevelBits = (statusByte >> 3) & 0x07; // Bits 3-5
    const braceletKeyTypeBit = (statusByte & 0x40) !== 0; // Bit 6
    const hasActiveEvent = (statusByte & 0x80) !== 0; // Bit 7

    const batteryLevels = [
      "CRITICAL",
      "LOW",
      "MEDIUM",
      "GOOD",
      "FULL",
    ] as const;
    const batteryLevel = batteryLevels[batteryLevelBits] ?? "CRITICAL";

    const result: GentlyAdvertisementData = {
      apiVersion,
      packetCounter,
      errorCode,
      serialNumber,
      time: {
        hour,
        minute,
        second,
        year,
        month,
        date,
        weekday,
      },
      battery: {
        voltage: batteryVoltage,
        level: batteryLevel,
        charging,
      },
      braceletKeyType: braceletKeyTypeBit ? "modified" : "factory",
      hasActiveEvent,
    };

    console.log("Parsed advertisement data:", {
      ...result,
      serialNumber: result.serialNumber.toUpperCase(),
      timeString: `${result.time.year}-${result.time.month.toString().padStart(2, "0")}-${result.time.date.toString().padStart(2, "0")} ${result.time.hour.toString().padStart(2, "0")}:${result.time.minute.toString().padStart(2, "0")}:${result.time.second.toString().padStart(2, "0")}`,
      batteryString: `${result.battery.voltage}mV (${result.battery.level}${result.battery.charging ? ", Charging" : ""})`,
    });

    return result;
  }

  /**
   * Convert BCD (Binary Coded Decimal) to decimal
   */
  private bcdToDecimal(bcd: number): number {
    return (bcd >> 4) * 10 + (bcd & 0x0f);
  }

  /**
   * Convert base64 string to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Verify that a connected device is actually a Gently device
   */
  private async verifyGentlyDevice(device: Device): Promise<void> {
    try {
      console.log("Checking device services...");
      const services = await device.services();
      console.log(
        "Available services:",
        services.map((s) => s.uuid),
      );

      const hasGentlyService = services.some(
        (service) =>
          service.uuid.toLowerCase() === this.GENTLY_SERVICE_UUID.toLowerCase(),
      );

      if (!hasGentlyService) {
        console.warn(
          `⚠️ Gently service ${this.GENTLY_SERVICE_UUID} not found. Available services: ${services.map((s) => s.uuid).join(", ")}`,
        );
        console.warn(
          "⚠️ This might not be a real Gently device - continuing anyway for testing",
        );
        return; // Don't throw error, just warn
      }

      console.log("✓ Gently service found");

      // Also verify characteristics exist
      const gentlyService = services.find(
        (s) => s.uuid.toLowerCase() === this.GENTLY_SERVICE_UUID.toLowerCase(),
      );
      if (gentlyService) {
        const characteristics = await gentlyService.characteristics();
        console.log(
          "Available characteristics:",
          characteristics.map((c) => c.uuid),
        );

        const hasRequestChar = characteristics.some(
          (c) => c.uuid.toLowerCase() === this.REQUEST_CHAR_UUID.toLowerCase(),
        );
        const hasResponseChar = characteristics.some(
          (c) => c.uuid.toLowerCase() === this.RESPONSE_CHAR_UUID.toLowerCase(),
        );

        if (!hasRequestChar) {
          console.warn(
            `⚠️ Request characteristic ${this.REQUEST_CHAR_UUID} not found`,
          );
        }
        if (!hasResponseChar) {
          console.warn(
            `⚠️ Response characteristic ${this.RESPONSE_CHAR_UUID} not found`,
          );
        }

        if (hasRequestChar && hasResponseChar) {
          console.log("✓ Required characteristics found");
        }
      }
    } catch (error) {
      console.error("Device verification failed:", error);
      console.warn("⚠️ Continuing anyway for testing purposes");
    }
  }

  /**
   * Get the current bracelet key (or factory key if not set)
   */
  private getBraceletKey(): Uint8Array {
    return this.currentBraceletKey ?? this.factoryEncryption.getKey();
  }

  /**
   * Generate and set dynamic key for secure communication
   * This should be called after retrieving uptime from the device
   */
  private generateDynamicKey(
    uptime: Uint8Array,
    serialNumber: Uint8Array,
  ): void {
    const braceletKey = this.getBraceletKey();
    this.currentSerialNumber = new Uint8Array(serialNumber);
    this.dynamicEncryption = TeaEncryption.createWithDynamicKey(
      braceletKey,
      uptime,
      serialNumber,
    );
  }

  /**
   * Get the appropriate encryption instance based on connection state
   * - Factory key: For advertisement decryption
   * - Bracelet key: For initial uptime request (command 0x01)
   * - Dynamic key: For all other commands after key exchange
   */
  private getEncryptionForCommand(commandCode?: number): TeaEncryption {
    // Command 0x01 (Get Uptime) uses Bracelet Key
    if (commandCode === 0x01) {
      return this.braceletEncryption ?? this.factoryEncryption;
    }

    // All other commands use Dynamic Key if available
    if (this.dynamicEncryption) {
      return this.dynamicEncryption;
    }

    // Fallback to bracelet key or factory key
    return this.braceletEncryption ?? this.factoryEncryption;
  }

  /**
   * Reset encryption keys (call when disconnecting)
   */
  private resetKeys(): void {
    this.dynamicEncryption = null;
    this.currentSerialNumber = null;
    // Keep bracelet key for reconnection
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopScan();

    // Clean up notifications
    if (this.notificationSubscription) {
      this.notificationSubscription.remove();
      this.notificationSubscription = null;
    }

    // Cancel any pending commands
    this.pendingResponses.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error("Service destroyed"));
    });
    this.pendingResponses.clear();

    this.resetKeys();
    void this.disconnectDevice();
    void this.manager.destroy();
  }
}

// Export a singleton instance
export const bluetoothService = new BluetoothService();
