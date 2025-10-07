import type {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  Peripheral,
} from "react-native-ble-manager";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import BleManager, {
  BleScanCallbackType,
  BleScanMatchMode,
  BleScanMode,
} from "react-native-ble-manager";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";

import type { AdvertisementData } from "~/services/ble/types";
import { Header } from "~/components/ui/Header";
import {
  createGetDeviceInfoRequest,
  parseGetDeviceInfoResponse,
} from "~/services/ble/commands/getDeviceInfo";
import {
  createGetUptimeRequest,
  parseGetUptimeResponse,
} from "~/services/ble/commands/getUptime";
import {
  createSetTimeRequest,
  parseSetTimeResponse,
} from "~/services/ble/commands/setTime";
import {
  extractAndDecryptAdvertisementData,
  generateDynamicKey,
} from "~/services/ble/encryption";
import {
  sendCommand,
  startNotifications,
  stopNotifications,
} from "~/services/ble/manager";
import { FACTORY_BRACELET_KEY, ResponseStatus } from "~/services/ble/types";
import { requestBluetoothPermissions } from "~/services/ble/utils";
import {
  buttons,
  buttonText,
  cards,
  colors,
  containers,
  emptyStates,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";

interface DiscoveredGentlyDevice {
  peripheral: Peripheral;
  advertisementData: AdvertisementData;
  isAlreadyPaired: boolean;
}

interface PairingStatus {
  step: string;
  progress: number; // 0-100
  isComplete: boolean;
  error?: string;
}

interface PairingSuccess {
  deviceName: string;
  deviceId: string;
  serialNumber: string;
}

interface DebugLog {
  timestamp: string;
  level: "info" | "warning" | "error" | "success";
  message: string;
  details?: Record<string, unknown>;
}

const AddDeviceScreen = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus | null>(
    null,
  );
  const [pairingSuccess, setPairingSuccess] = useState<PairingSuccess | null>(
    null,
  );
  const [hasScanned, setHasScanned] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState(
    new Map<Peripheral["id"], DiscoveredGentlyDevice>(),
  );
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);

  // Debug logging functions
  const addDebugLog = useCallback(
    (level: DebugLog["level"], message: string, details?: unknown) => {
      const log: DebugLog = {
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        details: details as Record<string, unknown>,
      };
      setDebugLogs((prev) => [...prev, log]);
      console.log(`[${level.toUpperCase()}] ${message}`, details ?? "");
    },
    [],
  );

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  const handleDiscoverPeripheral = useCallback(
    async (peripheral: Peripheral) => {
      // Only log and process Gently devices
      if (!peripheral.name?.includes("Gently")) {
        return;
      }

      console.log(`📱 Discovered Gently device: ${peripheral.id}`);

      try {
        const manufacturerData = peripheral.advertising.manufacturerRawData;

        const advertisementData =
          extractAndDecryptAdvertisementData(manufacturerData);

        if (!advertisementData) {
          console.warn(
            `⚠️ Could not decrypt advertisement data for device: ${peripheral.id}`,
          );
          return;
        }

        // Check if device is already paired by looking up serial number in database
        const existingDevice = await trpc.device.findBySerialNumber.query({
          serialNumber: advertisementData.serialNumber,
        });

        const discoveredDevice: DiscoveredGentlyDevice = {
          peripheral,
          advertisementData,
          isAlreadyPaired: !!existingDevice,
        };

        setDiscoveredDevices((prev) =>
          new Map(prev).set(peripheral.id, discoveredDevice),
        );

        const pairingStatus = existingDevice
          ? "already paired"
          : "available to pair";
        console.log(
          `✅ Gently device ${advertisementData.serialNumber} (${pairingStatus})`,
        );
      } catch (error) {
        console.error("❌ Error processing Gently device:", error);
      }
    },
    [],
  );

  const handleStopScan = () => {
    setIsScanning(false);
    console.log("[handleStopScan] scan is stopped.");
  };

  const handleDisconnectedPeripheral = (
    event: BleDisconnectPeripheralEvent,
  ) => {
    console.log(
      `[handleDisconnectedPeripheral][${event.peripheral}] disconnected.`,
    );
  };

  const handleUpdateValueForCharacteristic = (
    data: BleManagerDidUpdateValueForCharacteristicEvent,
  ) => {
    console.log(
      `[handleUpdateValueForCharacteristic] received data from '${data.peripheral}' with characteristic='${data.characteristic}'`,
      data.value,
    );
  };

  useEffect(() => {
    BleManager.start({ showAlert: false })
      .then(() => {
        console.log("BleManager started.");
      })
      .catch((error) => {
        console.error("BleManager could not be started.", error);
      });

    const listeners = [
      BleManager.onDiscoverPeripheral(handleDiscoverPeripheral),
      BleManager.onStopScan(handleStopScan),
      BleManager.onDisconnectPeripheral(handleDisconnectedPeripheral),
      BleManager.onDidUpdateValueForCharacteristic(
        handleUpdateValueForCharacteristic,
      ),
    ];

    void requestBluetoothPermissions();

    return () => {
      console.debug("[app] main component unmounting. Removing listeners...");
      for (const listener of listeners) {
        listener.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScan = () => {
    if (!isScanning) {
      // Reset found devices before scan
      setDiscoveredDevices(new Map<Peripheral["id"], DiscoveredGentlyDevice>());
      setHasScanned(true);

      try {
        console.debug("[startScan] starting scan...");
        setIsScanning(true);
        BleManager.scan([], 5, false, {
          matchMode: BleScanMatchMode.Sticky,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
          legacy: false,
        })
          .then(() => {
            console.debug("[startScan] scan promise returned successfully.");
          })
          .catch((err) => {
            console.error("[startScan] ble scan returned in error", err);
            setIsScanning(false);
            Alert.alert(
              "Scan Error",
              "Failed to scan for devices. Please try again.",
            );
          });
      } catch (error) {
        console.error("[startScan] ble scan error thrown", error);
        setIsScanning(false);
        Alert.alert(
          "Scan Error",
          "Failed to start scanning. Please try again.",
        );
      }
    }
  };

  const connectToDevice = async (device: DiscoveredGentlyDevice) => {
    if (isConnecting || device.isAlreadyPaired) return;

    const { peripheral, advertisementData } = device;
    setIsConnecting(peripheral.id);

    try {
      clearDebugLogs();
      addDebugLog(
        "info",
        `Starting pairing process for device: ${peripheral.id}`,
        {
          deviceName: peripheral.name,
          serialNumber: advertisementData.serialNumber,
          batteryLevel: advertisementData.batteryLevel,
        },
      );

      // Step 1: Connect to device
      setPairingStatus({
        step: "Connecting to device...",
        progress: 10,
        isComplete: false,
      });
      addDebugLog("info", "Step 1: Initiating BLE connection");

      // stop scan if it is still running
      if (isScanning) {
        addDebugLog("info", "Stopping active scan before connection");
        await BleManager.stopScan();
      }

      // Step 2: Use standardized connection process
      setPairingStatus({
        step: "Connecting to device (up to 60s)...",
        progress: 20,
        isComplete: false,
      });
      addDebugLog(
        "info",
        "Step 2: Starting detailed inline BLE connection with debug logging",
        {
          maxRetries: 3,
          connectionTimeout: 20000,
          stabilizationDelay: 900,
          mtuSize: 512,
          platform: Platform.OS,
        },
      );

      // Inline BLE connection with detailed logging
      const maxRetries = 3;
      const connectionTimeout = 20000; // 20 seconds per attempt
      const stabilizationDelay = 900;
      const mtuSize = 512;

      // Check existing connection
      addDebugLog("info", "Checking existing connection status");
      const isConnected = await BleManager.isPeripheralConnected(peripheral.id);
      if (isConnected) {
        addDebugLog("warning", "Device already connected, disconnecting first");
        await BleManager.disconnect(peripheral.id);
        await new Promise((resolve) => setTimeout(resolve, 500));
        addDebugLog("info", "Previous connection disconnected");
      } else {
        addDebugLog("info", "No existing connection found");
      }

      // Connection attempts with retries
      let connectionSuccess = false;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          addDebugLog(
            "info",
            `Connection attempt ${attempt}/${maxRetries} (${connectionTimeout / 1000}s timeout)`,
            {
              deviceId: peripheral.id,
              attempt,
              maxRetries,
              timeout: connectionTimeout,
            },
          );

          // Create connection with timeout
          const connectionPromise = BleManager.connect(peripheral.id);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Connection timeout after ${connectionTimeout / 1000} seconds`,
                  ),
                ),
              connectionTimeout,
            );
          });

          await Promise.race([connectionPromise, timeoutPromise]);

          addDebugLog("success", `Connected to device on attempt ${attempt}`, {
            deviceId: peripheral.id,
            attempt,
            timeElapsed: `${connectionTimeout / 1000}s or less`,
          });
          connectionSuccess = true;
          break;
        } catch (connectionError) {
          lastError =
            connectionError instanceof Error
              ? connectionError
              : new Error(String(connectionError));
          addDebugLog("warning", `Connection attempt ${attempt} failed`, {
            attempt,
            error: lastError.message,
            deviceId: peripheral.id,
            willRetry: attempt < maxRetries,
          });

          if (attempt < maxRetries) {
            addDebugLog(
              "info",
              `Waiting 1 second before retry (next attempt will timeout after ${connectionTimeout / 1000}s)`,
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      if (!connectionSuccess) {
        const errorMessage = `Failed to connect after ${maxRetries} attempts (${(maxRetries * connectionTimeout) / 1000}s total). ${lastError?.message ?? "Unknown error"}`;
        addDebugLog("error", "All connection attempts failed", {
          maxRetries,
          finalError: lastError?.message,
          deviceId: peripheral.id,
          rssi: peripheral.rssi,
        });
        throw new Error(errorMessage);
      }

      // Connection stabilization
      addDebugLog(
        "info",
        `Waiting ${stabilizationDelay}ms for connection stabilization`,
      );
      await new Promise((resolve) => setTimeout(resolve, stabilizationDelay));
      addDebugLog("success", "Connection stabilization complete");

      // Configure MTU for Android
      if (Platform.OS === "android") {
        addDebugLog("info", `Configuring MTU for Android (${mtuSize} bytes)`);
        try {
          await BleManager.requestMTU(peripheral.id, mtuSize);
          addDebugLog("success", `MTU ${mtuSize} configured successfully`);
        } catch (mtuError) {
          const mtuMessage =
            mtuError instanceof Error ? mtuError.message : String(mtuError);
          addDebugLog("warning", `MTU configuration failed: ${mtuMessage}`, {
            error: mtuMessage,
            requestedMTU: mtuSize,
          });
        }
      } else {
        addDebugLog(
          "info",
          `Skipping MTU configuration (Platform: ${Platform.OS})`,
        );
      }

      // Discover services
      addDebugLog("info", "Discovering BLE services and characteristics");
      try {
        // Use Promise.race with timeout to prevent hanging (GitHub community fix)
        await Promise.race([
          BleManager.retrieveServices(peripheral.id),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Service discovery timeout after 3000ms")),
              3000,
            ),
          ),
        ]);
        addDebugLog("success", "BLE services discovered successfully");
      } catch (servicesError) {
        const servicesMessage =
          servicesError instanceof Error
            ? servicesError.message
            : String(servicesError);
        addDebugLog("error", `Service discovery failed: ${servicesMessage}`, {
          error: servicesMessage,
          deviceId: peripheral.id,
          isTimeout: servicesMessage.includes("timeout"),
        });
        throw new Error(`Service discovery failed: ${servicesMessage}`);
      }

      // Start notifications
      addDebugLog("info", "Starting BLE notifications");
      try {
        await startNotifications(peripheral.id);
        addDebugLog("success", "BLE notifications started successfully");
      } catch (notificationError) {
        const notificationMessage =
          notificationError instanceof Error
            ? notificationError.message
            : String(notificationError);
        addDebugLog(
          "error",
          `Notification setup failed: ${notificationMessage}`,
          {
            error: notificationMessage,
            deviceId: peripheral.id,
          },
        );
        throw new Error(`Notification setup failed: ${notificationMessage}`);
      }

      addDebugLog("success", "BLE connection fully established");

      // Step 3: Setup communication is complete (handled by connectToBLEDevice)
      setPairingStatus({
        step: "Setting up communication...",
        progress: 30,
        isComplete: false,
      });
      addDebugLog(
        "info",
        "Step 3: BLE services and characteristics discovered",
      );

      // Step 4: Send GetUptime command using factory key
      setPairingStatus({
        step: "Authenticating with device...",
        progress: 40,
        isComplete: false,
      });
      addDebugLog("info", "Step 4: Sending GetUptime command with factory key");
      const uptimeCommand = createGetUptimeRequest();
      const uptimeResponse = await sendCommand({
        peripheralId: peripheral.id,
        command: uptimeCommand,
        encryptionKey: FACTORY_BRACELET_KEY,
        timeoutMs: 5000,
      });

      if (uptimeResponse.status !== ResponseStatus.OK) {
        addDebugLog("error", "GetUptime command failed", {
          status: uptimeResponse.status,
          payload: uptimeResponse.payload,
        });
        throw new Error(
          `GetUptime command failed with status: ${uptimeResponse.status}`,
        );
      }

      const uptimeData = parseGetUptimeResponse(uptimeResponse.payload);
      addDebugLog("success", `Device uptime received: ${uptimeData.uptime}ms`, {
        uptime: uptimeData.uptime,
        uptimeBytes: uptimeData.uptimeBytes,
      });

      // Step 5: Generate custom dynamic key
      setPairingStatus({
        step: "Generating secure key...",
        progress: 60,
        isComplete: false,
      });
      addDebugLog("info", "Step 5: Generating custom dynamic encryption key");
      const customKey = generateDynamicKey(
        FACTORY_BRACELET_KEY,
        uptimeData.uptimeBytes,
        advertisementData.serialNumber,
      );
      addDebugLog("success", "Custom encryption key generated", {
        keyLength: customKey.length,
        deviceId: peripheral.id,
        serialNumber: advertisementData.serialNumber,
        uptime: uptimeData.uptime,
      });

      // Step 6: Send GetDeviceInfo command using custom key
      setPairingStatus({
        step: "Verifying secure connection...",
        progress: 70,
        isComplete: false,
      });
      addDebugLog(
        "info",
        "Step 6: Sending GetDeviceInfo command with custom key",
      );
      const deviceInfoCommand = createGetDeviceInfoRequest();
      const deviceInfoResponse = await sendCommand({
        peripheralId: peripheral.id,
        command: deviceInfoCommand,
        encryptionKey: customKey,
        timeoutMs: 5000,
      });

      if (deviceInfoResponse.status !== ResponseStatus.OK) {
        addDebugLog("error", "GetDeviceInfo command failed", {
          status: deviceInfoResponse.status,
          payload: deviceInfoResponse.payload,
        });
        throw new Error(
          `GetDeviceInfo command failed with status: ${deviceInfoResponse.status}`,
        );
      }

      const deviceInfo = parseGetDeviceInfoResponse(deviceInfoResponse.payload);
      addDebugLog("success", "Device info received successfully", deviceInfo);

      // Step 7: Store custom key in secure storage
      setPairingStatus({
        step: "Storing device credentials...",
        progress: 80,
        isComplete: false,
      });
      addDebugLog("info", "Step 7: Storing encryption key in secure storage");
      // Sanitize device ID for SecureStore (remove colons and other invalid chars)
      const sanitizedDeviceId = peripheral.id.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageKey = `ble_device_key_${sanitizedDeviceId}`;
      await SecureStore.setItemAsync(
        storageKey,
        JSON.stringify({
          deviceId: peripheral.id,
          serialNumber: advertisementData.serialNumber,
          customEncryptionKey: customKey,
          createdAt: Date.now(),
          apiVersion: 1,
        }),
      );
      addDebugLog("success", "Encryption key stored securely", {
        storageKey,
        deviceId: peripheral.id,
      });

      // Step 8: Create device in database
      setPairingStatus({
        step: "Registering device...",
        progress: 90,
        isComplete: false,
      });
      addDebugLog("info", "Step 8: Creating device record in database");
      const newDevice = await trpc.device.create.mutate({
        title: `Gently ${advertisementData.serialNumber.slice(-4)}`,
        description: `Gently Bracelet (${advertisementData.serialNumber})`,
        serialNumber: advertisementData.serialNumber,
        batteryLevel: advertisementData.batteryLevel,
        firmwareVersion: `${deviceInfo.firmwareVersionMajor}.${deviceInfo.firmwareVersionMinor}.${deviceInfo.firmwareBuildNumber}`,
      });
      addDebugLog("success", "Device created in database", {
        deviceId: newDevice?.id,
        title: newDevice?.title,
      });

      // Step 9: Set device time to current time
      setPairingStatus({
        step: "Synchronizing device time...",
        progress: 95,
        isComplete: false,
      });
      addDebugLog("info", "Step 9: Synchronizing device time");
      const currentTime = new Date();
      const setTimeCommand = createSetTimeRequest(currentTime);
      const setTimeResponse = await sendCommand({
        peripheralId: peripheral.id,
        command: setTimeCommand,
        encryptionKey: customKey,
        timeoutMs: 5000,
      });

      if (setTimeResponse.status === ResponseStatus.OK) {
        parseSetTimeResponse(setTimeResponse.payload);
        addDebugLog(
          "success",
          `Device time synchronized to: ${currentTime.toISOString()}`,
        );
      } else {
        addDebugLog(
          "warning",
          `Failed to set device time, status: ${setTimeResponse.status}`,
          {
            status: setTimeResponse.status,
            payload: setTimeResponse.payload,
          },
        );
        // Don't fail the pairing process if time sync fails
      }

      // Step 10: Stop notifications and disconnect (optional, device will stay connected)
      setPairingStatus({
        step: "Finalizing pairing...",
        progress: 100,
        isComplete: true,
      });
      addDebugLog("info", "Step 10: Stopping notifications and finalizing");
      await stopNotifications(peripheral.id);

      // Step 11: Show success message
      addDebugLog("success", `Device paired successfully: ${newDevice?.title}`);
      if (newDevice?.id) {
        setPairingSuccess({
          deviceName: newDevice.title,
          deviceId: newDevice.id,
          serialNumber: advertisementData.serialNumber,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      addDebugLog(
        "error",
        `Pairing failed for device ${peripheral.id}: ${errorMessage}`,
        {
          error: errorMessage,
          deviceId: peripheral.id,
          deviceName: peripheral.name,
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      // Cleanup on error
      try {
        addDebugLog("info", "Attempting cleanup after error");
        await stopNotifications(peripheral.id);
        await BleManager.disconnect(peripheral.id);
        addDebugLog("info", "Cleanup completed successfully");
      } catch (cleanupError) {
        const cleanupMessage =
          cleanupError instanceof Error
            ? cleanupError.message
            : "Unknown cleanup error";
        addDebugLog(
          "warning",
          `Cleanup error: ${cleanupMessage}`,
          cleanupError,
        );
      }

      // Check if this was a connection failure specifically
      const isConnectionFailure =
        error instanceof Error &&
        (error.message.includes("Connection timeout") ||
          error.message.includes("Failed to connect after") ||
          error.message.includes("Connection failed"));

      if (isConnectionFailure) {
        Alert.alert(
          "Connection Failed",
          `Unable to connect to ${peripheral.name}. ${error instanceof Error ? error.message : "Please ensure the device is in pairing mode and try scanning again."}\n\nTap 'View Debug Logs' to see detailed connection information.`,
          [
            {
              text: "View Debug Logs",
              onPress: () => setShowDebugLogs(true),
            },
            {
              text: "Try Again",
              onPress: () => {
                // Reset scan state to allow user to scan again
                setDiscoveredDevices(new Map());
                setHasScanned(false);
                setIsScanning(false);
              },
            },
          ],
        );
      } else {
        Alert.alert(
          "Pairing Failed",
          `Could not pair with ${peripheral.name}. ${error instanceof Error ? error.message : "Please try again."}\n\nTap 'View Debug Logs' to see detailed connection information.`,
          [
            {
              text: "View Debug Logs",
              onPress: () => setShowDebugLogs(true),
            },
            { text: "OK" },
          ],
        );
      }
    } finally {
      setIsConnecting(null);
      setPairingStatus(null);
    }
  };

  const renderDeviceCard = (device: DiscoveredGentlyDevice) => {
    const { peripheral, advertisementData, isAlreadyPaired } = device;
    const isCurrentlyConnecting = isConnecting === peripheral.id;

    return (
      <Pressable
        key={peripheral.id}
        style={[
          cards.base,
          {
            marginBottom: spacing[3],
            opacity: isCurrentlyConnecting ? 0.7 : 1,
            borderLeftWidth: isAlreadyPaired ? 4 : 0,
            borderLeftColor: isAlreadyPaired
              ? colors.success[500]
              : "transparent",
          },
        ]}
        onPress={() => connectToDevice(device)}
        disabled={isConnecting !== null || isAlreadyPaired}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: isAlreadyPaired
                ? colors.success[100]
                : colors.primary[100],
              alignItems: "center",
              justifyContent: "center",
              marginRight: spacing[3],
            }}
          >
            <Ionicons
              name={isAlreadyPaired ? "checkmark-circle" : "watch"}
              size={24}
              color={
                isAlreadyPaired ? colors.success[600] : colors.primary[600]
              }
            />
          </View>

          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing[1],
              }}
            >
              <Text
                style={[typography.subtitle, { color: colors.text.primary }]}
              >
                {peripheral.name ?? "Unknown Device"}
              </Text>
              {isAlreadyPaired && (
                <View
                  style={{
                    backgroundColor: colors.success[100],
                    paddingHorizontal: spacing[2],
                    paddingVertical: spacing[1],
                    borderRadius: 12,
                    marginLeft: spacing[2],
                  }}
                >
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.success[700], fontWeight: "600" },
                    ]}
                  >
                    Paired
                  </Text>
                </View>
              )}
            </View>

            <Text
              style={[typography.caption, { color: colors.text.secondary }]}
            >
              Serial: {advertisementData.serialNumber}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: spacing[1],
              }}
            >
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Battery:{" "}
                {["Critical", "Low", "Medium", "Good", "Full"][
                  advertisementData.batteryLevel
                ] ?? "Unknown"}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.tertiary, marginLeft: spacing[2] },
                ]}
              >
                • {advertisementData.batteryVoltage}mV
              </Text>
              {advertisementData.chargingStatus && (
                <Ionicons
                  name="flash"
                  size={12}
                  color={colors.warning[500]}
                  style={{ marginLeft: spacing[1] }}
                />
              )}
            </View>
          </View>

          {isCurrentlyConnecting ? (
            <ActivityIndicator size="small" color={colors.primary[500]} />
          ) : isAlreadyPaired ? (
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.success[500]}
            />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.text.tertiary}
            />
          )}
        </View>

        {/* Pairing Progress Overlay */}
        {isCurrentlyConnecting && pairingStatus && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              borderRadius: 12,
              padding: spacing[4],
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View style={{ alignItems: "center", width: "100%" }}>
              <ActivityIndicator
                size="large"
                color={colors.primary[500]}
                style={{ marginBottom: spacing[3] }}
              />

              <Text
                style={[
                  typography.subtitle,
                  {
                    color: colors.text.primary,
                    textAlign: "center",
                    marginBottom: spacing[2],
                  },
                ]}
              >
                {pairingStatus.step}
              </Text>

              {/* Progress Bar */}
              <View
                style={{
                  width: "100%",
                  height: 4,
                  backgroundColor: colors.gray[200],
                  borderRadius: 2,
                  marginBottom: spacing[2],
                }}
              >
                <View
                  style={{
                    width: `${pairingStatus.progress}%`,
                    height: "100%",
                    backgroundColor: colors.primary[500],
                    borderRadius: 2,
                  }}
                />
              </View>

              <Text
                style={[
                  typography.caption,
                  {
                    color: colors.text.secondary,
                    textAlign: "center",
                  },
                ]}
              >
                {pairingStatus.progress}% complete
              </Text>

              {pairingStatus.isComplete && (
                <View style={{ marginTop: spacing[2], alignItems: "center" }}>
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.success[500]}
                  />
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.success[600],
                        marginTop: spacing[1],
                        fontWeight: "600",
                      },
                    ]}
                  >
                    Pairing Complete!
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  const renderEmptyState = () => {
    if (isScanning) {
      return (
        <View
          style={[
            emptyStates.container,
            {
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: spacing[8],
            },
          ]}
        >
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing[4],
            }}
          >
            <Ionicons name="search" size={48} color={colors.text.tertiary} />
          </View>
          <Text
            style={[
              typography.h3,
              {
                color: colors.text.primary,
                textAlign: "center",
                marginBottom: spacing[2],
              },
            ]}
          >
            Searching for Gently devices...
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, textAlign: "center" },
            ]}
          >
            Make sure your Gently device is in pairing mode
          </Text>
        </View>
      );
    }

    if (hasScanned) {
      return (
        <View
          style={[
            emptyStates.container,
            {
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: spacing[8],
            },
          ]}
        >
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing[4],
            }}
          >
            <Ionicons name="search" size={48} color={colors.text.tertiary} />
          </View>
          <Text
            style={[
              typography.h3,
              {
                color: colors.text.primary,
                textAlign: "center",
                marginBottom: spacing[2],
              },
            ]}
          >
            No devices found
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, textAlign: "center" },
            ]}
          >
            Make sure your Gently device is in pairing mode and try scanning
            again
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header title="Add Device" />

      <ScrollView
        style={containers.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View
          style={{
            alignItems: "center",
            marginTop: spacing[6],
            marginBottom: spacing[8],
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: colors.primary[100],
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing[4],
            }}
          >
            <Ionicons name="bluetooth" size={40} color={colors.primary[600]} />
          </View>

          <Text
            style={[
              typography.h2,
              {
                color: colors.text.primary,
                textAlign: "center",
                marginBottom: spacing[2],
              },
            ]}
          >
            Pair Your Gently Device
          </Text>

          <Text
            style={[
              typography.body,
              {
                color: colors.text.secondary,
                textAlign: "center",
                lineHeight: 20,
              },
            ]}
          >
            Make sure your Gently device is ready to pair and within range
          </Text>
        </View>

        {/* Scan Button */}
        <Pressable
          style={[
            buttons.primary,
            buttons.large,
            {
              marginBottom: spacing[6],
              opacity: isScanning ? 0.7 : 1,
            },
          ]}
          onPress={startScan}
          disabled={isScanning}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isScanning ? (
              <ActivityIndicator
                size="small"
                color={colors.text.inverse}
                style={{ marginRight: spacing[2] }}
              />
            ) : (
              <Ionicons
                name="search"
                size={20}
                color={colors.text.inverse}
                style={{ marginRight: spacing[2] }}
              />
            )}
            <Text style={[buttonText.primary, buttonText.large]}>
              {isScanning ? "Scanning..." : "Scan for Devices"}
            </Text>
          </View>
        </Pressable>

        {/* Debug Logs Button */}
        {debugLogs.length > 0 && (
          <Pressable
            style={[
              buttons.secondary,
              {
                marginBottom: spacing[4],
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
            onPress={() => setShowDebugLogs(true)}
          >
            <Ionicons
              name="bug-outline"
              size={16}
              color={colors.text.primary}
              style={{ marginRight: spacing[2] }}
            />
            <Text style={[buttonText.secondary]}>
              View Debug Logs ({debugLogs.length})
            </Text>
          </Pressable>
        )}

        {/* Device List */}
        {Array.from(discoveredDevices.values()).length > 0 ? (
          <View>
            <Text
              style={[
                typography.subtitle,
                { color: colors.text.primary, marginBottom: spacing[3] },
              ]}
            >
              Found Devices
            </Text>
            {Array.from(discoveredDevices.values()).map(renderDeviceCard)}
          </View>
        ) : (
          renderEmptyState()
        )}
      </ScrollView>

      {/* Success Modal Overlay */}
      {pairingSuccess && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: spacing[4],
          }}
        >
          <View
            style={[
              cards.base,
              {
                width: "100%",
                maxWidth: 400,
                padding: spacing[6],
                alignItems: "center",
              },
            ]}
          >
            {/* Success Icon */}
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.success[100],
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing[4],
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={48}
                color={colors.success[600]}
              />
            </View>

            {/* Success Message */}
            <Text
              style={[
                typography.h2,
                {
                  color: colors.text.primary,
                  textAlign: "center",
                  marginBottom: spacing[2],
                },
              ]}
            >
              Device Paired Successfully!
            </Text>

            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  textAlign: "center",
                  marginBottom: spacing[1],
                },
              ]}
            >
              {pairingSuccess.deviceName} is now connected and ready to use.
            </Text>

            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.tertiary,
                  textAlign: "center",
                  marginBottom: spacing[6],
                },
              ]}
            >
              Serial: {pairingSuccess.serialNumber}
            </Text>

            {/* Action Buttons */}
            <View style={{ width: "100%", gap: spacing[3] }}>
              <Pressable
                style={[buttons.primary, buttons.large]}
                onPress={() => {
                  router.push({
                    pathname: "/devices/[deviceId]",
                    params: { deviceId: pairingSuccess.deviceId },
                  });
                }}
              >
                <Text style={[buttonText.primary, buttonText.large]}>
                  Go to Device
                </Text>
              </Pressable>

              {/* Debug Logs Button */}
              {debugLogs.length > 0 && (
                <Pressable
                  style={[buttons.secondary, buttons.large]}
                  onPress={() => setShowDebugLogs(true)}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="bug-outline"
                      size={16}
                      color={colors.text.primary}
                      style={{ marginRight: spacing[2] }}
                    />
                    <Text style={[buttonText.secondary, buttonText.large]}>
                      View Debug Logs ({debugLogs.length})
                    </Text>
                  </View>
                </Pressable>
              )}

              <Pressable
                style={[buttons.secondary, buttons.large]}
                onPress={() => {
                  setPairingSuccess(null);
                  setDiscoveredDevices(new Map());
                  setHasScanned(false);
                }}
              >
                <Text style={[buttonText.secondary, buttonText.large]}>
                  Pair Another Device
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Debug Logs Modal */}
      <Modal
        visible={showDebugLogs}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDebugLogs(false)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: colors.background.primary }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: spacing[4],
              paddingVertical: spacing[3],
              borderBottomWidth: 1,
              borderBottomColor: colors.border.light,
            }}
          >
            <Text style={[typography.h3, { color: colors.text.primary }]}>
              Debug Logs
            </Text>
            <View style={{ flexDirection: "row", gap: spacing[3] }}>
              <Pressable
                style={[
                  buttons.secondary,
                  {
                    paddingHorizontal: spacing[3],
                    paddingVertical: spacing[2],
                  },
                ]}
                onPress={async () => {
                  const logText = debugLogs
                    .map(
                      (log) =>
                        `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}${
                          log.details
                            ? `\nDetails: ${JSON.stringify(log.details, null, 2)}`
                            : ""
                        }`,
                    )
                    .join("\n\n");

                  try {
                    await Share.share({
                      message: `Gently App Debug Logs\n\n${logText}`,
                      title: "Debug Logs",
                    });
                  } catch {
                    Alert.alert("Error", "Could not share debug logs");
                  }
                }}
              >
                <Text style={[buttonText.secondary]}>Share</Text>
              </Pressable>
              <Pressable
                style={[
                  buttons.secondary,
                  {
                    paddingHorizontal: spacing[3],
                    paddingVertical: spacing[2],
                  },
                ]}
                onPress={clearDebugLogs}
              >
                <Text style={[buttonText.secondary]}>Clear</Text>
              </Pressable>
              <Pressable
                style={[
                  buttons.secondary,
                  {
                    paddingHorizontal: spacing[3],
                    paddingVertical: spacing[2],
                  },
                ]}
                onPress={() => setShowDebugLogs(false)}
              >
                <Text style={[buttonText.secondary]}>Close</Text>
              </Pressable>
            </View>
          </View>

          {/* Debug Logs Content */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: spacing[4] }}
          >
            {debugLogs.length === 0 ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: spacing[8],
                }}
              >
                <Ionicons
                  name="document-text-outline"
                  size={48}
                  color={colors.text.tertiary}
                  style={{ marginBottom: spacing[3] }}
                />
                <Text
                  style={[
                    typography.body,
                    { color: colors.text.secondary, textAlign: "center" },
                  ]}
                >
                  No debug logs yet.{"\n"}
                  Try connecting to a device to see logs here.
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing[3] }}>
                {debugLogs.map((log, index) => (
                  <View
                    key={index}
                    style={[
                      cards.base,
                      {
                        padding: spacing[3],
                        borderLeftWidth: 4,
                        borderLeftColor:
                          log.level === "error"
                            ? colors.error[500]
                            : log.level === "warning"
                              ? colors.warning[500]
                              : log.level === "success"
                                ? colors.success[500]
                                : colors.primary[500],
                      },
                    ]}
                  >
                    {/* Log Header */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: spacing[2],
                      }}
                    >
                      <View
                        style={{
                          backgroundColor:
                            log.level === "error"
                              ? colors.error[100]
                              : log.level === "warning"
                                ? colors.warning[100]
                                : log.level === "success"
                                  ? colors.success[100]
                                  : colors.primary[100],
                          paddingHorizontal: spacing[2],
                          paddingVertical: spacing[1],
                          borderRadius: 8,
                          marginRight: spacing[2],
                        }}
                      >
                        <Text
                          style={[
                            typography.caption,
                            {
                              color:
                                log.level === "error"
                                  ? colors.error[700]
                                  : log.level === "warning"
                                    ? colors.warning[700]
                                    : log.level === "success"
                                      ? colors.success[700]
                                      : colors.primary[700],
                              fontWeight: "600",
                              textTransform: "uppercase",
                            },
                          ]}
                        >
                          {log.level}
                        </Text>
                      </View>
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.text.tertiary },
                        ]}
                      >
                        {log.timestamp}
                      </Text>
                    </View>

                    {/* Log Message */}
                    <Text
                      style={[
                        typography.body,
                        {
                          color: colors.text.primary,
                          marginBottom: spacing[2],
                        },
                      ]}
                    >
                      {log.message}
                    </Text>

                    {/* Log Details */}
                    {log.details && (
                      <View
                        style={{
                          backgroundColor: colors.background.secondary,
                          padding: spacing[2],
                          borderRadius: 8,
                          marginTop: spacing[1],
                        }}
                      >
                        <Text
                          style={[
                            typography.caption,
                            {
                              color: colors.text.secondary,
                              fontFamily: "monospace",
                            },
                          ]}
                        >
                          {JSON.stringify(log.details, null, 2)}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

export default AddDeviceScreen;
