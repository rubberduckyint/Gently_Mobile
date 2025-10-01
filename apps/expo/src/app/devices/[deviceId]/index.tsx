import type { Peripheral } from "react-native-ble-manager";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
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
      // Invalidate the devices list to refresh the dashboard
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      router.back();
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
      router.back();
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
                  setSyncProgress("Connecting to device...");
                  console.log(
                    `🔗 Starting connection to device: ${peripheral.id}`,
                  );

                  // Step 1: Connect and establish services
                  await BleManager.connect(peripheral.id);
                  console.log(`✅ Connected to device: ${peripheral.id}`);

                  // Request MTU of 512 for better sync performance
                  try {
                    await BleManager.requestMTU(peripheral.id, 512);
                    console.log(`📶 MTU 512 requested for ${peripheral.id}`);
                  } catch (mtuError) {
                    console.warn(
                      `⚠️ MTU request failed for ${peripheral.id}:`,
                      mtuError,
                    );
                    // Continue without MTU - this is not critical for basic functionality
                  }

                  await BleManager.retrieveServices(peripheral.id);
                  console.log(`✅ Services discovered for ${peripheral.id}`);

                  await startNotifications(peripheral.id);
                  console.log(`✅ Notifications started for ${peripheral.id}`);

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
                    const addEventCommand =
                      createAddEventRequest(bleParameters);

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
                  await stopNotifications(peripheral.id);

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
        await stopNotifications(targetPeripheral.id);

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
              <View style={[{ flexDirection: "row", alignItems: "center" }]}>
                <Ionicons
                  name="sync"
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
                  {getSyncStatusText(device.syncStatus ?? "NOT_SYNCED")}
                </Text>
              </View>
              <View style={[{ flexDirection: "row", alignItems: "center" }]}>
                <Ionicons
                  name="battery-half"
                  size={14}
                  color={getBatteryColor(device.batteryLevel ?? 0)}
                  style={{ marginRight: spacing[1] }}
                />
                <Text
                  style={[
                    typography.caption,
                    {
                      color: getBatteryColor(device.batteryLevel ?? 0),
                      fontWeight: "500",
                    },
                  ]}
                >
                  {device.batteryLevel ?? 0}%
                </Text>
              </View>
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
            <View style={{ flexDirection: "row", alignItems: "center" }}>
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
                  {isSyncing ? "Syncing..." : "Sync Alarms"}
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
