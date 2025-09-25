/**
 * BLE Test Page - Device Connection Testing
 * Tests BLE connection system with proper encryption and pairing for a specific device
 * Uses the global BLE context for connection management
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type { EventData } from "~/services/ble/types";
import { Header } from "~/components/ui/Header";
import { useBLE, useBLEScanning } from "~/contexts/BLEContext";
import {
  findMe,
  getDeviceInfo,
  getDeviceStatus,
  getNumberOfEvents,
  getTime,
  getUptime,
  setTime,
} from "~/services/ble/commands";
import { addEvent } from "~/services/ble/commands/addEvent";
import { removeAllEvents } from "~/services/ble/commands/removeAllEvents";
import { setEventOnOff } from "~/services/ble/commands/setEventOnOff";
import {
  LedColor,
  LedPattern,
  SeverityLevel,
  VibrationIntensity,
} from "~/services/ble/types";
import {
  buttons,
  buttonText,
  cards,
  colors,
  containers,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";

interface TestResult {
  id: string;
  name: string;
  status: "idle" | "running" | "success" | "error";
  result?: string;
  error?: string;
  duration?: number;
}

export default function BleTestPage() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const ble = useBLE();
  const { connect: connectToDevice, isConnectedTo: isConnectedToSerial } = ble;
  const { discoveredDevices, startScan } = useBLEScanning();
  const [lastEventIndex, setLastEventIndex] = useState<number | null>(null);
  const autoConnectAttemptedRef = useRef(false);

  const [testResults, setTestResults] = useState<TestResult[]>([
    { id: "scan", name: "Scan for Devices", status: "idle" },
    { id: "connect", name: "Connect by Serial", status: "idle" },
    { id: "uptime", name: "Get Uptime", status: "idle" },
    { id: "deviceInfo", name: "Get Device Info", status: "idle" },
    { id: "getTime", name: "Get Time", status: "idle" },
    { id: "setTime", name: "Set Time", status: "idle" },
    { id: "findMe", name: "Find Me", status: "idle" },
    { id: "status", name: "Get Device Status", status: "idle" },
    { id: "numberOfEvents", name: "Get Number of Events", status: "idle" },
    { id: "addEvent", name: "Add Test Event", status: "idle" },
    { id: "setEventOn", name: "Enable Test Event", status: "idle" },
    { id: "setEventOff", name: "Disable Test Event", status: "idle" },
    { id: "removeEvents", name: "Remove All Events", status: "idle" },
    { id: "disconnect", name: "Disconnect", status: "idle" },
  ]);

  const EVENT_TEST_INDEX = 0;

  const createTestEventData = () => {
    const now = new Date();
    const scheduledTime = new Date(now.getTime() + 2 * 60 * 1000);
    scheduledTime.setSeconds(0, 0);

    const minute = scheduledTime.getMinutes();
    const hour = scheduledTime.getHours();
    const cronExpression = `${minute} ${hour} * * *`;

    const timestampSuffix = `${hour.toString().padStart(2, "0")}${minute
      .toString()
      .padStart(2, "0")}`;
    const eventName = `BLE${timestampSuffix}`.slice(0, 10);

    const eventData: EventData = {
      eventIndex: EVENT_TEST_INDEX,
      vibrationPattern: 1,
      vibrationIntensity: VibrationIntensity.MEDIUM,
      ledPattern: LedPattern.BLINK_SLOW,
      ledColor: LedColor.CYAN,
      severityLevel: SeverityLevel.INFORMATIONAL,
      snoozePeriod: 5,
      snoozeTimeout: 15,
      retriggerDelay: 5,
      retriggerTimeout: 30,
      eventName,
      cronExpression,
    };

    return { eventData, scheduledTime };
  };

  // Fetch device information
  const {
    data: device,
    isLoading: deviceLoading,
    error: deviceError,
  } = useQuery({
    queryKey: ["device", deviceId],
    queryFn: () => trpc.device.getById.query({ id: deviceId }),
    enabled: !!deviceId,
  });

  const { connectionState, isConnecting } = ble;

  const isConnectedToDevice = device?.serialNumber
    ? isConnectedToSerial(device.serialNumber)
    : false;

  const connectionStatusColor = isConnectedToDevice
    ? colors.success[500]
    : isConnecting
      ? colors.warning[500]
      : colors.error[500];

  const connectionStatusBackground = isConnectedToDevice
    ? colors.success[50]
    : isConnecting
      ? colors.warning[50]
      : colors.error[50];

  const connectionStatusIcon = isConnectedToDevice
    ? "✅"
    : isConnecting
      ? "⌛"
      : connectionState.isConnected
        ? "🔁"
        : "❌";

  const connectionStatusLabel = isConnectedToDevice
    ? "Connected to this device"
    : isConnecting
      ? "Attempting connection..."
      : connectionState.isConnected
        ? "Connected to different device"
        : "Not connected";

  useEffect(() => {
    autoConnectAttemptedRef.current = false;
  }, [device?.serialNumber]);

  useEffect(() => {
    const serial = device?.serialNumber;
    if (!serial) {
      return;
    }

    if (!isConnecting && !isConnectedToSerial(serial)) {
      autoConnectAttemptedRef.current = false;
    }
  }, [device?.serialNumber, isConnecting, isConnectedToSerial]);

  // Auto-connect when device is available
  useEffect(() => {
    const serial = device?.serialNumber;
    if (!serial) {
      autoConnectAttemptedRef.current = false;
      return;
    }

    if (isConnectedToSerial(serial)) {
      autoConnectAttemptedRef.current = true;
      return;
    }

    if (isConnecting || autoConnectAttemptedRef.current) {
      return;
    }

    autoConnectAttemptedRef.current = true;
    const autoConnect = async () => {
      try {
        console.log(
          `🔗 Auto-connecting to device ${serial} on BLE test page...`,
        );
        await connectToDevice(serial);
        console.log(`✅ Auto-connection successful for ${serial}`);
      } catch (error) {
        console.error("Auto-connection failed:", error);
        autoConnectAttemptedRef.current = false;
      }
    };

    void autoConnect();
  }, [
    device?.serialNumber,
    connectToDevice,
    isConnectedToSerial,
    isConnecting,
  ]);
  const updateTestResult = (
    id: string,
    updates: Partial<Omit<TestResult, "id" | "name">>,
  ) => {
    setTestResults((prev) =>
      prev.map((result) =>
        result.id === id ? { ...result, ...updates } : result,
      ),
    );
  };

  useEffect(() => {
    if (!device?.serialNumber) {
      return;
    }

    setTestResults((prev) =>
      prev.map((result) => {
        if (result.id !== "connect") {
          return result;
        }

        if (isConnectedToDevice) {
          if (
            result.status === "success" &&
            result.result === `Connected to device ${device.serialNumber}`
          ) {
            return result;
          }

          return {
            ...result,
            status: "success",
            result: `Connected to device ${device.serialNumber}`,
            error: undefined,
          };
        }

        if (isConnecting) {
          if (result.status === "running") {
            return result;
          }

          return {
            ...result,
            status: "running",
            result: undefined,
            error: undefined,
          };
        }

        if (result.status === "idle" && !result.result && !result.error) {
          return result;
        }

        return {
          ...result,
          status: "idle",
          result: undefined,
          error: undefined,
        };
      }),
    );
  }, [
    device?.serialNumber,
    isConnectedToDevice,
    isConnecting,
    connectionState.isConnected,
  ]);

  const executeTest = async (id: string, testFn: () => Promise<string>) => {
    const startTime = Date.now();
    updateTestResult(id, {
      status: "running",
      result: undefined,
      error: undefined,
    });

    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      updateTestResult(id, { status: "success", result, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      updateTestResult(id, { status: "error", error: errorMessage, duration });
      throw error;
    }
  };

  // Test Functions
  const testScanDevices = async () => {
    return executeTest("scan", async () => {
      const devices = await startScan(10000);
      return `Found ${devices.length} device(s)`;
    });
  };

  const testConnect = async () => {
    if (!device?.serialNumber) {
      return;
    }

    return executeTest("connect", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      await ble.connect(device.serialNumber);
      return `Connected to device ${device.serialNumber}`;
    });
  };

  const testGetUptime = async () => {
    if (!device?.serialNumber) return;
    return executeTest("uptime", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      const uptimeResult = await getUptime(device.serialNumber);
      return `Uptime: ${uptimeResult.uptime}ms`;
    });
  };

  const testGetDeviceInfo = async () => {
    if (!device?.serialNumber) return;
    return executeTest("deviceInfo", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      const info = await getDeviceInfo(device.serialNumber);
      return `HW: ${info.hardwareVersion}, FW: ${info.firmwareVersionMajor}.${info.firmwareVersionMinor}.${info.firmwareBuildNumber}`;
    });
  };

  const testGetTime = async () => {
    if (!device?.serialNumber) return;
    return executeTest("getTime", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      await getTime(device.serialNumber);
      return "Device time retrieved successfully";
    });
  };

  const testSetTime = async () => {
    if (!device?.serialNumber) return;
    return executeTest("setTime", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      await setTime(device.serialNumber);
      return "Time set to current time";
    });
  };

  const testFindMe = async () => {
    if (!device?.serialNumber) return;
    return executeTest("findMe", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      await findMe(device.serialNumber);
      return "Find Me triggered";
    });
  };

  const testGetStatus = async () => {
    if (!device?.serialNumber) return;
    return executeTest("status", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      await getDeviceStatus(device.serialNumber);
      return "Device status retrieved successfully";
    });
  };

  const testGetNumberOfEvents = async () => {
    if (!device?.serialNumber) return;
    return executeTest("numberOfEvents", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      const result = await getNumberOfEvents(device.serialNumber);
      const capacityLabel =
        result.maxEvents > 0
          ? `${result.count}/${result.maxEvents}`
          : `${result.count}`;
      return `Events: ${capacityLabel}`;
    });
  };

  const testDisconnect = async () => {
    return executeTest("disconnect", async () => {
      await ble.disconnect();
      setLastEventIndex(null);
      return "Disconnected";
    });
  };

  const testAddEvent = async () => {
    if (!device?.serialNumber) return;
    return executeTest("addEvent", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      const { eventData, scheduledTime } = createTestEventData();
      const response = await addEvent(device.serialNumber, eventData);
      setLastEventIndex(response.eventIndex);

      const formattedTime = scheduledTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `Added event ${response.eventIndex} (${eventData.eventName}) @ ${formattedTime}`;
    });
  };

  const testSetEventOn = async () => {
    if (!device?.serialNumber) return;
    return executeTest("setEventOn", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      if (lastEventIndex === null) {
        throw new Error("Run 'Add Test Event' before toggling the event");
      }

      const response = await setEventOnOff(
        device.serialNumber,
        lastEventIndex,
        true,
      );
      return `Event ${response.eventIndex} enabled`;
    });
  };

  const testSetEventOff = async () => {
    if (!device?.serialNumber) return;
    return executeTest("setEventOff", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      if (lastEventIndex === null) {
        throw new Error("Run 'Add Test Event' before toggling the event");
      }

      const response = await setEventOnOff(
        device.serialNumber,
        lastEventIndex,
        false,
      );
      return `Event ${response.eventIndex} disabled`;
    });
  };

  const testRemoveEvents = async () => {
    if (!device?.serialNumber) return;
    return executeTest("removeEvents", async () => {
      if (!device.serialNumber) {
        throw new Error("Device serial number not available");
      }

      await removeAllEvents(device.serialNumber);
      setLastEventIndex(null);
      return "All events removed";
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

  if (deviceLoading) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="BLE Test" showBackButton={true} />
        <View
          style={[
            containers.content,
            { justifyContent: "center", alignItems: "center" },
          ]}
        >
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={[typography.body, { marginTop: spacing[4] }]}>
            Loading device information...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (deviceError || !device) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <Header title="BLE Test" showBackButton={true} />
        <View
          style={[
            containers.content,
            { justifyContent: "center", alignItems: "center" },
          ]}
        >
          <Text
            style={[
              typography.h5,
              { color: colors.error[600], marginBottom: spacing[2] },
            ]}
          >
            Failed to load device
          </Text>
          <Text style={[typography.body, { color: colors.text.secondary }]}>
            {deviceError?.message ?? "Device not found"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header title={`BLE Test - ${device.title}`} showBackButton={true} />

      <ScrollView
        style={containers.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Device Info Card */}
        <View style={[cards.base, { marginBottom: spacing[4] }]}>
          <Text style={[typography.h6, { marginBottom: spacing[2] }]}>
            Device Information
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: spacing[2],
            }}
          >
            <Text style={typography.body}>Name:</Text>
            <Text style={typography.body}>{device.title}</Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: spacing[2],
            }}
          >
            <Text style={typography.body}>Serial:</Text>
            <Text style={[typography.bodySmall, { fontFamily: "monospace" }]}>
              {device.serialNumber}
            </Text>
          </View>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={typography.body}>Battery:</Text>
            <Text style={typography.body}>{device.batteryLevel}%</Text>
          </View>
        </View>

        {/* Connection Info Card */}
        <View
          style={[
            cards.base,
            {
              marginBottom: spacing[4],
              borderWidth: 1,
              borderColor: connectionStatusColor,
            },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: connectionStatusBackground,
              borderRadius: 8,
              paddingVertical: spacing[2],
              paddingHorizontal: spacing[3],
              marginBottom: spacing[3],
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 20, marginRight: spacing[2] }}>
                {connectionStatusIcon}
              </Text>
              <Text style={[typography.h6, { color: connectionStatusColor }]}>
                {connectionStatusLabel}
              </Text>
            </View>
            {isConnecting && (
              <ActivityIndicator size="small" color={connectionStatusColor} />
            )}
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: spacing[2],
            }}
          >
            <Text style={typography.body}>Connected to this device:</Text>
            <Text style={[typography.body, { color: connectionStatusColor }]}>
              {isConnectedToDevice ? "✅ Yes" : "❌ No"}
            </Text>
          </View>

          {ble.currentDevice && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: spacing[2],
              }}
            >
              <Text style={typography.body}>Active Device:</Text>
              <Text style={[typography.bodySmall, { fontFamily: "monospace" }]}>
                {ble.currentDevice.serialNumber}
              </Text>
            </View>
          )}

          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={typography.body}>Encryption Mode:</Text>
            <Text
              style={[
                typography.body,
                {
                  color: isConnectedToDevice
                    ? colors.success[500]
                    : colors.warning[500],
                },
              ]}
            >
              {isConnectedToDevice ? "� Session key active" : "🏭 Factory key"}
            </Text>
          </View>
        </View>

        {/* Discovered Devices */}
        {discoveredDevices.length > 0 && (
          <View style={[cards.base, { marginBottom: spacing[4] }]}>
            <Text style={[typography.h6, { marginBottom: spacing[2] }]}>
              Discovered Devices ({discoveredDevices.length})
            </Text>
            {discoveredDevices.map((discoveredDevice) => (
              <View
                key={discoveredDevice.device.id}
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
                  Serial: {discoveredDevice.advertisementData.serialNumber}
                </Text>
                <Text style={typography.caption}>
                  RSSI: {discoveredDevice.rssi}dBm | Key:{" "}
                  {discoveredDevice.advertisementData.braceletKeyType}
                </Text>
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
                    case "numberOfEvents":
                      void testGetNumberOfEvents();
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
                    case "removeEvents":
                      void testRemoveEvents();
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
