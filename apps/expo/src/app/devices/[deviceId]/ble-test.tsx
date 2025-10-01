;
/**
 * BLE Test Page
 *
 * Debug page for testing BLE commands with a specific device.
 * Connects to device by serial number and provides buttons to test various commands.
 */

import type { Peripheral } from "react-native-ble-manager";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import BleManager, { BleScanCallbackType, BleScanMatchMode, BleScanMode } from "react-native-ble-manager";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";



import { createAddEventRequest, parseAddEventResponse } from "~/services/ble/commands/addEvent";
// Custom header - not using expo navigation
import { createFindMeRequest, parseFindMeResponse } from "~/services/ble/commands/findMe";
import { createGetAllEventsRequest, parseGetAllEventsResponse } from "~/services/ble/commands/getAllEvents";
import { createGetDeviceInfoRequest, parseGetDeviceInfoResponse } from "~/services/ble/commands/getDeviceInfo";
import { createGetDeviceStatusRequest, parseGetDeviceStatusResponse } from "~/services/ble/commands/getDeviceStatus";
import { createGetNumberOfEventsRequest, parseGetNumberOfEventsResponse } from "~/services/ble/commands/getNumberOfEvents";
import { createGetTimeRequest, parseGetTimeResponse } from "~/services/ble/commands/getTime";
import { createGetUptimeRequest, parseGetUptimeResponse } from "~/services/ble/commands/getUptime";
import { createSetEventOnOffRequest, parseSetEventOnOffResponse } from "~/services/ble/commands/setEventOnOff";
import { createSetTimeRequest, parseSetTimeResponse } from "~/services/ble/commands/setTime";
import { extractAndDecryptAdvertisementData, generateDynamicKey } from "~/services/ble/encryption";
import { sendCommand, startNotifications, stopNotifications } from "~/services/ble/manager";
import { FACTORY_BRACELET_KEY, ResponseStatus } from "~/services/ble/types";
import { buttons, cards, colors, containers, spacing, typography } from "~/styles";
import { trpc } from "~/utils/api";


type ConnectionState = "disconnected" | "scanning" | "connecting" | "connected";

export default function BleTestPage() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [connectedPeripheral, setConnectedPeripheral] =
    useState<Peripheral | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunningTest, setIsRunningTest] = useState<string | null>(null);

  const {
    data: device,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["device", "getById", { id: deviceId }],
    queryFn: async () => {
      return await trpc.device.getById.query({ id: deviceId });
    },
    enabled: !!deviceId,
  });

  const addTestResult = (result: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTestResults((prev) => [`[${timestamp}] ${result}`, ...prev]);
  };

  const connectToDevice = async () => {
    if (!device?.serialNumber) {
      Alert.alert("Error", "Device serial number is required");
      return;
    }

    setConnectionState("scanning");
    setTestResults([]);
    addTestResult("🔍 Starting connection process...");

    try {
      // Start BLE manager
      await BleManager.start({ showAlert: false });

      // First, check if device is already connected
      addTestResult("📱 Checking for existing connections...");
      const connectedPeripherals = await BleManager.getConnectedPeripherals([]);
      addTestResult(
        `Found ${connectedPeripherals.length} connected peripherals`,
      );

      // Check if any connected peripheral has a stored key for our device
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
            addTestResult(
              `🔑 Found stored key for peripheral: ${peripheral.id}`,
            );

            // Test the connection with the stored key
            addTestResult("🔐 Testing existing connection...");

            try {
              if (Platform.OS === "android") {
                console.log(`🔧 Configuring MTU for Android device...`);
                // Request MTU of 512 for better communication performance
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
              }

              // Start notifications if not already started
              await startNotifications(peripheral.id);
              addTestResult("✅ Notifications started for existing connection");

              // Validate the connection with a test command
              const uptimeResponse = await sendCommand({
                peripheralId: peripheral.id,
                command: createGetUptimeRequest(),
                encryptionKey: storedKey,
              });

              const uptimeData = parseGetUptimeResponse(uptimeResponse.payload);
              addTestResult(`📊 Device uptime: ${uptimeData.uptime} seconds`);

              if (uptimeResponse.status === ResponseStatus.OK) {
                addTestResult("✅ Existing connection validated successfully!");
                setConnectedPeripheral(peripheral);
                setEncryptionKey(storedKey);
                setConnectionState("connected");
                addTestResult("🎉 Device ready for testing!");
                return; // Exit early, no need to scan
              } else {
                addTestResult(
                  "⚠️ Existing connection validation failed, will scan for device",
                );
                // Continue to scanning if validation fails
              }
            } catch (testError) {
              addTestResult(
                `⚠️ Connection test failed: ${testError instanceof Error ? testError.message : String(testError)}`,
              );
              // Continue to scanning if test fails
            }
          }
        } catch {
          // No stored key for this peripheral, continue checking others
        }
      }

      // If no valid existing connection found, proceed with scanning
      addTestResult(
        "🔍 No valid existing connection found, starting device scan...",
      );

      let foundEncryptionKey: string | null = null;

      // Set up scan listener
      const handleDiscoverPeripheral = async (peripheral: Peripheral) => {
        if (peripheral.name !== "Gently") return; // Ignore non-Gently devices

        if (peripheral.advertising.manufacturerRawData) {
          try {
            const adData = extractAndDecryptAdvertisementData(
              peripheral.advertising.manufacturerRawData,
            );

            addTestResult(`🔍 Found device: ${adData?.serialNumber}`);

            if (
              adData &&
              (adData.serialNumber === device.serialNumber ||
                adData.serialNumber.toUpperCase() ===
                  device.serialNumber?.toUpperCase())
            ) {
              addTestResult(`✅ Target device found: ${device.serialNumber}`);

              // Stop scanning and begin connection
              await BleManager.stopScan();

              setConnectionState("connecting");
              addTestResult("🔗 Connecting to device...");

              try {
                // Connect to device
                await BleManager.connect(peripheral.id);
                addTestResult("✅ Connected to device");

                if (Platform.OS === "android") {
                  console.log(`🔧 Configuring MTU for Android device...`);
                  // Request MTU of 512 for better communication performance
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
                }

                await BleManager.retrieveServices(peripheral.id);
                addTestResult("✅ Services discovered");

                await startNotifications(peripheral.id);
                addTestResult("✅ Notifications started");

                // Generate encryption key
                addTestResult("🔐 Generating encryption key...");

                const uptimeResponse = await sendCommand({
                  peripheralId: peripheral.id,
                  command: createGetUptimeRequest(),
                  encryptionKey: FACTORY_BRACELET_KEY,
                });

                const uptimeData = parseGetUptimeResponse(
                  uptimeResponse.payload,
                );
                addTestResult(`📊 Device uptime: ${uptimeData.uptime} seconds`);

                // Generate dynamic key
                foundEncryptionKey = generateDynamicKey(
                  FACTORY_BRACELET_KEY,
                  uptimeData.uptimeBytes,
                  device.serialNumber,
                );

                addTestResult("🔐 Dynamic encryption key generated");

                // Send getDeviceInfo to validate the new key and complete pairing
                addTestResult("📋 Validating connection with getDeviceInfo...");

                const deviceInfoResponse = await sendCommand({
                  peripheralId: peripheral.id,
                  command: createGetDeviceInfoRequest(),
                  encryptionKey: foundEncryptionKey,
                });

                const deviceInfo = parseGetDeviceInfoResponse(
                  deviceInfoResponse.payload,
                );
                const deviceInfoStatusText =
                  deviceInfoResponse.status === ResponseStatus.OK
                    ? "OK"
                    : "ERROR";

                addTestResult(
                  `📋 Device Info: HW v${deviceInfo.hardwareVersion}, FW v${deviceInfo.firmwareVersionMajor}.${deviceInfo.firmwareVersionMinor}.${deviceInfo.firmwareBuildNumber}`,
                );
                addTestResult(
                  `📊 Device Info Response: Status=${deviceInfoStatusText} (0x${deviceInfoResponse.status.toString(16)}), Command=0x${deviceInfoResponse.commandCode.toString(16)}`,
                );

                if (deviceInfoResponse.status !== ResponseStatus.OK) {
                  throw new Error(
                    `Device info validation failed: Status=0x${deviceInfoResponse.status.toString(16)}`,
                  );
                }

                // Only store the key after successful device info validation
                const sanitizedDeviceId = peripheral.id.replace(
                  /[^a-zA-Z0-9._-]/g,
                  "_",
                );
                await SecureStore.setItemAsync(
                  `ble_device_${sanitizedDeviceId}`,
                  foundEncryptionKey,
                );

                addTestResult(
                  "✅ Pairing completed - encryption key validated and stored",
                );

                setConnectedPeripheral(peripheral);
                setEncryptionKey(foundEncryptionKey);
                setConnectionState("connected");
                addTestResult("🎉 Device ready for testing!");
              } catch (connectionError) {
                addTestResult(
                  `❌ Connection failed: ${connectionError instanceof Error ? connectionError.message : String(connectionError)}`,
                );
                setConnectionState("disconnected");
              }
            }
          } catch {
            // Not a Gently device, ignore
          }
        }
      };

      // Start scanning
      const discoverListener = BleManager.onDiscoverPeripheral(
        handleDiscoverPeripheral,
      );

      await BleManager.scan([], 10, false, {
        matchMode: BleScanMatchMode.Sticky,
        scanMode: BleScanMode.LowLatency,
        callbackType: BleScanCallbackType.AllMatches,
        legacy: false,
      });

      // Wait for scan to complete
      await new Promise((resolve) => setTimeout(resolve, 10000));
      discoverListener.remove();

      // Note: targetPeripheral might be set during the scan callback
      console.log("🔍 Scan completed, checking if device was found...");
      // Device connection happens in the discover callback above
    } catch (error) {
      addTestResult(
        `❌ Scan failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      setConnectionState("disconnected");
    }
  };

  const disconnectDevice = async () => {
    if (connectedPeripheral) {
      try {
        await stopNotifications(connectedPeripheral.id);
        await BleManager.disconnect(connectedPeripheral.id);
        addTestResult("🔌 Disconnected from device");
      } catch (error) {
        addTestResult(
          `⚠️ Disconnect error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    setConnectedPeripheral(null);
    setEncryptionKey(null);
    setConnectionState("disconnected");
  };

  const runTest = async (testName: string, testFn: () => Promise<void>) => {
    if (!connectedPeripheral || !encryptionKey) {
      Alert.alert("Error", "Device must be connected first");
      return;
    }

    setIsRunningTest(testName);
    addTestResult(`🧪 Running ${testName} test...`);

    try {
      await testFn();
    } catch (error) {
      addTestResult(
        `❌ ${testName} test failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsRunningTest(null);
    }
  };

  const testGetTime = async () => {
    if (!connectedPeripheral || !encryptionKey) return;

    const response = await sendCommand({
      peripheralId: connectedPeripheral.id,
      command: createGetTimeRequest(),
      encryptionKey,
    });

    const result = parseGetTimeResponse(response.payload);
    const statusText = response.status === ResponseStatus.OK ? "OK" : "ERROR";
    addTestResult(`✅ Get Time: ${result.date.toLocaleString()}`);
    addTestResult(
      `📊 Time Response: Status=${statusText} (0x${response.status.toString(16)}), Command=0x${response.commandCode.toString(16)}, Year=${result.year}, Month=${result.month}, Day=${result.day}, Hour=${result.hour}, Minute=${result.minute}, Seconds=${result.seconds}, WeekDay=${result.weekDay}`,
    );
    addTestResult(
      `📊 Raw Response: [${Array.from(response.payload)
        .map((b) => "0x" + b.toString(16).padStart(2, "0"))
        .join(", ")}]`,
    );
  };

  const testSetTime = async () => {
    if (!connectedPeripheral || !encryptionKey) return;

    const now = new Date();
    const response = await sendCommand({
      peripheralId: connectedPeripheral.id,
      command: createSetTimeRequest(now),
      encryptionKey,
    });

    parseSetTimeResponse(response.payload);
    const statusText = response.status === ResponseStatus.OK ? "OK" : "ERROR";
    addTestResult(`✅ Set Time: Command sent successfully`);
    addTestResult(
      `📊 Set Time Response: Status=${statusText} (0x${response.status.toString(16)}), Command=0x${response.commandCode.toString(16)}, Raw=[${Array.from(
        response.payload,
      )
        .map((b) => "0x" + b.toString(16).padStart(2, "0"))
        .join(", ")}]`,
    );
  };

  const testGetEventCount = async () => {
    if (!connectedPeripheral || !encryptionKey) return;

    const response = await sendCommand({
      peripheralId: connectedPeripheral.id,
      command: createGetNumberOfEventsRequest(),
      encryptionKey,
    });

    const result = parseGetNumberOfEventsResponse(response.payload);
    const statusText = response.status === ResponseStatus.OK ? "OK" : "ERROR";
    addTestResult(
      `✅ Event Count: ${result.count} events (max: ${result.maxEvents})`,
    );
    addTestResult(
      `📊 Event Count Response: Status=${statusText} (0x${response.status.toString(16)}), Command=0x${response.commandCode.toString(16)}, Count=${result.count}, MaxEvents=${result.maxEvents}, Raw=[${Array.from(
        response.payload,
      )
        .map((b) => "0x" + b.toString(16).padStart(2, "0"))
        .join(", ")}]`,
    );
  };

  const testGetDeviceStatus = async () => {
    if (!connectedPeripheral || !encryptionKey) return;

    const response = await sendCommand({
      peripheralId: connectedPeripheral.id,
      command: createGetDeviceStatusRequest(),
      encryptionKey,
    });

    const result = parseGetDeviceStatusResponse(response.payload);
    const statusText = response.status === ResponseStatus.OK ? "OK" : "ERROR";
    addTestResult(
      `✅ Device Status: Battery ${result.batteryLevel}%, ${result.chargingStatus ? "Charging" : "Not Charging"}`,
    );
    addTestResult(
      `📊 Device Status Response: Status=${statusText} (0x${response.status.toString(16)}), Command=0x${response.commandCode.toString(16)}, BatteryVoltage=${result.batteryVoltage}mV, BatteryLevel=${result.batteryLevel}, Charging=${result.chargingStatus}, ActiveEvents=${result.activeEventsCount}, ErrorCode=0x${result.errorCode.toString(16)}`,
    );
    addTestResult(
      `📊 Raw Response: [${Array.from(response.payload)
        .map((b) => "0x" + b.toString(16).padStart(2, "0"))
        .join(", ")}]`,
    );
  };

  const testFindMe = async () => {
    if (!connectedPeripheral || !encryptionKey) return;

    const response = await sendCommand({
      peripheralId: connectedPeripheral.id,
      command: createFindMeRequest(),
      encryptionKey,
    });

    parseFindMeResponse(response.payload);
    const statusText = response.status === ResponseStatus.OK ? "OK" : "ERROR";
    addTestResult(
      `✅ Find Me: Command sent - device should be vibrating/flashing`,
    );
    addTestResult(
      `📊 Find Me Response: Status=${statusText} (0x${response.status.toString(16)}), Command=0x${response.commandCode.toString(16)}, Raw=[${Array.from(
        response.payload,
      )
        .map((b) => "0x" + b.toString(16).padStart(2, "0"))
        .join(", ")}]`,
    );
  };

  const testGetAllEvents = async () => {
    if (!connectedPeripheral || !encryptionKey) return;

    const response = await sendCommand({
      peripheralId: connectedPeripheral.id,
      command: createGetAllEventsRequest(),
      encryptionKey,
    });

    const result = parseGetAllEventsResponse(response.payload);
    const statusText = response.status === ResponseStatus.OK ? "OK" : "ERROR";
    addTestResult(`✅ Get All Events: Found ${result.totalEvents} events`);
    if (result.events.length > 0) {
      result.events.forEach((event, index) => {
        const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const activeDays = daysOfWeek
          .filter((_, i) => (event.days & (1 << i)) !== 0)
          .join(", ");
        addTestResult(
          `  📅 Event ${index + 1}: ${event.hour.toString().padStart(2, "0")}:${event.minute.toString().padStart(2, "0")} on ${activeDays || "No days"}, ${event.enabled ? "Enabled" : "Disabled"}, Pattern: ${event.vibratePattern}`,
        );
      });
    } else {
      addTestResult(`  📝 No events found on device`);
    }
    addTestResult(
      `📊 All Events Response: Status=${statusText} (0x${response.status.toString(16)}), Command=0x${response.commandCode.toString(16)}, Total=${result.totalEvents}, Events=${result.events.length}, Raw=[${Array.from(
        response.payload,
      )
        .map((b) => "0x" + b.toString(16).padStart(2, "0"))
        .join(", ")}]`,
    );
  };

  const testAddEvent = async () => {
    if (!connectedPeripheral || !encryptionKey) return;

    const now = new Date();
    const future = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes in the future

    const response = await sendCommand({
      peripheralId: connectedPeripheral.id,
      command: createAddEventRequest({
        eventIndex: 0,
        eventName: "Test",
        cronExpression: `${future.getMinutes()} ${future.getHours()} * * *`,
        vibrationPattern: 1,
        vibrationIntensity: 2,
        ledPattern: 1,
        ledColor: 1,
        severityLevel: 2,
        snoozePeriod: 5,
        snoozeTimeout: 15,
        retriggerDelay: 0,
        retriggerTimeout: 0,
      }),
      encryptionKey,
    });

    const result = parseAddEventResponse(
      response.payload,
      response.status,
      response.commandCode,
    );
    const statusText = result.status === "OK" ? "OK" : "ERROR";
    addTestResult(`✅ Add Event: Event added at index ${result.eventIndex}`);
    addTestResult(
      `📊 Add Event Response: Status=${statusText}, EventIndex=${result.eventIndex}`,
    );
  };

  const testSetEventOnOff = async () => {
    if (!connectedPeripheral || !encryptionKey) return;

    const response = await sendCommand({
      peripheralId: connectedPeripheral.id,
      command: createSetEventOnOffRequest(0, true), // Enable event at index 0
      encryptionKey,
    });

    const result = parseSetEventOnOffResponse(
      response.payload,
      response.status,
    );
    const statusText = response.status === ResponseStatus.OK ? "OK" : "ERROR";
    addTestResult(`✅ Set Event ON/OFF: Event ${result.eventIndex} enabled`);
    addTestResult(
      `📊 Set Event Response: Status=${statusText}, EventIndex=${result.eventIndex}`,
    );
  };

  const testSyncAlarm = async () => {
    if (!connectedPeripheral || !encryptionKey) return;

    try {
      addTestResult("🔄 Starting alarm sync process...");

      const now = new Date();
      const future = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes in the future
      const eventIndex = 0;

      // Step 1: Add the event
      addTestResult("📝 Step 1: Adding event to device...");
      const addResponse = await sendCommand({
        peripheralId: connectedPeripheral.id,
        command: createAddEventRequest({
          eventIndex,
          eventName: "Sync Test",
          cronExpression: `${future.getMinutes()} ${future.getHours()} * * *`,
          vibrationPattern: 1,
          vibrationIntensity: 2,
          ledPattern: 1,
          ledColor: 1,
          severityLevel: 2,
          snoozePeriod: 5,
          snoozeTimeout: 15,
          retriggerDelay: 0,
          retriggerTimeout: 0,
        }),
        encryptionKey,
      });

      const addResult = parseAddEventResponse(
        addResponse.payload,
        addResponse.status,
        addResponse.commandCode,
      );

      if (addResult.status !== "OK") {
        addTestResult(`❌ Failed to add event: ${addResult.status}`);
        return;
      }

      addTestResult(`✅ Event added at index ${addResult.eventIndex}`);

      // Step 2: Enable the event
      addTestResult("🔛 Step 2: Enabling event...");
      const enableResponse = await sendCommand({
        peripheralId: connectedPeripheral.id,
        command: createSetEventOnOffRequest(addResult.eventIndex, true),
        encryptionKey,
      });

      const enableResult = parseSetEventOnOffResponse(
        enableResponse.payload,
        enableResponse.status,
      );

      if (enableResponse.status === ResponseStatus.OK) {
        addTestResult(
          `✅ Event ${enableResult.eventIndex} enabled successfully`,
        );
        addTestResult(
          `🎉 Alarm sync completed! Event will trigger at ${future.getHours()}:${future.getMinutes().toString().padStart(2, "0")}`,
        );
      } else {
        addTestResult(`❌ Failed to enable event ${enableResult.eventIndex}`);
      }
    } catch (error) {
      addTestResult(
        `❌ Sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
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

  if (error || !device) {
    return (
      <SafeAreaView style={containers.safeArea}>
        {/* Custom Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: spacing[4],
            paddingVertical: spacing[3],
            backgroundColor: colors.background.primary,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
          }}
        >
          <View style={{ width: 40 }}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                padding: spacing[2],
                marginLeft: -spacing[2],
              })}
              accessibilityLabel="Go back"
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={colors.text.primary}
              />
            </Pressable>
          </View>
          <Text
            style={[
              typography.h3,
              {
                color: colors.text.primary,
                textAlign: "center",
                flex: 1,
              },
            ]}
          >
            BLE Test
          </Text>
          <View style={{ width: 40 }} />
        </View>
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

  return (
    <SafeAreaView style={containers.safeArea}>
      {/* Custom Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3],
          backgroundColor: colors.background.primary,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
        }}
      >
        <View style={{ width: 40 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              padding: spacing[2],
              marginLeft: -spacing[2],
            })}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </Pressable>
        </View>
        <Text
          style={[
            typography.h3,
            {
              color: colors.text.primary,
              textAlign: "center",
              flex: 1,
            },
          ]}
        >
          BLE Test
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={containers.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Device Info */}
        <View style={[cards.base, { marginTop: spacing[4] }]}>
          <Text style={[typography.h6, { marginBottom: spacing[2] }]}>
            Device: {device.title}
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, marginBottom: spacing[2] },
            ]}
          >
            Serial: {device.serialNumber ?? "Not set"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor:
                  connectionState === "connected"
                    ? colors.success[500]
                    : connectionState === "connecting" ||
                        connectionState === "scanning"
                      ? colors.warning[500]
                      : colors.gray[400],
                marginRight: spacing[2],
              }}
            />
            <Text
              style={[typography.caption, { color: colors.text.secondary }]}
            >
              Status:{" "}
              {connectionState.charAt(0).toUpperCase() +
                connectionState.slice(1)}
            </Text>
          </View>
        </View>

        {/* Connection Controls */}
        <View style={[cards.base, { marginTop: spacing[4] }]}>
          <Text style={[typography.h6, { marginBottom: spacing[3] }]}>
            Connection
          </Text>

          <View style={{ flexDirection: "row", gap: spacing[2] }}>
            <Pressable
              style={[
                buttons.base,
                connectionState === "connected"
                  ? buttons.success
                  : buttons.primary,
                { flex: 1 },
                (connectionState === "scanning" ||
                  connectionState === "connecting") && { opacity: 0.5 },
              ]}
              onPress={
                connectionState === "connected"
                  ? disconnectDevice
                  : connectToDevice
              }
              disabled={
                connectionState === "scanning" ||
                connectionState === "connecting"
              }
            >
              {connectionState === "scanning" ||
              connectionState === "connecting" ? (
                <ActivityIndicator
                  size="small"
                  color={colors.text.inverse}
                  style={{ marginRight: spacing[1] }}
                />
              ) : (
                <Ionicons
                  name={connectionState === "connected" ? "close" : "bluetooth"}
                  size={16}
                  color={colors.text.inverse}
                  style={{ marginRight: spacing[1] }}
                />
              )}
              <Text style={[typography.label, { color: colors.text.inverse }]}>
                {connectionState === "connected"
                  ? "Disconnect"
                  : connectionState === "connecting"
                    ? "Connecting..."
                    : connectionState === "scanning"
                      ? "Scanning..."
                      : "Connect"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Test Commands */}
        {connectionState === "connected" && (
          <View style={[cards.base, { marginTop: spacing[4] }]}>
            <Text style={[typography.h6, { marginBottom: spacing[3] }]}>
              Test Commands
            </Text>

            <View style={{ gap: spacing[2] }}>
              {[
                { name: "Get Time", test: testGetTime, icon: "time" },
                { name: "Set Time", test: testSetTime, icon: "time-outline" },
                {
                  name: "Get Event Count",
                  test: testGetEventCount,
                  icon: "list",
                },
                {
                  name: "Get All Events",
                  test: testGetAllEvents,
                  icon: "calendar",
                },
                {
                  name: "Get Device Status",
                  test: testGetDeviceStatus,
                  icon: "hardware-chip",
                },
                { name: "Find Me", test: testFindMe, icon: "flashlight" },
                {
                  name: "Add Test Event",
                  test: testAddEvent,
                  icon: "add-circle-outline",
                },
                {
                  name: "Enable Event (ON/OFF)",
                  test: testSetEventOnOff,
                  icon: "toggle",
                },
                {
                  name: "Sync Alarm (Add + Enable)",
                  test: testSyncAlarm,
                  icon: "sync",
                },
              ].map((command) => (
                <Pressable
                  key={command.name}
                  style={[
                    buttons.base,
                    buttons.secondary,
                    isRunningTest === command.name && { opacity: 0.5 },
                  ]}
                  onPress={() => runTest(command.name, command.test)}
                  disabled={isRunningTest !== null}
                >
                  {isRunningTest === command.name ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.text.primary}
                      style={{ marginRight: spacing[1] }}
                    />
                  ) : (
                    <Ionicons
                      name={command.icon as keyof typeof Ionicons.glyphMap}
                      size={16}
                      color={colors.text.primary}
                      style={{ marginRight: spacing[1] }}
                    />
                  )}
                  <Text
                    style={[typography.label, { color: colors.text.primary }]}
                  >
                    {command.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Test Results */}
        {testResults.length > 0 && (
          <View style={[cards.base, { marginTop: spacing[4] }]}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: spacing[3],
              }}
            >
              <Text style={[typography.h6]}>Test Results</Text>
              <Pressable
                style={[
                  buttons.base,
                  buttons.ghost,
                  {
                    paddingHorizontal: spacing[2],
                    paddingVertical: spacing[1],
                  },
                ]}
                onPress={() => setTestResults([])}
              >
                <Ionicons
                  name="trash-outline"
                  size={14}
                  color={colors.text.secondary}
                  style={{ marginRight: spacing[1] }}
                />
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                >
                  Clear
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={{
                maxHeight: 300,
                backgroundColor: colors.gray[50],
                borderRadius: 8,
                padding: spacing[3],
              }}
              showsVerticalScrollIndicator={true}
            >
              {testResults.map((result, index) => (
                <Text
                  key={index}
                  style={[
                    typography.caption,
                    {
                      fontFamily: "monospace",
                      color: result.includes("❌")
                        ? colors.error[600]
                        : result.includes("✅")
                          ? colors.success[600]
                          : result.includes("⚠️")
                            ? colors.warning[600]
                            : colors.text.primary,
                      marginBottom: spacing[1],
                    },
                  ]}
                >
                  {result}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}