import type { Peripheral } from "react-native-ble-manager";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import BleManager, {
  BleScanCallbackType,
  BleScanMatchMode,
  BleScanMode,
} from "react-native-ble-manager";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AdvertisementData } from "~/services/ble/types";
import { AlarmCard } from "~/components/device";
import { HamburgerMenu } from "~/components/ui/HamburgerMenu";
import { Header } from "~/components/ui/Header";
import { useBLE } from "~/contexts/BLEContext";
import {
  createAddEventRequest,
  parseAddEventResponse,
} from "~/services/ble/commands/addEvent";
// Device info commands - available if needed
// import {
//   createGetDeviceInfoRequest,
//   parseGetDeviceInfoResponse,
// } from "~/services/ble/commands/getDeviceInfo";
import {
  createGetUptimeRequest,
  parseGetUptimeResponse,
} from "~/services/ble/commands/getUptime";
import { createRemoveAllEventsRequest } from "~/services/ble/commands/removeAllEvents";
import {
  createSetEventOnOffRequest,
  parseSetEventOnOffResponse,
} from "~/services/ble/commands/setEventOnOff";
import { disconnectFromBLEDevice } from "~/services/ble/connection";
import {
  extractAndDecryptAdvertisementData,
  generateDynamicKey,
} from "~/services/ble/encryption";
import { sendCommand, startNotifications } from "~/services/ble/manager";
import { FACTORY_BRACELET_KEY, ResponseStatus } from "~/services/ble/types";
import {
  buttons,
  cards,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";
import { alarmDatabaseToBleParameters } from "~/utils/bleAlarmUtils";

export default function DeviceDetailPage() {
  const { deviceId } = useGlobalSearchParams<{ deviceId: string }>();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncProgress, setSyncProgress] = React.useState<string>("");

  // Store the initial device ID to prevent it from changing during navigation
  const [initialDeviceId] = React.useState(deviceId);

  // Use BLE context to show connection status
  const { connectionState, connectedDevice, encryptionKey } = useBLE();

  const {
    data: device,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["device", "getById", { id: initialDeviceId }],
    queryFn: async () => {
      return await trpc.device.getById.query({ id: initialDeviceId });
    },
    enabled: !!initialDeviceId,
    retry: (failureCount, error) => {
      // Don't retry if the device is not found (likely deleted)
      if (
        error instanceof Error &&
        (error.message.includes("Device not found") ||
          error.message.includes("you don't have permission"))
      ) {
        return false;
      }
      // Default retry behavior for other errors
      return failureCount < 3;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!initialDeviceId) throw new Error("Device ID is required");

      // Check for connected BLE devices and disconnect if necessary
      console.log("🔍 Checking for connected BLE devices before deletion...");
      try {
        const connectedPeripherals = await BleManager.getConnectedPeripherals(
          [],
        );
        console.log(
          `Found ${connectedPeripherals.length} connected peripherals`,
        );

        // Check each connected peripheral to see if it matches our device
        for (const peripheral of connectedPeripherals) {
          const sanitizedDeviceId = peripheral.id.replace(
            /[^a-zA-Z0-9._-]/g,
            "_",
          );
          try {
            const storedKey = await SecureStore.getItemAsync(
              `ble_device_${sanitizedDeviceId}`,
            );
            if (storedKey) {
              console.log(
                `🔌 Found connected device: ${peripheral.id}, disconnecting...`,
              );

              // Disconnect using standardized function
              try {
                await disconnectFromBLEDevice(peripheral.id);
                console.log(`✅ Disconnected device: ${peripheral.id}`);
              } catch (disconnectError) {
                console.warn(
                  `⚠️ Failed to disconnect ${peripheral.id}:`,
                  disconnectError,
                );
              }

              // Remove the stored encryption key
              try {
                await SecureStore.deleteItemAsync(
                  `ble_device_${sanitizedDeviceId}`,
                );
                console.log(
                  `✅ Removed stored encryption key for ${peripheral.id}`,
                );
              } catch (keyError) {
                console.warn(
                  `⚠️ Failed to remove encryption key for ${peripheral.id}:`,
                  keyError,
                );
              }
            }
          } catch (error) {
            console.warn(`⚠️ Error checking device ${peripheral.id}:`, error);
          }
        }
      } catch (bleError) {
        console.warn("⚠️ Error checking connected BLE devices:", bleError);
        // Continue with deletion even if BLE cleanup fails
      }

      // Delete the device from the database
      console.log("🗑️ Deleting device from database...");
      return await trpc.device.delete.mutate({ id: initialDeviceId });
    },
    onSuccess: () => {
      // Remove all queries related to this specific device to prevent any stale data errors
      queryClient.removeQueries({
        queryKey: ["device", "getById", { id: initialDeviceId }],
      });
      queryClient.removeQueries({
        queryKey: ["device", "getById", { id: deviceId }],
      });
      // Also remove any alarm-related queries for this device
      queryClient.removeQueries({
        queryKey: ["alarm"],
        predicate: (query) => {
          // Remove any alarm queries that reference this device
          const queryKey = query.queryKey as unknown[];
          return queryKey.some(
            (key) =>
              typeof key === "object" &&
              key !== null &&
              "deviceId" in key &&
              (key.deviceId === initialDeviceId || key.deviceId === deviceId),
          );
        },
      });

      // Update the devices list cache directly to remove the deleted device
      queryClient.setQueryData(
        ["devices"],
        (oldData: { id: string }[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.filter(
            (device) => device.id !== initialDeviceId && device.id !== deviceId,
          );
        },
      );

      // Also update the trpc query cache with the correct key
      const queryKey = [["device", "getAll"], { input: {}, type: "query" }];
      queryClient.setQueryData(
        queryKey,
        (oldData: { id: string }[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.filter(
            (device) => device.id !== initialDeviceId && device.id !== deviceId,
          );
        },
      );

      router.push("/dashboard");
    },
  });

  // Handle device not found errors by navigating back automatically
  useEffect(() => {
    if (
      error?.message &&
      (error.message.includes("Device not found") ||
        error.message.includes("you don't have permission"))
    ) {
      console.log(
        "📱 Device not found or access denied, navigating back to dashboard",
      );
      router.push("/dashboard");
    }
  }, [error]);

  const handleDeleteDevice = () => {
    Alert.alert(
      "Delete Device",
      "Are you sure you want to delete this device? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  };

  const handleSyncAlarms = async () => {
    if (!device?.serialNumber) {
      Alert.alert("Error", "Device serial number is required for syncing");
      return;
    }

    setIsSyncing(true);
    setSyncProgress("Starting sync process...");
    console.log(
      "🔄 Starting alarm sync process for serial:",
      device.serialNumber,
    );

    try {
      // Step 1: Check connected peripherals
      setSyncProgress("Checking connected devices...");
      console.log("📱 Checking for connected peripherals");
      const connectedPeripherals = await BleManager.getConnectedPeripherals([]);
      console.log(`Found ${connectedPeripherals.length} connected peripherals`);

      let targetPeripheral = null;
      let encryptionKey = null;

      // Step 2: Check if any connected peripheral has a matching key
      for (const peripheral of connectedPeripherals) {
        const sanitizedDeviceId = peripheral.id.replace(
          /[^a-zA-Z0-9._-]/g,
          "_",
        );
        try {
          const storedKey = await SecureStore.getItemAsync(
            `ble_device_${sanitizedDeviceId}`,
          );
          if (storedKey) {
            console.log(
              `\n� ==================== FOUND EXISTING KEY ====================`,
            );
            console.log(
              `�🔑 Found stored key for peripheral: ${peripheral.id}`,
            );
            console.log(`🔑 Stored encryption key: ${storedKey}`);
            console.log(`📱 Device ID: ${peripheral.id}`);
            console.log(
              `🔍 ===========================================================\n`,
            );
            // We would need to verify this device has the right serial number
            // For now, assume this is our target
            targetPeripheral = peripheral;
            encryptionKey = storedKey;
            break;
          }
        } catch {
          console.log(`No stored key found for ${peripheral.id}`);
        }
      }

      // Step 3: Clean up expired keys if no match found
      if (!targetPeripheral) {
        setSyncProgress("Cleaning up expired keys...");
        console.log(
          "🧹 No matching connected devices, cleaning up expired keys",
        );

        for (const peripheral of connectedPeripherals) {
          const sanitizedDeviceId = peripheral.id.replace(
            /[^a-zA-Z0-9._-]/g,
            "_",
          );
          try {
            await SecureStore.deleteItemAsync(
              `ble_device_${sanitizedDeviceId}`,
            );
            console.log(`🗑️ Removed expired key for ${peripheral.id}`);
          } catch {
            // Key might not exist, ignore
          }
        }
      }

      // Step 3.5: If we have a target peripheral but no encryption key, generate one
      if (targetPeripheral && !encryptionKey) {
        console.log(
          "🔐 Target peripheral found but no encryption key, generating new key",
        );
        setSyncProgress("Generating encryption key for existing connection...");

        try {
          // Get uptime to establish connection
          const uptimeResponse = await sendCommand({
            peripheralId: targetPeripheral.id,
            command: createGetUptimeRequest(),
            encryptionKey: FACTORY_BRACELET_KEY,
          });

          const uptimeData = parseGetUptimeResponse(uptimeResponse.payload);
          console.log(`📊 Device uptime: ${uptimeData.uptime} seconds`);

          // Generate dynamic key
          encryptionKey = generateDynamicKey(
            FACTORY_BRACELET_KEY,
            uptimeData.uptimeBytes,
            device.serialNumber,
          );
          console.log(
            `\n🔐 ==================== EXISTING CONNECTION KEY ====================`,
          );
          console.log(
            `🔐 Generated dynamic encryption key for existing connection`,
          );
          console.log(`🔑 Generated key: ${encryptionKey}`);
          console.log(`🔑 Key length: ${encryptionKey.length} characters`);
          console.log(`📱 Device ID: ${targetPeripheral.id}`);
          console.log(`🏷️  Serial Number: ${device.serialNumber}`);
          console.log(
            `⏰ Uptime bytes: ${Array.from(uptimeData.uptimeBytes)
              .map((b) => "0x" + b.toString(16).padStart(2, "0"))
              .join(", ")}`,
          );
          console.log(
            `🔐 ================================================================\n`,
          );

          // Store the key for future use
          const sanitizedDeviceId = targetPeripheral.id.replace(
            /[^a-zA-Z0-9._-]/g,
            "_",
          );
          await SecureStore.setItemAsync(
            `ble_device_${sanitizedDeviceId}`,
            encryptionKey,
          );
          console.log(
            `\n💾 ==================== STORING CONNECTION KEY ====================`,
          );
          console.log(`💾 Stored encryption key for future connections`);
          console.log(`🔑 Stored key: ${encryptionKey}`);
          console.log(`🗂️  Storage key: ble_device_${sanitizedDeviceId}`);
          console.log(
            `💾 ================================================================\n`,
          );
        } catch (keyGenError) {
          console.error("❌ Failed to generate encryption key:", keyGenError);
          throw new Error(
            `Failed to generate encryption key: ${keyGenError instanceof Error ? keyGenError.message : "Unknown error"}`,
          );
        }
      }

      // Step 4: Scan for devices if no connected device found
      if (!targetPeripheral) {
        setSyncProgress("Scanning for Gently devices...");
        console.log("🔍 Scanning for Gently devices");

        // Start BLE manager if needed
        await BleManager.start({ showAlert: false });

        const scanResults: AdvertisementData[] = [];

        // Set up scan listener using modern BleManager event handlers
        const handleDiscoverPeripheral = async (peripheral: Peripheral) => {
          if (peripheral.advertising.manufacturerRawData) {
            try {
              const adData = extractAndDecryptAdvertisementData(
                peripheral.advertising.manufacturerRawData,
              );

              // Debug: Log the serial numbers for comparison
              console.log(
                `🔍 Comparing serials - Device: "${adData?.serialNumber}" vs Database: "${device.serialNumber}"`,
              );

              if (
                adData &&
                (adData.serialNumber === device.serialNumber ||
                  adData.serialNumber.toUpperCase() ===
                    device.serialNumber?.toUpperCase())
              ) {
                console.log(
                  `✅ Found target device with serial ${device.serialNumber}`,
                );
                scanResults.push(adData);
                targetPeripheral = peripheral;

                // Stop scanning immediately and begin complete pairing and sync process
                await BleManager.stopScan();

                try {
                  setSyncProgress("Connecting to device (up to 60s)...");
                  console.log(
                    `🔗 Starting inline BLE connection to device: ${peripheral.id}`,
                  );

                  await BleManager.stopScan();

                  // Inline BLE connection with detailed logging and 20s timeout
                  const maxRetries = 3;
                  const connectionTimeout = 20000; // 20 seconds per attempt
                  const stabilizationDelay = 900;
                  const mtuSize = 512;

                  // Check existing connection
                  console.log(
                    "🔍 Checking existing connection status for sync",
                  );
                  const isConnected = await BleManager.isPeripheralConnected(
                    peripheral.id,
                  );
                  if (isConnected) {
                    console.log(
                      "⚠️ Device already connected, disconnecting first for sync",
                    );
                    await BleManager.disconnect(peripheral.id);
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    console.log("✅ Previous connection disconnected for sync");
                  } else {
                    console.log("ℹ️ No existing connection found for sync");
                  }

                  // Connection attempts with retries for sync
                  let connectionSuccess = false;
                  let lastError: Error | null = null;

                  for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                      setSyncProgress(
                        `Connecting attempt ${attempt}/${maxRetries} (${connectionTimeout / 1000}s timeout)...`,
                      );
                      console.log(
                        `🔗 Sync connection attempt ${attempt}/${maxRetries} (${connectionTimeout / 1000}s timeout)`,
                        {
                          deviceId: peripheral.id,
                          attempt,
                          maxRetries,
                          timeout: connectionTimeout,
                          timeoutSeconds: connectionTimeout / 1000,
                        },
                      );

                      // Create connection with timeout
                      const connectionPromise = BleManager.connect(
                        peripheral.id,
                      );
                      const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(
                          () =>
                            reject(
                              new Error(
                                `Sync connection timeout after ${connectionTimeout / 1000} seconds`,
                              ),
                            ),
                          connectionTimeout,
                        );
                      });

                      await Promise.race([connectionPromise, timeoutPromise]);

                      console.log(
                        `✅ Sync connected to device on attempt ${attempt}`,
                        {
                          deviceId: peripheral.id,
                          attempt,
                          timeElapsed: `${connectionTimeout / 1000}s or less`,
                        },
                      );
                      connectionSuccess = true;
                      break;
                    } catch (connectionError) {
                      lastError =
                        connectionError instanceof Error
                          ? connectionError
                          : new Error(String(connectionError));
                      console.warn(
                        `⚠️ Sync connection attempt ${attempt} failed`,
                        {
                          attempt,
                          error: lastError.message,
                          deviceId: peripheral.id,
                          willRetry: attempt < maxRetries,
                        },
                      );

                      if (attempt < maxRetries) {
                        console.log(
                          `⏳ Waiting 1 second before sync retry (next attempt will timeout after ${connectionTimeout / 1000}s)`,
                        );
                        await new Promise((resolve) =>
                          setTimeout(resolve, 1000),
                        );
                      }
                    }
                  }

                  if (!connectionSuccess) {
                    const errorMessage = `Failed to connect after ${maxRetries} sync attempts (${(maxRetries * connectionTimeout) / 1000}s total). ${lastError?.message ?? "Unknown error"}`;
                    console.error("❌ All sync connection attempts failed", {
                      maxRetries,
                      finalError: lastError?.message,
                      deviceId: peripheral.id,
                    });
                    throw new Error(errorMessage);
                  }

                  // Connection stabilization for sync
                  setSyncProgress("Stabilizing sync connection...");
                  console.log(
                    `⏱️ Waiting ${stabilizationDelay}ms for sync connection stabilization`,
                  );
                  await new Promise((resolve) =>
                    setTimeout(resolve, stabilizationDelay),
                  );
                  console.log("✅ Sync connection stabilization complete");

                  // Configure MTU for Android sync
                  if (Platform.OS === "android") {
                    setSyncProgress("Configuring sync connection...");
                    console.log(
                      `🔧 Configuring MTU for Android sync (${mtuSize} bytes)`,
                    );
                    try {
                      await BleManager.requestMTU(peripheral.id, mtuSize);
                      console.log(
                        `📶 MTU ${mtuSize} configured for sync successfully`,
                      );
                    } catch (mtuError) {
                      const mtuMessage =
                        mtuError instanceof Error
                          ? mtuError.message
                          : String(mtuError);
                      console.warn(
                        `⚠️ MTU configuration failed for sync: ${mtuMessage}`,
                        {
                          error: mtuMessage,
                          requestedMTU: mtuSize,
                        },
                      );
                    }
                  } else {
                    console.log(
                      `ℹ️ Skipping MTU configuration for sync (Platform: ${Platform.OS})`,
                    );
                  }

                  // Discover services for sync
                  setSyncProgress("Discovering sync services...");
                  console.log(
                    "🔍 Discovering BLE services and characteristics for sync",
                  );
                  try {
                    // Use Promise.race with timeout to prevent hanging (GitHub community fix)
                    await Promise.race([
                      BleManager.retrieveServices(peripheral.id),
                      new Promise<never>((_, reject) =>
                        setTimeout(
                          () =>
                            reject(
                              new Error(
                                "Sync service discovery timeout after 3000ms",
                              ),
                            ),
                          3000,
                        ),
                      ),
                    ]);
                    console.log(
                      "✅ BLE services discovered successfully for sync",
                    );
                  } catch (servicesError) {
                    const servicesMessage =
                      servicesError instanceof Error
                        ? servicesError.message
                        : String(servicesError);
                    console.error(
                      `❌ Sync service discovery failed: ${servicesMessage}`,
                      {
                        error: servicesMessage,
                        deviceId: peripheral.id,
                        isTimeout: servicesMessage.includes("timeout"),
                      },
                    );
                    throw new Error(
                      `Sync service discovery failed: ${servicesMessage}`,
                    );
                  }

                  // Start notifications for sync
                  setSyncProgress("Starting sync notifications...");
                  console.log("🔔 Starting BLE notifications for sync");
                  try {
                    await startNotifications(peripheral.id);
                    console.log(
                      "✅ BLE notifications started successfully for sync",
                    );
                  } catch (notificationError) {
                    const notificationMessage =
                      notificationError instanceof Error
                        ? notificationError.message
                        : String(notificationError);
                    console.error(
                      `❌ Sync notification setup failed: ${notificationMessage}`,
                      {
                        error: notificationMessage,
                        deviceId: peripheral.id,
                      },
                    );
                    throw new Error(
                      `Sync notification setup failed: ${notificationMessage}`,
                    );
                  }

                  console.log(
                    `🎉 BLE sync connection fully established for ${peripheral.id}`,
                  );

                  // Step 2: Generate encryption key
                  setSyncProgress("Generating encryption key...");
                  console.log("🔐 Generating dynamic encryption key");

                  // Get uptime to establish connection
                  const uptimeResponse = await sendCommand({
                    peripheralId: peripheral.id,
                    command: createGetUptimeRequest(),
                    encryptionKey: FACTORY_BRACELET_KEY,
                  });

                  const uptimeData = parseGetUptimeResponse(
                    uptimeResponse.payload,
                  );
                  console.log(`📊 Device uptime: ${uptimeData.uptime} seconds`);

                  // Generate dynamic key
                  encryptionKey = generateDynamicKey(
                    FACTORY_BRACELET_KEY,
                    uptimeData.uptimeBytes,
                    device.serialNumber,
                  );
                  console.log(
                    `\n🔐 ==================== SYNC ENCRYPTION KEY ====================`,
                  );
                  console.log(
                    `🔑 Generated dynamic encryption key: ${encryptionKey}`,
                  );
                  console.log(
                    `🔑 Key length: ${encryptionKey.length} characters`,
                  );
                  console.log(`📱 Device ID: ${peripheral.id}`);
                  console.log(`🏷️  Serial Number: ${device.serialNumber}`);
                  console.log(
                    `⏰ Uptime bytes: ${Array.from(uptimeData.uptimeBytes)
                      .map((b) => "0x" + b.toString(16).padStart(2, "0"))
                      .join(", ")}`,
                  );
                  console.log(
                    `🔐 =======================================================\n`,
                  );

                  // Store the key
                  const sanitizedDeviceId = peripheral.id.replace(
                    /[^a-zA-Z0-9._-]/g,
                    "_",
                  );
                  await SecureStore.setItemAsync(
                    `ble_device_${sanitizedDeviceId}`,
                    encryptionKey,
                  );
                  console.log(
                    `\n💾 ==================== STORING SYNC KEY ====================`,
                  );
                  console.log(
                    `🔑 Stored sync encryption key: ${encryptionKey}`,
                  );
                  console.log(
                    `🗂️  Storage key: ble_device_${sanitizedDeviceId}`,
                  );
                  console.log(
                    `💾 =======================================================\n`,
                  );

                  // Step 3: Clear existing alarms on device
                  setSyncProgress("Clearing existing alarms on device...");
                  console.log("🧹 Removing all existing events from device");

                  await sendCommand({
                    peripheralId: peripheral.id,
                    command: createRemoveAllEventsRequest(),
                    encryptionKey,
                  });

                  console.log("✅ All existing events removed");

                  // Step 4: Add and enable each alarm from the database
                  setSyncProgress(
                    `Syncing ${device.alarms.length} alarms to device...`,
                  );
                  console.log(
                    `📝 Adding and enabling ${device.alarms.length} alarms on device`,
                  );

                  for (let i = 0; i < device.alarms.length; i++) {
                    const alarm = device.alarms[i];
                    if (!alarm) continue;

                    console.log(
                      `\n➥ ==================== SYNCING ALARM ${i + 1}/${device.alarms.length} ====================`,
                    );
                    console.log(`➥ Adding alarm: ${alarm.title}`);
                    console.log(`🔑 Using encryption key: ${encryptionKey}`);
                    console.log(
                      `➥ ===============================================================`,
                    );

                    // Convert alarm to device event format using consolidated BLE protocol fields
                    const bleParameters = alarmDatabaseToBleParameters(
                      alarm,
                      i,
                    );

                    console.log(
                      `\n📋 ==================== ALARM SYNC DATA DETAILS ====================`,
                    );
                    console.log(`📋 Database Alarm:`);
                    console.log(`   - ID: ${alarm.id}`);
                    console.log(`   - Title: "${alarm.title}"`);
                    console.log(
                      `   - Description: "${alarm.description || "None"}"`,
                    );
                    console.log(`   - Is Active: ${alarm.isActive}`);
                    console.log(`   - Start Date: ${alarm.startDate}`);
                    console.log(`   - Repeat: ${alarm.repeat}`);
                    console.log(
                      `   - Cron Expression from DB: "${alarm.cronExpression}"`,
                    );
                    console.log(`📋 Converted BLE Parameters:`);
                    console.log(
                      `   - Event Index: ${bleParameters.eventIndex}`,
                    );
                    console.log(
                      `   - Event Name: "${bleParameters.eventName}"`,
                    );
                    console.log(
                      `   - Cron Expression: "${bleParameters.cronExpression}"`,
                    );
                    console.log(
                      `   - Cron Length: ${bleParameters.cronExpression.length} chars`,
                    );
                    console.log(
                      `   - Cron Bytes: [${Array.from(
                        new TextEncoder().encode(bleParameters.cronExpression),
                      )
                        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
                        .join(", ")}]`,
                    );
                    console.log(
                      `   - Vibration Pattern: ${bleParameters.vibrationPattern}`,
                    );
                    console.log(
                      `   - Vibration Intensity: ${bleParameters.vibrationIntensity}`,
                    );
                    console.log(
                      `   - LED Pattern: ${bleParameters.ledPattern}`,
                    );
                    console.log(`   - LED Color: ${bleParameters.ledColor}`);
                    console.log(
                      `   - Severity Level: ${bleParameters.severityLevel}`,
                    );
                    console.log(
                      `   - Snooze Period: ${bleParameters.snoozePeriod}`,
                    );
                    console.log(
                      `   - Snooze Timeout: ${bleParameters.snoozeTimeout}`,
                    );
                    console.log(
                      `   - Retrigger Delay: ${bleParameters.retriggerDelay}`,
                    );
                    console.log(
                      `   - Retrigger Timeout: ${bleParameters.retriggerTimeout}`,
                    );
                    console.log(
                      `📋 ============================================================\n`,
                    );

                    const addEventCommand =
                      createAddEventRequest(bleParameters);

                    console.log(
                      `\n📦 ==================== BLE PAYLOAD DETAILS ====================`,
                    );
                    console.log(
                      `📦 Command Code: 0x${addEventCommand.command.toString(16).padStart(2, "0")}`,
                    );
                    console.log(
                      `📦 API Version: ${addEventCommand.apiVersion}`,
                    );

                    if (addEventCommand.payload) {
                      console.log(
                        `📦 Payload Length: ${addEventCommand.payload.length} bytes`,
                      );
                      console.log(
                        `📦 Full Payload Bytes: [${Array.from(
                          addEventCommand.payload,
                        )
                          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
                          .join(", ")}]`,
                      );

                      // Parse the payload structure for detailed logging
                      let offset = 0;
                      console.log(`📦 Payload Structure:`);
                      console.log(
                        `   - Byte ${offset}: Event Index = 0x${addEventCommand.payload[offset]?.toString(16).padStart(2, "0")} (${addEventCommand.payload[offset]})`,
                      );
                      offset++;
                      console.log(
                        `   - Byte ${offset}: Vibration = 0x${addEventCommand.payload[offset]?.toString(16).padStart(2, "0")}`,
                      );
                      offset++;
                      console.log(
                        `   - Byte ${offset}: LED = 0x${addEventCommand.payload[offset]?.toString(16).padStart(2, "0")}`,
                      );
                      offset++;
                      console.log(
                        `   - Byte ${offset}: Severity = 0x${addEventCommand.payload[offset]?.toString(16).padStart(2, "0")} (${addEventCommand.payload[offset]})`,
                      );
                      offset++;
                      console.log(
                        `   - Byte ${offset}: Snooze Period = 0x${addEventCommand.payload[offset]?.toString(16).padStart(2, "0")} (${addEventCommand.payload[offset]})`,
                      );
                      offset++;
                      console.log(
                        `   - Byte ${offset}: Snooze Timeout = 0x${addEventCommand.payload[offset]?.toString(16).padStart(2, "0")} (${addEventCommand.payload[offset]})`,
                      );
                      offset++;
                      console.log(
                        `   - Byte ${offset}: Retrigger Delay = 0x${addEventCommand.payload[offset]?.toString(16).padStart(2, "0")} (${addEventCommand.payload[offset]})`,
                      );
                      offset++;
                      console.log(
                        `   - Byte ${offset}: Retrigger Timeout = 0x${addEventCommand.payload[offset]?.toString(16).padStart(2, "0")} (${addEventCommand.payload[offset]})`,
                      );
                      offset++;

                      // Find event name string
                      const eventNameStart = offset;
                      let eventNameEnd = offset;
                      while (
                        eventNameEnd < addEventCommand.payload.length &&
                        addEventCommand.payload[eventNameEnd] !== 0
                      ) {
                        eventNameEnd++;
                      }
                      const eventNameBytes = addEventCommand.payload.slice(
                        eventNameStart,
                        eventNameEnd,
                      );
                      const eventNameString = new TextDecoder().decode(
                        eventNameBytes,
                      );
                      console.log(
                        `   - Bytes ${eventNameStart}-${eventNameEnd - 1}: Event Name = "${eventNameString}" [${Array.from(
                          eventNameBytes,
                        )
                          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
                          .join(", ")}]`,
                      );
                      console.log(
                        `   - Byte ${eventNameEnd}: Event Name Terminator = 0x${addEventCommand.payload[eventNameEnd]?.toString(16).padStart(2, "0")}`,
                      );
                      offset = eventNameEnd + 1;

                      // Find cron expression string
                      const cronStart = offset;
                      let cronEnd = offset;
                      while (
                        cronEnd < addEventCommand.payload.length &&
                        addEventCommand.payload[cronEnd] !== 0
                      ) {
                        cronEnd++;
                      }
                      const cronBytes = addEventCommand.payload.slice(
                        cronStart,
                        cronEnd,
                      );
                      const cronString = new TextDecoder().decode(cronBytes);
                      console.log(
                        `   - Bytes ${cronStart}-${cronEnd - 1}: Cron Expression = "${cronString}" [${Array.from(
                          cronBytes,
                        )
                          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
                          .join(", ")}]`,
                      );
                      console.log(
                        `   - Byte ${cronEnd}: Cron Terminator = 0x${addEventCommand.payload[cronEnd]?.toString(16).padStart(2, "0")}`,
                      );

                      // Show remaining padding
                      const remainingBytes = addEventCommand.payload.slice(
                        cronEnd + 1,
                      );
                      if (remainingBytes.length > 0) {
                        console.log(
                          `   - Bytes ${cronEnd + 1}-${addEventCommand.payload.length - 1}: Padding = [${Array.from(
                            remainingBytes,
                          )
                            .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
                            .join(", ")}]`,
                        );
                      }
                    } else {
                      console.log(`📦 Payload: undefined`);
                    }
                    console.log(
                      `📦 ============================================================\n`,
                    );

                    console.log(
                      `🔑 About to send ADD_EVENT with key: ${encryptionKey}`,
                    );
                    console.log(`🔑 Target peripheral ID: ${peripheral.id}`);

                    const response = await sendCommand({
                      peripheralId: peripheral.id,
                      command: addEventCommand,
                      encryptionKey,
                    });

                    const result = parseAddEventResponse(
                      response.payload,
                      response.status,
                      response.commandCode,
                    );
                    if (result.status === "ERROR") {
                      console.warn(`⚠️ Failed to add alarm ${alarm.title}`);
                      continue; // Skip enabling if add failed
                    }

                    console.log(
                      `✅ Added alarm ${alarm.title} at index ${result.eventIndex}`,
                    );

                    // Enable the alarm after successfully adding it
                    console.log(
                      `🔛 Enabling alarm at index ${result.eventIndex}`,
                    );

                    const enableResponse = await sendCommand({
                      peripheralId: peripheral.id,
                      command: createSetEventOnOffRequest(
                        result.eventIndex,
                        true,
                      ),
                      encryptionKey,
                    });

                    const enableResult = parseSetEventOnOffResponse(
                      enableResponse.payload,
                      enableResponse.status,
                    );

                    if (enableResponse.status === ResponseStatus.OK) {
                      console.log(
                        `✅ Enabled alarm ${alarm.title} at index ${enableResult.eventIndex}`,
                      );
                    } else {
                      console.warn(
                        `⚠️ Failed to enable alarm ${alarm.title} at index ${result.eventIndex}`,
                      );
                    }

                    setSyncProgress(
                      `Synced ${i + 1}/${device.alarms.length} alarms...`,
                    );
                  }

                  // Step 5: Clean up and complete
                  await disconnectFromBLEDevice(peripheral.id);

                  setSyncProgress("Sync completed successfully!");
                  console.log("🎉 Alarm sync completed successfully");

                  Alert.alert(
                    "Sync Complete",
                    `Successfully synced ${device.alarms.length} alarms to your Gently bracelet.`,
                    [{ text: "OK" }],
                  );
                } catch (syncError) {
                  console.error("❌ Sync process failed:", syncError);
                  targetPeripheral = null; // Reset so we can continue scanning

                  Alert.alert(
                    "Sync Failed",
                    `Could not sync alarms to device: ${syncError instanceof Error ? syncError.message : "Unknown error"}`,
                    [{ text: "OK" }],
                  );
                }
              }
            } catch {
              // Not a Gently device, ignore
            }
          }
        };

        // Use modern BleManager event handlers
        const discoverListener = BleManager.onDiscoverPeripheral(
          handleDiscoverPeripheral,
        );

        await BleManager.scan([], 10, false, {
          matchMode: BleScanMatchMode.Sticky,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
          legacy: false,
        });

        // Wait for scan to complete or until device is found and synced
        await new Promise((resolve) => setTimeout(resolve, 10000));

        discoverListener.remove();

        // If we reach here, device connection happens in the discover callback
        console.log("🔍 Scan completed, device connection handled in callback");
      } else {
        // Using existing connection - still need to sync alarms
        setSyncProgress("Using existing connection...");
        console.log("🔐 Using encryption key for existing connection");

        if (!encryptionKey) {
          console.error(
            "❌ No encryption key available for existing connection",
          );
          throw new Error(
            "Encryption key is required for existing connection. Please try scanning for the device again.",
          );
        }

        console.log("✅ Encryption key validated for existing connection");
        console.log(`🔑 Using encryption key: ${encryptionKey}`);
        console.log(`🔑 Key length: ${encryptionKey.length} characters`);
        console.log(
          `🔑 Key format valid: ${encryptionKey.length === 32 && /^[0-9A-Fa-f]+$/.test(encryptionKey) ? "YES" : "NO - Should be 32 hex characters"}`,
        );

        // Step: Remove all existing events
        setSyncProgress("Clearing existing alarms on device...");
        console.log("🧹 Removing all existing events from device");

        const removeResponse = await sendCommand({
          peripheralId: targetPeripheral.id,
          command: createRemoveAllEventsRequest(),
          encryptionKey,
        });

        const removeStatusText =
          removeResponse.status === ResponseStatus.OK ? "OK" : "ERROR";
        console.log(
          `📊 Remove All Events Response: Status=${removeStatusText} (0x${removeResponse.status.toString(16)}), Command=0x${removeResponse.commandCode.toString(16)}, Payload=[${Array.from(
            removeResponse.payload,
          )
            .map((b) => "0x" + b.toString(16).padStart(2, "0"))
            .join(", ")}]`,
        );

        if (removeResponse.status !== ResponseStatus.OK) {
          console.warn(
            `❌ Failed to remove existing events: Status=0x${removeResponse.status.toString(16)}`,
          );
          setSyncProgress(
            `⚠️ Failed to clear existing alarms (Status: 0x${removeResponse.status.toString(16)})`,
          );
        } else {
          console.log("✅ All existing events removed");
        }

        // Step: Add each alarm from the database
        setSyncProgress(`Syncing ${device.alarms.length} alarms to device...`);
        console.log(`📝 Adding ${device.alarms.length} alarms to device`);

        for (let i = 0; i < device.alarms.length; i++) {
          const alarm = device.alarms[i];
          if (!alarm) continue;

          console.log(
            `➕ Adding alarm ${i + 1}/${device.alarms.length}: ${alarm.title}`,
          );

          // Convert alarm to device event format using consolidated BLE protocol fields
          const bleParameters = alarmDatabaseToBleParameters(alarm, i);
          const addEventCommand = createAddEventRequest(bleParameters);

          console.log(
            `\n� ==================== SENDING ADD_EVENT ====================`,
          );
          console.log(`🔑 Using encryption key: ${encryptionKey}`);
          console.log(`🔑 Target peripheral ID: ${targetPeripheral.id}`);
          console.log(`📋 Alarm: ${alarm.title}`);
          console.log(`🔢 Event index: ${i}`);
          console.log(
            `📤 =========================================================`,
          );

          const response = await sendCommand({
            peripheralId: targetPeripheral.id,
            command: addEventCommand,
            encryptionKey,
          });

          // Check response status at the BLE command level first
          const bleStatusText =
            response.status === ResponseStatus.OK ? "OK" : "ERROR";
          console.log(
            `\n📥 ==================== ADD_EVENT RESPONSE ====================`,
          );
          console.log(
            `📊 BLE Command Response: Status=${bleStatusText} (0x${response.status.toString(16)}), Command=0x${response.commandCode.toString(16)}, Payload=[${Array.from(
              response.payload,
            )
              .map((b) => "0x" + b.toString(16).padStart(2, "0"))
              .join(", ")}]`,
          );
          console.log(`🔑 Decrypted with key: ${encryptionKey}`);
          console.log(
            `📥 ==========================================================`,
          );

          const result = parseAddEventResponse(
            response.payload,
            response.status,
            response.commandCode,
          );
          if (response.status !== ResponseStatus.OK) {
            console.warn(
              `❌ BLE Command failed for alarm ${alarm.title}: Status=0x${response.status.toString(16)}`,
            );
            setSyncProgress(
              `⚠️ Error adding alarm ${alarm.title} (BLE Status: 0x${response.status.toString(16)})`,
            );
            continue; // Skip enabling if add failed
          } else if (result.status === "ERROR") {
            console.warn(
              `⚠️ Device rejected alarm ${alarm.title}: ParsedStatus=${result.status}, EventIndex=${result.eventIndex}`,
            );
            setSyncProgress(`⚠️ Device rejected alarm ${alarm.title}`);
            continue; // Skip enabling if add failed
          }

          console.log(
            `✅ Added alarm ${alarm.title} at index ${result.eventIndex}`,
          );

          // Enable the alarm after successfully adding it
          console.log(`🔛 Enabling alarm at index ${result.eventIndex}`);

          const enableResponse = await sendCommand({
            peripheralId: targetPeripheral.id,
            command: createSetEventOnOffRequest(result.eventIndex, true),
            encryptionKey,
          });

          const enableResult = parseSetEventOnOffResponse(
            enableResponse.payload,
            enableResponse.status,
          );

          if (enableResponse.status === ResponseStatus.OK) {
            console.log(
              `✅ Enabled alarm ${alarm.title} at index ${enableResult.eventIndex}`,
            );
          } else {
            console.warn(
              `⚠️ Failed to enable alarm ${alarm.title} at index ${result.eventIndex}`,
            );
          }

          setSyncProgress(`Synced ${i + 1}/${device.alarms.length} alarms...`);
        }

        // Clean up
        await disconnectFromBLEDevice(targetPeripheral.id);

        setSyncProgress("Sync completed successfully!");
        console.log("🎉 Alarm sync completed successfully");

        Alert.alert(
          "Sync Complete",
          `Successfully synced ${device.alarms.length} alarms to your Gently bracelet.`,
          [{ text: "OK" }],
        );
      }
    } catch (error) {
      console.error("❌ Alarm sync failed:", error);
      setSyncProgress("Sync failed");

      Alert.alert(
        "Sync Failed",
        `Could not sync alarms to device: ${error instanceof Error ? error.message : "Unknown error"}`,
        [{ text: "OK" }],
      );
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncProgress(""), 3000);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View style={containers.contentCentered}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text
            style={[
              typography.body,
              { marginTop: spacing[3], color: colors.gray[500] },
            ]}
          >
            Loading device...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View
          style={[
            containers.contentCentered,
            { alignItems: "center", paddingHorizontal: spacing[8] },
          ]}
        >
          <Text
            style={[
              typography.h5,
              {
                color: colors.error[600],
                marginBottom: spacing[2],
                textAlign: "center",
              },
            ]}
          >
            Failed to load device
          </Text>
          <Text
            style={[
              typography.body,
              {
                color: colors.gray[500],
                textAlign: "center",
                marginBottom: spacing[6],
              },
            ]}
          >
            {error.message || "Please try again later"}
          </Text>
          <Pressable
            style={[buttons.base, buttons.primary]}
            onPress={() => router.back()}
          >
            <Text
              style={[typography.labelLarge, { color: colors.text.inverse }]}
            >
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View
          style={[
            containers.contentCentered,
            { alignItems: "center", paddingHorizontal: spacing[8] },
          ]}
        >
          <Text
            style={[
              typography.h5,
              {
                color: colors.error[600],
                marginBottom: spacing[6],
                textAlign: "center",
              },
            ]}
          >
            Device not found
          </Text>
          <Pressable
            style={[buttons.base, buttons.primary]}
            onPress={() => router.back()}
          >
            <Text
              style={[typography.labelLarge, { color: colors.text.inverse }]}
            >
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const getBatteryColor = (level: number) => {
    if (level > 50) return "#10b981";
    if (level > 20) return "#f59e0b";
    return "#ef4444";
  };

  const getSyncStatusText = (status: string) => {
    switch (status) {
      case "SYNCED":
        return "✓ Synced";
      case "SYNCING":
        return "⟳ Syncing";
      case "ERROR":
        return "⚠ Error";
      default:
        return "○ Not Synced";
    }
  };

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header
        title={device.title ?? "Device"}
        showBackButton={true}
        rightComponent={
          <HamburgerMenu
            options={[
              {
                label: "Edit Device",
                onPress: () => router.push(`/devices/${deviceId}/edit`),
                icon: "pencil",
              },
              {
                label: "BLE Debug",
                onPress: () => {
                  router.push(`/devices/${deviceId}/ble-test`);
                },
                icon: "build",
              },
              {
                label: "Delete Device",
                onPress: handleDeleteDevice,
                icon: "trash",
                destructive: true,
              },
            ]}
          />
        }
      />
      <ScrollView
        style={containers.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Device Header */}
        <View
          style={[
            cards.base,
            {
              flexDirection: "row",
              alignItems: "center",
              marginTop: spacing[4],
            },
          ]}
        >
          <View
            style={[
              {
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: colors.gray[200],
                justifyContent: "center",
                alignItems: "center",
                marginRight: spacing[4],
              },
            ]}
          >
            {device.title ? (
              <Text style={[typography.h6, { color: colors.gray[700] }]}>
                {device.title.slice(0, 2).toUpperCase()}
              </Text>
            ) : (
              <Ionicons name="watch" size={28} color={colors.gray[700]} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.h4, { marginBottom: spacing[1] }]}>
              {device.title}
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, marginBottom: spacing[3] },
              ]}
            >
              {device.description}
            </Text>

            {/* Device Stats */}
            <View
              style={[
                { flexDirection: "row", flexWrap: "wrap", gap: spacing[4] },
              ]}
            >
              {device.serialNumber && (
                <View style={[{ flexDirection: "row", alignItems: "center" }]}>
                  <Ionicons
                    name="barcode-outline"
                    size={14}
                    color={colors.gray[500]}
                    style={{ marginRight: spacing[1] }}
                  />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.gray[500], fontWeight: "500" },
                    ]}
                  >
                    {device.serialNumber}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* BLE Connection Status */}
        <View style={[cards.base, { marginTop: spacing[4] }]}>
          <View
            style={[
              {
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: spacing[3],
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Ionicons
                name="bluetooth"
                size={20}
                color={
                  connectionState === "connected"
                    ? colors.success[600]
                    : connectionState === "connecting"
                      ? colors.warning[600]
                      : colors.gray[400]
                }
                style={{ marginRight: spacing[2] }}
              />
              <Text style={[typography.h6, { color: colors.text.primary }]}>
                BLE Connection
              </Text>
            </View>
            <Pressable
              style={[
                buttons.base,
                buttons.secondary,
                { paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
              ]}
              onPress={() => {
                router.push(`/devices/${deviceId}/ble-test`);
              }}
            >
              <Text style={[typography.body, { color: colors.text.primary }]}>
                Test BLE
              </Text>
            </Pressable>
          </View>

          <View style={{ gap: spacing[2] }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={[typography.body, { color: colors.text.secondary }]}>
                Status:
              </Text>
              <Text
                style={[
                  typography.body,
                  {
                    color:
                      connectionState === "connected"
                        ? colors.success[600]
                        : connectionState === "connecting"
                          ? colors.warning[600]
                          : connectionState === "scanning"
                            ? colors.primary[600]
                            : colors.text.secondary,
                    fontWeight: "500",
                  },
                ]}
              >
                {connectionState.charAt(0).toUpperCase() +
                  connectionState.slice(1)}
              </Text>
            </View>

            {connectedDevice && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  style={[typography.body, { color: colors.text.secondary }]}
                >
                  Device ID:
                </Text>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.primary, fontFamily: "monospace" },
                  ]}
                >
                  {connectedDevice.id.substring(0, 12)}...
                </Text>
              </View>
            )}

            {encryptionKey && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  style={[typography.body, { color: colors.text.secondary }]}
                >
                  Encryption:
                </Text>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.success[600], fontWeight: "500" },
                  ]}
                >
                  ✓ Secured
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Alarms Section */}
        <View style={containers.section}>
          <View
            style={[
              {
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: spacing[4],
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginRight: spacing[2],
              }}
            >
              <Ionicons
                name="alarm"
                size={24}
                color={colors.text.primary}
                style={{ marginRight: spacing[2] }}
              />
              <Text style={[typography.h5, { color: colors.text.primary }]}>
                Alarms ({device.alarms.length})
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: spacing[2] }}>
              <Pressable
                style={[
                  buttons.base,
                  buttons.primary,
                  {
                    paddingVertical: spacing[2],
                    paddingHorizontal: spacing[3],
                  },
                  isSyncing && { opacity: 0.5 },
                ]}
                onPress={handleSyncAlarms}
                disabled={isSyncing}
              >
                <Ionicons
                  name={isSyncing ? "sync" : "refresh"}
                  size={16}
                  color={colors.text.inverse}
                  style={{ marginRight: spacing[1] }}
                />
                <Text
                  style={[typography.label, { color: colors.text.inverse }]}
                >
                  {isSyncing ? "Syncing..." : "Sync"}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  buttons.base,
                  buttons.success,
                  {
                    paddingVertical: spacing[2],
                    paddingHorizontal: spacing[4],
                  },
                ]}
                onPress={() => router.push(`/devices/${deviceId}/alarms/add`)}
              >
                <Ionicons
                  name="add"
                  size={16}
                  color={colors.text.inverse}
                  style={{ marginRight: spacing[1] }}
                />
                <Text
                  style={[typography.label, { color: colors.text.inverse }]}
                >
                  Add Alarm
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Sync Progress */}
          {syncProgress && (
            <View
              style={[
                cards.base,
                {
                  marginBottom: spacing[4],
                  backgroundColor: colors.primary[50],
                  borderColor: colors.primary[200],
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ActivityIndicator
                  size="small"
                  color={colors.primary[500]}
                  style={{ marginRight: spacing[2] }}
                />
                <Text
                  style={[
                    typography.body,
                    { color: colors.primary[700], flex: 1 },
                  ]}
                >
                  {syncProgress}
                </Text>
              </View>
            </View>
          )}

          {device.alarms.length === 0 ? (
            <View
              style={[
                cards.base,
                { alignItems: "center", paddingVertical: spacing[8] },
              ]}
            >
              <Ionicons
                name="alarm-outline"
                size={48}
                color={colors.gray[400]}
                style={{ marginBottom: spacing[3] }}
              />
              <Text
                style={[
                  typography.h6,
                  { color: colors.text.primary, marginBottom: spacing[1] },
                ]}
              >
                No alarms configured
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.text.secondary, textAlign: "center" },
                ]}
              >
                Add your first alarm to get started
              </Text>
            </View>
          ) : (
            <View style={[{ gap: spacing[3] }]}>
              {device.alarms.map((alarm, index) => {
                // Debug logging to see raw alarm data
                console.log(`📊 Alarm ${index} raw data:`, {
                  id: alarm.id,
                  startDate: alarm.startDate,
                  startDateType: typeof alarm.startDate,
                  endDate: alarm.endDate,
                  endDateType: typeof alarm.endDate,
                  cronExpression: alarm.cronExpression,
                });

                return (
                  <AlarmCard
                    key={alarm.id}
                    alarm={alarm}
                    onPress={() => {
                      console.log(
                        "🚨 Navigating to alarm edit:",
                        alarm.id,
                        "from device:",
                        deviceId,
                      );
                      router.push(
                        `/devices/${deviceId}/alarms/edit/${alarm.id}`,
                      );
                    }}
                  />
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
