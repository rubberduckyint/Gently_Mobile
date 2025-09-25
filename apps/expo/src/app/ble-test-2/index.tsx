/**
 * BLE Test 2 Page - New Connection System Testing
 * Tests the new BLE connection system with proper encryption and pairing
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { ConnectionState, DiscoveredGentlyDevice } from "~/services/ble";
import { Header } from "~/components/ui/Header";
import {
  connectBySerialNumber,
  disconnectDevice,
  getConnectionState,
  requestBlePermissions,
  scanForGentlyDevices,
} from "~/services/ble";
import {
  addEvent,
  findMe,
  getDeviceInfo,
  getDeviceStatus,
  getTime,
  getUptime,
  LedColor,
  LedPattern,
  setEventOnOff,
  setTime,
  SeverityLevel,
  VibrationIntensity,
} from "~/services/ble/commands";
import {
  buttons,
  buttonText,
  cards,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";

interface TestResult {
  id: string;
  name: string;
  status: "idle" | "running" | "success" | "error";
  result?: string;
  error?: string;
  duration?: number;
}

export default function BleTest2Page() {
  const [serialNumber, setSerialNumber] = useState("1234567890ABCDEF");
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    hasCustomKey: false,
  });
  const [discoveredDevices, setDiscoveredDevices] = useState<
    DiscoveredGentlyDevice[]
  >([]);
  const [testResults, setTestResults] = useState<TestResult[]>([
    { id: "scan", name: "Scan for Devices", status: "idle" },
    { id: "connect", name: "Connect by Serial", status: "idle" },
    { id: "uptime", name: "Get Uptime", status: "idle" },
    { id: "deviceInfo", name: "Get Device Info", status: "idle" },
    { id: "getTime", name: "Get Time", status: "idle" },
    { id: "setTime", name: "Set Time", status: "idle" },
    { id: "findMe", name: "Find Me", status: "idle" },
    { id: "status", name: "Get Device Status", status: "idle" },
    { id: "addEvent", name: "Add Test Event", status: "idle" },
    { id: "setEventOn", name: "Set Event ON", status: "idle" },
    { id: "setEventOff", name: "Set Event OFF", status: "idle" },
    { id: "disconnect", name: "Disconnect", status: "idle" },
  ]);

  const updateTestResult = (
    id: string,
    status: TestResult["status"],
    result?: string,
    error?: string,
    duration?: number,
  ) => {
    setTestResults((prev) =>
      prev.map((test) =>
        test.id === id ? { ...test, status, result, error, duration } : test,
      ),
    );
  };

  const executeTest = async (id: string, testFn: () => Promise<string>) => {
    updateTestResult(id, "running");
    const startTime = Date.now();

    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      updateTestResult(id, "success", result, undefined, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      updateTestResult(id, "error", undefined, errorMessage, duration);
      throw error;
    }
  };

  // Test Functions
  const testScanDevices = async () => {
    return executeTest("scan", async () => {
      await requestBlePermissions();
      const devices = await scanForGentlyDevices({ timeoutMs: 10000 });
      setDiscoveredDevices(devices);
      return `Found ${devices.length} Gently devices`;
    });
  };

  const testConnect = async () => {
    if (!serialNumber.trim()) {
      Alert.alert("Error", "Please enter a serial number");
      return;
    }

    return executeTest("connect", async () => {
      const deviceInfo = await connectBySerialNumber(serialNumber);
      const state = await getConnectionState(serialNumber);
      setConnectionState(state);
      return `Connected to device ${deviceInfo.serialNumber}`;
    });
  };

  const testGetUptime = async () => {
    return executeTest("uptime", async () => {
      const uptimeResult = await getUptime(serialNumber);
      return `Uptime: ${uptimeResult.uptime}ms`;
    });
  };

  const testGetDeviceInfo = async () => {
    return executeTest("deviceInfo", async () => {
      const info = await getDeviceInfo(serialNumber);
      return `HW: ${info.hardwareVersion}, FW: ${info.firmwareVersionMajor}.${info.firmwareVersionMinor}.${info.firmwareBuildNumber}`;
    });
  };

  const testGetTime = async () => {
    return executeTest("getTime", async () => {
      const timeResult = await getTime(serialNumber);
      return `Device time: ${timeResult.date.toISOString()}`;
    });
  };

  const testSetTime = async () => {
    return executeTest("setTime", async () => {
      await setTime(serialNumber);
      return "Time set to current time";
    });
  };

  const testFindMe = async () => {
    return executeTest("findMe", async () => {
      await findMe(serialNumber);
      return "Find Me triggered";
    });
  };

  const testGetStatus = async () => {
    return executeTest("status", async () => {
      const status = await getDeviceStatus(serialNumber);
      return `Battery: ${status.batteryVoltage}mV (Level ${status.batteryLevel}), Charging: ${status.chargingStatus}`;
    });
  };

  const testDisconnect = async () => {
    return executeTest("disconnect", async () => {
      await disconnectDevice(serialNumber);
      const state = await getConnectionState(serialNumber);
      setConnectionState(state);
      return "Disconnected";
    });
  };

  const testAddEvent = async () => {
    return executeTest("addEvent", async () => {
      const eventData = {
        eventIndex: 0, // Use index 0 for test
        vibrationPattern: 1,
        vibrationIntensity: VibrationIntensity.MEDIUM,
        ledPattern: LedPattern.BLINK_FAST,
        ledColor: LedColor.BLUE,
        severityLevel: SeverityLevel.INFORMATIONAL,
        snoozePeriod: 5, // 5 minutes
        snoozeTimeout: 30, // 30 minutes
        retriggerDelay: 1, // 1 minute
        retriggerTimeout: 60, // 60 minutes
        eventName: "TestEvent",
        cronExpression: "0 */5 * * * *", // Every 5 minutes
      };
      const result = await addEvent(serialNumber, eventData);
      return `Event added at index ${result.eventIndex}`;
    });
  };

  const testSetEventOn = async () => {
    return executeTest("setEventOn", async () => {
      const result = await setEventOnOff(serialNumber, 0, true);
      return `Event ${result.eventIndex} turned ON`;
    });
  };

  const testSetEventOff = async () => {
    return executeTest("setEventOff", async () => {
      const result = await setEventOnOff(serialNumber, 0, false);
      return `Event ${result.eventIndex} turned OFF`;
    });
  };

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "idle":
        return "⚪";
      case "running":
        return "🟡";
      case "success":
        return "✅";
      case "error":
        return "❌";
      default:
        return "⚪";
    }
  };

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header title="BLE Test 2" showBackButton={true} />

      <ScrollView
        style={containers.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Connection Info Card */}
        <View style={[cards.base, { marginBottom: spacing[4] }]}>
          <Text style={[typography.h6, { marginBottom: spacing[2] }]}>
            Connection Status
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: spacing[2],
            }}
          >
            <Text style={typography.body}>Connected:</Text>
            <Text
              style={[
                typography.body,
                {
                  color: connectionState.isConnected
                    ? colors.success[500]
                    : colors.error[500],
                },
              ]}
            >
              {connectionState.isConnected ? "✅ Yes" : "❌ No"}
            </Text>
          </View>
          {connectionState.deviceId && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: spacing[2],
              }}
            >
              <Text style={typography.body}>Device ID:</Text>
              <Text style={[typography.bodySmall, { fontFamily: "monospace" }]}>
                {connectionState.deviceId}
              </Text>
            </View>
          )}
          {connectionState.serialNumber && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: spacing[2],
              }}
            >
              <Text style={typography.body}>Serial:</Text>
              <Text style={[typography.bodySmall, { fontFamily: "monospace" }]}>
                {connectionState.serialNumber}
              </Text>
            </View>
          )}
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={typography.body}>Custom Key:</Text>
            <Text
              style={[
                typography.body,
                {
                  color: connectionState.hasCustomKey
                    ? colors.success[500]
                    : colors.warning[500],
                },
              ]}
            >
              {connectionState.hasCustomKey ? "🔐 Yes" : "🏭 Factory"}
            </Text>
          </View>
        </View>

        {/* Discovered Devices */}
        {discoveredDevices.length > 0 && (
          <View style={[cards.base, { marginBottom: spacing[4] }]}>
            <Text style={[typography.h6, { marginBottom: spacing[2] }]}>
              Discovered Devices ({discoveredDevices.length})
            </Text>
            {discoveredDevices.map((device) => (
              <View
                key={device.device.id}
                style={{
                  padding: spacing[2],
                  backgroundColor: colors.background.tertiary,
                  borderRadius: 8,
                  marginBottom: spacing[2],
                }}
              >
                <Text
                  style={[typography.bodySmall, { fontFamily: "monospace" }]}
                >
                  Serial: {device.advertisementData.serialNumber}
                </Text>
                <Text style={typography.caption}>
                  RSSI: {device.rssi}dBm | Key:{" "}
                  {device.advertisementData.braceletKeyType}
                </Text>
                <Pressable
                  style={[
                    buttons.base,
                    buttons.small,
                    buttons.outline,
                    { marginTop: spacing[1] },
                  ]}
                  onPress={() =>
                    setSerialNumber(device.advertisementData.serialNumber)
                  }
                >
                  <Text style={buttonText.outline}>Use This Device</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Individual Tests */}
        <View style={[cards.base, { marginBottom: spacing[6] }]}>
          <Text style={[typography.h6, { marginBottom: spacing[3] }]}>
            Individual Tests
          </Text>

          {testResults.map((test) => (
            <View
              key={test.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: spacing[2],
                borderBottomWidth: 1,
                borderBottomColor: colors.border.light,
              }}
            >
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: spacing[1],
                  }}
                >
                  <Text style={{ marginRight: spacing[2] }}>
                    {getStatusIcon(test.status)}
                  </Text>
                  <Text style={typography.body}>{test.name}</Text>
                  {test.status === "running" && (
                    <ActivityIndicator
                      size="small"
                      color={colors.warning[500]}
                      style={{ marginLeft: spacing[2] }}
                    />
                  )}
                  {test.duration && (
                    <Text
                      style={[
                        typography.caption,
                        { marginLeft: "auto", color: colors.text.secondary },
                      ]}
                    >
                      {test.duration}ms
                    </Text>
                  )}
                </View>

                {test.result && (
                  <Text
                    style={[
                      typography.bodySmall,
                      { color: colors.success[600], fontFamily: "monospace" },
                    ]}
                  >
                    {test.result}
                  </Text>
                )}

                {test.error && (
                  <Text
                    style={[typography.bodySmall, { color: colors.error[600] }]}
                  >
                    Error: {test.error}
                  </Text>
                )}
              </View>

              <Pressable
                style={[
                  buttons.base,
                  buttons.small,
                  test.status === "running"
                    ? buttons.disabled
                    : buttons.outline,
                  { marginLeft: spacing[2] },
                ]}
                disabled={test.status === "running"}
                onPress={() => {
                  switch (test.id) {
                    case "scan":
                      void testScanDevices();
                      break;
                    case "connect":
                      void testConnect();
                      break;
                    case "uptime":
                      void testGetUptime();
                      break;
                    case "deviceInfo":
                      void testGetDeviceInfo();
                      break;
                    case "getTime":
                      void testGetTime();
                      break;
                    case "setTime":
                      void testSetTime();
                      break;
                    case "findMe":
                      void testFindMe();
                      break;
                    case "status":
                      void testGetStatus();
                      break;
                    case "addEvent":
                      void testAddEvent();
                      break;
                    case "setEventOn":
                      void testSetEventOn();
                      break;
                    case "setEventOff":
                      void testSetEventOff();
                      break;
                    case "disconnect":
                      void testDisconnect();
                      break;
                  }
                }}
              >
                <Text style={buttonText.outline}>Run</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
