/**
 * useBLEConnection Hook
 *
 * Manages BLE device connection lifecycle including:
 * - Connecting to devices by serial number or peripheral
 * - Disconnecting from devices
 * - Connection state management
 * - Encryption key generation and storage
 */

import type { Peripheral } from "react-native-ble-manager";
import { useCallback, useRef } from "react";
import { Platform } from "react-native";
import BleManager, {
  BleScanCallbackType,
  BleScanMatchMode,
  BleScanMode,
} from "react-native-ble-manager";
import * as SecureStore from "expo-secure-store";

import type {
  BLEConnectionConfig,
  BLEConnectionProgress,
  BLEDeviceInfo,
} from "~/contexts/BLEContext";
import { createGetDeviceInfoRequest } from "~/services/ble/commands/getDeviceInfo";
import {
  createGetUptimeRequest,
  parseGetUptimeResponse,
} from "~/services/ble/commands/getUptime";
import { createSetTimeRequest } from "~/services/ble/commands/setTime";
import { disconnectFromBLEDevice } from "~/services/ble/connection";
import {
  extractAndDecryptAdvertisementData,
  generateDynamicKey,
} from "~/services/ble/encryption";
import { sendCommand, startNotifications } from "~/services/ble/manager";
import { FACTORY_BRACELET_KEY, ResponseStatus } from "~/services/ble/types";

export type BLEConnectionCallback = (progress: BLEConnectionProgress) => void;

const DEFAULT_CONFIG: Required<BLEConnectionConfig> = {
  maxRetries: 3,
  connectionTimeoutMs: 20000,
  stabilizationDelayMs: 900,
  mtuSize: 512,
  scanTimeoutSeconds: 10,
};

interface UseBLEConnectionProps {
  onConnectionStateChange: (
    state: "disconnected" | "scanning" | "connecting" | "connected" | "error",
  ) => void;
  onDeviceConnected: (device: BLEDeviceInfo, encryptionKey: string) => void;
  onDeviceDisconnected: () => void;
}

export function useBLEConnection({
  onConnectionStateChange,
  onDeviceConnected,
  onDeviceDisconnected,
}: UseBLEConnectionProps) {
  const isConnectingRef = useRef(false);

  /**
   * Disconnect from all currently connected BLE devices
   */
  const disconnectAllDevices = useCallback(async () => {
    const connectedDevices = await BleManager.getConnectedPeripherals([]);

    if (connectedDevices.length > 0) {
      console.log(
        `🔌 [BLE Connection] Disconnecting ${connectedDevices.length} device(s)...`,
      );

      for (const peripheral of connectedDevices) {
        try {
          await disconnectFromBLEDevice(peripheral.id);
          console.log(`✅ [BLE Connection] Disconnected from ${peripheral.id}`);
        } catch (error) {
          console.warn(
            `⚠️ [BLE Connection] Failed to disconnect from ${peripheral.id}:`,
            error,
          );
        }
      }

      // Wait for disconnections to complete
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }, []);

  /**
   * Connect to a peripheral that has already been discovered
   */
  const connectToPeripheral = useCallback(
    async (
      peripheral: Peripheral,
      serialNumber: string,
      onProgress?: BLEConnectionCallback,
      config?: Partial<BLEConnectionConfig>,
    ) => {
      if (isConnectingRef.current) {
        throw new Error("Connection already in progress");
      }

      isConnectingRef.current = true;
      const finalConfig = { ...DEFAULT_CONFIG, ...config };

      try {
        onConnectionStateChange("connecting");

        onProgress?.({
          step: "connecting",
          progress: 60,
          message: "🔗 Connecting to device...",
        });

        // Check if already connected and disconnect first
        const isConnected = await BleManager.isPeripheralConnected(
          peripheral.id,
        );
        if (isConnected) {
          try {
            await BleManager.disconnect(peripheral.id);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (disconnectError) {
            console.warn("Disconnect error:", disconnectError);
          }
        }

        let connected = false;
        let lastError: Error | null = null;

        // Retry loop for connection
        for (
          let attempt = 1;
          attempt <= finalConfig.maxRetries && !connected;
          attempt++
        ) {
          console.log(
            `🔄 [BLE Connection] Attempt ${attempt}/${finalConfig.maxRetries}`,
          );

          onProgress?.({
            step: "connecting",
            progress: 60 + (attempt - 1) * 10,
            message: `🔗 Connection attempt ${attempt}/${finalConfig.maxRetries}...`,
          });

          try {
            // Connect with timeout
            const connectPromise = BleManager.connect(peripheral.id);
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `Connection timeout after ${finalConfig.connectionTimeoutMs / 1000}s`,
                    ),
                  ),
                finalConfig.connectionTimeoutMs,
              );
            });

            await Promise.race([connectPromise, timeoutPromise]);

            // Stabilization delay
            await new Promise((resolve) =>
              setTimeout(resolve, finalConfig.stabilizationDelayMs),
            );

            // Verify connection
            const isNowConnected = await BleManager.isPeripheralConnected(
              peripheral.id,
            );
            if (!isNowConnected) {
              throw new Error("Connection verification failed");
            }

            // Configure MTU for Android
            if (Platform.OS === "android") {
              try {
                await BleManager.requestMTU(peripheral.id, finalConfig.mtuSize);
              } catch (mtuError) {
                console.warn("MTU configuration failed:", mtuError);
              }
            }

            // Retrieve services and start notifications
            await BleManager.retrieveServices(peripheral.id);
            await startNotifications(peripheral.id);

            connected = true;
          } catch (attemptError) {
            lastError =
              attemptError instanceof Error
                ? attemptError
                : new Error(String(attemptError));
            console.error(
              `❌ [BLE Connection] Attempt ${attempt} failed:`,
              lastError.message,
            );

            if (attempt < finalConfig.maxRetries) {
              const retryDelay = 2000;
              onProgress?.({
                step: "retrying",
                progress: 60 + (attempt - 1) * 10,
                message: `⏳ Attempt ${attempt} failed, retrying in ${retryDelay / 1000}s...`,
              });
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
          }
        }

        if (!connected) {
          throw lastError ?? new Error("Connection failed after all attempts");
        }

        onProgress?.({
          step: "generating_key",
          progress: 80,
          message: "🔐 Generating encryption key...",
        });

        // Generate encryption key
        const uptimeResponse = await sendCommand({
          peripheralId: peripheral.id,
          command: createGetUptimeRequest(),
          encryptionKey: FACTORY_BRACELET_KEY,
        });

        const uptimeData = parseGetUptimeResponse(uptimeResponse.payload);
        const encryptionKey = generateDynamicKey(
          FACTORY_BRACELET_KEY,
          uptimeData.uptimeBytes,
          serialNumber,
        );

        onProgress?.({
          step: "validating",
          progress: 90,
          message: "📋 Validating connection...",
        });

        // Validate with device info
        const deviceInfoResponse = await sendCommand({
          peripheralId: peripheral.id,
          command: createGetDeviceInfoRequest(),
          encryptionKey,
        });

        if (deviceInfoResponse.status !== ResponseStatus.OK) {
          throw new Error(
            `Device info validation failed: Status=0x${deviceInfoResponse.status.toString(16)}`,
          );
        }

        // Sync device time
        try {
          await sendCommand({
            peripheralId: peripheral.id,
            command: createSetTimeRequest(new Date()),
            encryptionKey,
            timeoutMs: 10000,
          });
        } catch (timeError) {
          console.warn("Failed to sync device time (non-critical):", timeError);
        }

        // Store encryption key securely
        const sanitizedDeviceId = peripheral.id.replace(
          /[^a-zA-Z0-9._-]/g,
          "_",
        );
        await SecureStore.setItemAsync(
          `ble_device_${sanitizedDeviceId}`,
          encryptionKey,
        );

        // Update state
        const deviceInfo: BLEDeviceInfo = {
          id: peripheral.id,
          name: peripheral.name,
          serialNumber,
          peripheral,
        };

        onDeviceConnected(deviceInfo, encryptionKey);
        onConnectionStateChange("connected");

        onProgress?.({
          step: "connection_complete",
          progress: 100,
          message: "🎉 Device connected successfully!",
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        onProgress?.({
          step: "error",
          progress: 0,
          message: `❌ Connection failed: ${errorMessage}`,
          isError: true,
        });
        onConnectionStateChange("error");
        throw error;
      } finally {
        isConnectingRef.current = false;
      }
    },
    [onConnectionStateChange, onDeviceConnected],
  );

  /**
   * Scan for a specific device and connect to it
   */
  const connectToDevice = useCallback(
    async (
      serialNumber: string,
      onProgress?: BLEConnectionCallback,
      config?: Partial<BLEConnectionConfig>,
    ) => {
      const finalConfig = { ...DEFAULT_CONFIG, ...config };

      onProgress?.({
        step: "starting",
        progress: 0,
        message: "🔍 Starting connection process...",
      });

      try {
        // Stop any ongoing scan
        try {
          await BleManager.stopScan();
          await new Promise((resolve) => setTimeout(resolve, 900));
        } catch {
          // Ignore - no scan to stop
        }

        onConnectionStateChange("scanning");

        // Disconnect all existing connections
        onProgress?.({
          step: "checking_existing",
          progress: 10,
          message: "📱 Checking for existing connections...",
        });
        await disconnectAllDevices();

        // Scan for device
        onProgress?.({
          step: "scanning",
          progress: 30,
          message: "🔍 Scanning for device...",
        });

        const foundPeripheral = await scanForTargetDevice(
          serialNumber,
          finalConfig,
          onProgress,
        );

        if (!foundPeripheral) {
          throw new Error("Device not found during scan");
        }

        // Connect to found device
        await connectToPeripheral(
          foundPeripheral,
          serialNumber,
          onProgress,
          finalConfig,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        onProgress?.({
          step: "error",
          progress: 0,
          message: `❌ Connection failed: ${errorMessage}`,
          isError: true,
        });
        onConnectionStateChange("error");
        throw error;
      }
    },
    [onConnectionStateChange, disconnectAllDevices, connectToPeripheral],
  );

  /**
   * Disconnect from the current device
   */
  const disconnectDevice = useCallback(
    async (connectedDevice: BLEDeviceInfo | null) => {
      if (connectedDevice) {
        try {
          await disconnectFromBLEDevice(connectedDevice.id);

          // Remove stored encryption key
          const sanitizedDeviceId = connectedDevice.id.replace(
            /[^a-zA-Z0-9._-]/g,
            "_",
          );
          try {
            await SecureStore.deleteItemAsync(
              `ble_device_${sanitizedDeviceId}`,
            );
          } catch (keyError) {
            console.warn("Failed to remove encryption key:", keyError);
          }
        } catch (error) {
          console.warn("Disconnect error:", error);
        }
      }

      onDeviceDisconnected();
      onConnectionStateChange("disconnected");
    },
    [onConnectionStateChange, onDeviceDisconnected],
  );

  return {
    connectToDevice,
    connectToPeripheral,
    disconnectDevice,
    disconnectAllDevices,
  };
}

/**
 * Scan for a specific target device by serial number
 */
async function scanForTargetDevice(
  serialNumber: string,
  config: Required<BLEConnectionConfig>,
  onProgress?: BLEConnectionCallback,
): Promise<Peripheral | null> {
  return new Promise((resolve, reject) => {
    let foundDevice: Peripheral | null = null;
    let isResolved = false;

    const scanTimeout = setTimeout(() => {
      if (isResolved) return;

      BleManager.stopScan()
        .then(() => {
          if (!foundDevice && !isResolved) {
            isResolved = true;
            onProgress?.({
              step: "scan_timeout",
              progress: 0,
              message: "❌ Device not found within timeout",
              isError: true,
            });
            resolve(null);
          }
        })
        .catch(reject);
    }, config.scanTimeoutSeconds * 1000);

    const handleDiscoverPeripheral = (peripheral: Peripheral) => {
      if (isResolved) return;
      const advName =
        peripheral.name ?? peripheral.advertising?.localName ?? "";
      if (!/^gently/i.test(advName)) return;

      if (peripheral.advertising.manufacturerRawData) {
        try {
          const adData = extractAndDecryptAdvertisementData(
            peripheral.advertising.manufacturerRawData,
          );

          if (
            adData &&
            (adData.serialNumber === serialNumber ||
              adData.serialNumber.toUpperCase() === serialNumber.toUpperCase())
          ) {
            foundDevice = peripheral;
            isResolved = true;
            clearTimeout(scanTimeout);

            onProgress?.({
              step: "device_found",
              progress: 50,
              message: `✅ Target device found: ${serialNumber}`,
            });

            resolve(peripheral);

            // Stop scan in background
            BleManager.stopScan().catch((error) => {
              console.warn("Error stopping scan after device found:", error);
            });
          }
        } catch (error) {
          console.warn("Error processing advertisement data:", error);
        }
      }
    };

    BleManager.onDiscoverPeripheral(handleDiscoverPeripheral);

    BleManager.scan({
      serviceUUIDs: [],
      seconds: config.scanTimeoutSeconds,
      allowDuplicates: false,
      matchMode: BleScanMatchMode.Sticky,
      scanMode: BleScanMode.LowLatency,
      callbackType: BleScanCallbackType.AllMatches,
    }).catch((error) => {
      clearTimeout(scanTimeout);
      reject(new Error(error instanceof Error ? error.message : String(error)));
    });
  });
}
