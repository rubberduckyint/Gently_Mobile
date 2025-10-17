/**
 * BLE Test Page
 *
 * Debug page for testing BLE commands with a specific device.
 * Connects to device by serial number and provides buttons to test various commands.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import type { AllEventsResponse } from "~/services/ble/commands/getAllEvents";
import { useBLE } from "~/contexts/BLEContext";
import {
  createAddEventRequest,
  parseAddEventResponse,
} from "~/services/ble/commands/addEvent";
// Custom header - not using expo navigation
import {
  createEnterDfuModeRequest,
  parseEnterDfuModeResponse,
} from "~/services/ble/commands/enterDfuMode";
import {
  createFindMeRequest,
  parseFindMeResponse,
} from "~/services/ble/commands/findMe";
import {
  createGetAllEventsRequest,
  handleGetAllEventsPacket,
} from "~/services/ble/commands/getAllEvents";
import {
  createGetDeviceStatusRequest,
  parseGetDeviceStatusResponse,
} from "~/services/ble/commands/getDeviceStatus";
import {
  createGetNumberOfEventsRequest,
  parseGetNumberOfEventsResponse,
} from "~/services/ble/commands/getNumberOfEvents";
import {
  createGetTimeRequest,
  parseGetTimeResponse,
} from "~/services/ble/commands/getTime";
import {
  createSetEventOnOffRequest,
  parseSetEventOnOffResponse,
} from "~/services/ble/commands/setEventOnOff";
import {
  createSetTimeRequest,
  parseSetTimeResponse,
} from "~/services/ble/commands/setTime";
import { TEAEncryption } from "~/services/ble/encryption";
import { ResponseStatus } from "~/services/ble/types";
import {
  buttons,
  cards,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";

export default function BleTestPage() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunningTest, setIsRunningTest] = useState<string | null>(null);

  // Use global BLE context
  const {
    connectionState,
    connectedDevice,
    encryptionKey,
    notifications,
    sendBLECommand,
    sendMultiPacketBLECommand,
    clearNotifications,
    addNotification: _addNotification,
    isDeviceConnected: _isDeviceConnected,
    connectToDevice: connectToDeviceFromContext,
    disconnectDevice: disconnectDeviceFromContext,
  } = useBLE();

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

  // Helper function to log detailed encryption information
  const logCommandEncryptionDetails = (
    command: { command: number; apiVersion?: number; payload?: Uint8Array },
    commandName: string,
  ) => {
    if (!encryptionKey || !connectedDevice) return;

    console.log(
      `\n🔍 ===== ${commandName.toUpperCase()} COMMAND ENCRYPTION DETAILS =====`,
    );

    // Log raw command structure before encryption
    console.log(`📤 Raw Command (before encryption):`);
    console.log(
      `   Command Code: 0x${command.command.toString(16).padStart(2, "0")}`,
    );
    console.log(`   API Version: ${command.apiVersion ?? 1}`);

    if (command.payload) {
      console.log(`   Payload Length: ${command.payload.length} bytes`);
      console.log(
        `   Payload (hex): [${Array.from(command.payload)
          .map((b: number) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(", ")}]`,
      );
      console.log(
        `   Payload (ASCII): "${Array.from(command.payload)
          .map((b: number) =>
            b >= 32 && b <= 126 ? String.fromCharCode(b) : ".",
          )
          .join("")}"`,
      );
    } else {
      console.log(`   Payload: None (command has no payload)`);
    }

    // Log encryption details
    console.log(`🔐 Encryption Details:`);
    console.log(`   Encryption Key: "${encryptionKey}"`);
    console.log(`   Key Length: ${encryptionKey.length} characters`);
    console.log(`   Device ID: ${connectedDevice.id}`);
    console.log(`   Device Name: ${connectedDevice.name ?? "Unknown"}`);

    // Simulate the packet creation process (this is what sendCommand does internally)
    try {
      const tea = new TEAEncryption(encryptionKey);

      // Create the packet structure (API + Command + Payload)
      const packetSize = 2 + (command.payload ? command.payload.length : 0);
      const packet = new Uint8Array(packetSize);
      packet[0] = command.apiVersion ?? 1;
      packet[1] = command.command;

      if (command.payload) {
        packet.set(command.payload, 2);
      }

      console.log(`📦 Complete Packet (before encryption):`);
      console.log(`   Total Size: ${packet.length} bytes`);
      console.log(
        `   Packet (hex): [${Array.from(packet)
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(", ")}]`,
      );

      // Pad to multiple of 8 bytes for TEA encryption
      const paddedSize = Math.ceil(packet.length / 8) * 8;
      const paddedPacket = new Uint8Array(paddedSize);
      paddedPacket.set(packet);
      // Fill remaining bytes with zeros (this is the padding)
      for (let i = packet.length; i < paddedSize; i++) {
        paddedPacket[i] = 0;
      }

      if (paddedSize > packet.length) {
        console.log(`📦 Padded Packet (for 8-byte alignment):`);
        console.log(
          `   Padded Size: ${paddedSize} bytes (added ${paddedSize - packet.length} padding bytes)`,
        );
        console.log(
          `   Padded (hex): [${Array.from(paddedPacket)
            .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
            .join(", ")}]`,
        );
      }

      // Encrypt the packet
      const encryptedPacket = new Uint8Array(paddedSize);
      for (let i = 0; i < paddedSize; i += 8) {
        const block = paddedPacket.slice(i, i + 8);
        const encryptedBlock = tea.encrypt(block);
        encryptedPacket.set(encryptedBlock, i);
      }

      console.log(`🔒 Encrypted Packet (what gets sent to device):`);
      console.log(`   Encrypted Size: ${encryptedPacket.length} bytes`);
      console.log(
        `   Encrypted (hex): [${Array.from(encryptedPacket)
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(", ")}]`,
      );

      // Show decryption verification
      const decryptedPacket = new Uint8Array(paddedSize);
      for (let i = 0; i < paddedSize; i += 8) {
        const block = encryptedPacket.slice(i, i + 8);
        const decryptedBlock = tea.decrypt(block);
        decryptedPacket.set(decryptedBlock, i);
      }

      console.log(`🔓 Decrypted Verification (should match original):`);
      console.log(
        `   Decrypted (hex): [${Array.from(decryptedPacket)
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(", ")}]`,
      );
      console.log(
        `   Matches Original: ${Array.from(paddedPacket).every((b, i) => b === decryptedPacket[i]) ? "✅ YES" : "❌ NO"}`,
      );
    } catch (error) {
      console.error(`❌ Encryption simulation failed:`, error);
    }

    console.log(
      `🔍 ===== END ${commandName.toUpperCase()} ENCRYPTION DETAILS =====\n`,
    );
  };

  // Monitor BLE context notifications for test logging
  const logNotificationDetails = useCallback(() => {
    // Subscribe to the latest notification from context for detailed logging
    if (notifications.length > 0) {
      const latestNotification = notifications[notifications.length - 1];
      if (latestNotification) {
        addTestResult(
          `📨 BLE Context Notification: ${latestNotification.type} - ${latestNotification.description}`,
        );
      }
    }
  }, [notifications]);

  // Log new notifications as they arrive
  useEffect(() => {
    logNotificationDetails();
  }, [logNotificationDetails]);

  // BLE manager initialization and global listeners are now handled by BLE context

  const connectToDevice = async () => {
    if (!device?.serialNumber) {
      Alert.alert("Error", "Device serial number is required");
      return;
    }

    setTestResults([]);

    try {
      // Use the context's connectToDevice method with progress callback
      await connectToDeviceFromContext(
        device.serialNumber,
        (progress) => {
          addTestResult(`${progress.message}`);
        },
        {
          maxRetries: 3,
          connectionTimeoutMs: 20000, // 20 seconds per attempt
          stabilizationDelayMs: 900,
          mtuSize: 512,
          scanTimeoutSeconds: 30, // 20 seconds scan timeout instead of 10
        },
      );

      addTestResult("🎉 Device ready for testing!");
    } catch (error) {
      addTestResult(
        `❌ Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const disconnectDevice = async () => {
    try {
      await disconnectDeviceFromContext();
      addTestResult("🔌 Disconnected from device");
    } catch (error) {
      addTestResult(
        `⚠️ Disconnect error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const runTest = async (testName: string, testFn: () => Promise<void>) => {
    if (!connectedDevice || !encryptionKey) {
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
    if (!connectedDevice || !encryptionKey) return;

    const timeRequest = createGetTimeRequest();

    // Log comprehensive encryption details to console
    logCommandEncryptionDetails(timeRequest, "GET_TIME");
    addTestResult(`📤 Get Time command encryption details logged to console`);

    const response = await sendBLECommand(timeRequest);

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
    if (!connectedDevice || !encryptionKey) return;

    const now = new Date();
    const response = await sendBLECommand(createSetTimeRequest(now));

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
    if (!connectedDevice || !encryptionKey) return;

    const response = await sendBLECommand(createGetNumberOfEventsRequest());

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
    if (!connectedDevice || !encryptionKey) return;

    const response = await sendBLECommand(createGetDeviceStatusRequest());

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
    if (!connectedDevice || !encryptionKey) return;

    const response = await sendBLECommand(createFindMeRequest());

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

  const testEnterDfuMode = async () => {
    if (!connectedDevice || !encryptionKey) return;

    // Show warning dialog before entering DFU mode
    return new Promise<void>((resolve) => {
      Alert.alert(
        "Enter DFU Mode",
        "This will reboot the device into firmware update mode. The device will advertise as 'Gently-DFU' and disconnect. Continue?",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => resolve(),
          },
          {
            text: "Enter DFU Mode",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  const response = await sendBLECommand(
                    createEnterDfuModeRequest(),
                  );

                  parseEnterDfuModeResponse(response.payload);
                  const statusText =
                    response.status === ResponseStatus.OK ? "OK" : "ERROR";
                  addTestResult(
                    `✅ Enter DFU Mode: Command sent - device will reboot into DFU mode`,
                  );
                  addTestResult(
                    `📊 Enter DFU Mode Response: Status=${statusText} (0x${response.status.toString(16)}), Command=0x${response.commandCode.toString(16)}, Raw=[${Array.from(
                      response.payload,
                    )
                      .map((b) => "0x" + b.toString(16).padStart(2, "0"))
                      .join(", ")}]`,
                  );
                  addTestResult(
                    `🔄 Device will reboot as 'Gently-DFU' and wait 1 minute for firmware update`,
                  );
                } catch (error) {
                  addTestResult(
                    `❌ Enter DFU Mode failed: ${error instanceof Error ? error.message : String(error)}`,
                  );
                } finally {
                  resolve();
                }
              })();
            },
          },
        ],
      );
    });
  };

  const testGetAllEvents = async () => {
    if (!connectedDevice || !encryptionKey) {
      addTestResult("❌ Device not connected or encryption key missing");
      return;
    }

    // Verify connection state
    if (connectionState !== "connected") {
      addTestResult(`❌ Invalid connection state: ${connectionState}`);
      return;
    }

    try {
      addTestResult(
        `🔍 Getting all events using context multi-packet handler...`,
      );

      const result = (await sendMultiPacketBLECommand(
        createGetAllEventsRequest(),
        handleGetAllEventsPacket,
      )) as AllEventsResponse;

      addTestResult(`✅ Get All Events: Found ${result.totalEvents} events`);
      if (result.events.length > 0) {
        result.events.forEach((event, index) => {
          const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const activeDays = daysOfWeek
            .filter((_, i) => (event.days & (1 << i)) !== 0)
            .join(", ");
          addTestResult(
            `  📅 Event ${index + 1}: ${event.hour.toString().padStart(2, "0")}:${event.minute.toString().padStart(2, "0")} on ${activeDays || "No days"}, ${event.enabled ? "Enabled" : "Disabled"}, Pattern: ${event.vibratePattern}${event.name ? `, Name: "${event.name}"` : ""}`,
          );
        });
      } else {
        addTestResult(`  📝 No events found on device`);
      }
      addTestResult(
        `📊 Multi-packet All Events: Total=${result.totalEvents}, Parsed=${result.events.length}`,
      );
    } catch (error) {
      addTestResult(
        `❌ Get All Events failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const testAddEvent = async () => {
    if (!connectedDevice || !encryptionKey) return;

    const now = new Date();
    const future = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes in the future

    const eventRequest = createAddEventRequest({
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
    });

    // Log comprehensive encryption details to console
    logCommandEncryptionDetails(eventRequest, "ADD_EVENT");

    // Also add basic info to test results UI
    addTestResult(`📤 Add Event command encryption details logged to console`);
    addTestResult(
      `🔐 Using encryption key: ${encryptionKey.substring(0, 8)}...`,
    );
    addTestResult(`📱 Sending to device: ${connectedDevice.id}`);

    const response = await sendBLECommand(eventRequest);

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
    if (!connectedDevice || !encryptionKey) return;

    const response = await sendBLECommand(createSetEventOnOffRequest(0, true)); // Enable event at index 0

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
    if (!connectedDevice || !encryptionKey) return;

    try {
      addTestResult("🔄 Starting alarm sync process...");

      const now = new Date();
      const future = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes in the future
      const eventIndex = 0;

      // Step 1: Add the event
      addTestResult("📝 Step 1: Adding event to device...");

      const eventRequest = createAddEventRequest({
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
      });

      // Log comprehensive encryption details to console
      logCommandEncryptionDetails(eventRequest, "SYNC_ALARM_ADD_EVENT");

      // Also add to test results for UI visibility
      addTestResult(`📤 Sync alarm event encryption details logged to console`);
      addTestResult(
        `🔐 Using encryption key: ${encryptionKey.substring(0, 8)}...`,
      );
      addTestResult(`📱 Sending to device: ${connectedDevice.id}`);

      const addResponse = await sendBLECommand(eventRequest);

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
      const enableResponse = await sendBLECommand(
        createSetEventOnOffRequest(addResult.eventIndex, true),
      );

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
                {
                  name: "Enter DFU Mode",
                  test: testEnterDfuMode,
                  icon: "cloud-upload-outline",
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

        {/* BLE Context Notifications (Demo) */}
        {notifications.length > 0 && (
          <View style={[cards.base, { marginTop: spacing[4] }]}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: spacing[3],
              }}
            >
              <Text style={typography.h6}>
                BLE Notifications ({notifications.length})
              </Text>
              <Pressable
                style={[
                  buttons.base,
                  buttons.ghost,
                  {
                    paddingHorizontal: spacing[2],
                    paddingVertical: spacing[1],
                  },
                ]}
                onPress={clearNotifications}
              >
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                >
                  Clear
                </Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 120 }}>
              {notifications.slice(-5).map((notification, index) => (
                <Text
                  key={index}
                  style={[
                    typography.caption,
                    {
                      fontFamily: "monospace",
                      color: colors.text.secondary,
                      marginBottom: spacing[1],
                    },
                  ]}
                >
                  [{notification.timestamp.toLocaleTimeString()}]{" "}
                  {notification.description}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
