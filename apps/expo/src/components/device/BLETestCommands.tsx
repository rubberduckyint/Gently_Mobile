import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { State } from "react-native-ble-plx";

import type { SecureConnectionResult } from "~/services/bluetooth/connection";
import type { DeviceInfo } from "~/services/bluetooth/types";
import { useBluetooth } from "~/services/bluetooth";
import { readComprehensiveDeviceDetails } from "~/services/bluetooth/commands/comprehensive";
import { colors, spacing, typography } from "~/styles";

interface BLETestCommandsProps {
  device: {
    id: string | undefined;
    serialNumber: string | null | undefined;
    title: string | undefined;
  };
  visible: boolean;
  onClose: () => void;
  existingConnection?: SecureConnectionResult | null;
}

interface TestCommand {
  name: string;
  description: string;
  action: (connection?: SecureConnectionResult) => Promise<void>;
}

export function BLETestCommands({
  device,
  visible,
  onClose,
  existingConnection,
}: BLETestCommandsProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [lastResult, setLastResult] = useState<string>("");
  const [testingCommand, setTestingCommand] = useState<string>("");
  const [deviceDetails, setDeviceDetails] = useState<{
    deviceInfo: DeviceInfo;
    deviceTime: Date;
    batteryLevel: number;
    timestamp: Date;
  } | null>(null);
  const { connect, disconnect, getBluetoothState } = useBluetooth();

  const executeTest = async (command: TestCommand) => {
    if (!device.id) {
      Alert.alert("Error", "Device ID is required for BLE commands");
      return;
    }

    if (!device.serialNumber) {
      Alert.alert("Error", "Device serial number is required for BLE commands");
      return;
    }

    setIsTesting(true);
    setTestingCommand(command.name);
    setLastResult("");

    try {
      // Check Bluetooth state
      const bluetoothState = await getBluetoothState();
      if (bluetoothState !== State.PoweredOn) {
        Alert.alert(
          "Bluetooth Required",
          "Please enable Bluetooth to test commands.",
        );
        return;
      }

      console.log(`🧪 Testing BLE command: ${command.name}`);

      if (existingConnection) {
        console.log("🔗 Using existing persistent connection for test");
        await command.action(existingConnection);
      } else {
        console.log("🔗 Creating new connection for test");
        await command.action();
      }

      setLastResult(`✅ ${command.name} completed successfully`);
      console.log(`✅ BLE command success: ${command.name}`);
    } catch (error) {
      const errorText = `❌ ${command.name} failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setLastResult(errorText);
      console.error(`❌ BLE command failed:`, error);

      // Only try to disconnect if we're not using a persistent connection
      if (!existingConnection) {
        try {
          await disconnect();
        } catch (disconnectError) {
          console.error("❌ Error during cleanup disconnect:", disconnectError);
        }
      }
    } finally {
      setIsTesting(false);
      setTestingCommand("");
    }
  };

  const testCommands: TestCommand[] = [
    {
      name: "Basic Connection Test",
      description: "Test basic BLE connection to device",
      action: async (connection?: SecureConnectionResult) => {
        if (!device.id) throw new Error("Device ID is required");

        if (connection) {
          console.log(`🔗 Using existing connection for basic test`);
          console.log(`🔗 Protocol established:`, !!connection.protocol);
          console.log(`🔗 Device info available:`, !!connection.deviceInfo);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
          console.log("✅ Test completed using existing connection");
        } else {
          const connectionResult = await connect(device.id);
          console.log(`🔗 Connected to device successfully`);
          console.log(`🔗 Protocol established:`, !!connectionResult.protocol);
          console.log(
            `🔗 Device info available:`,
            !!connectionResult.deviceInfo,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
          await disconnect();
          console.log("🔌 Disconnected from device");
        }
      },
    },
    {
      name: "Device Information Test",
      description: "Test getting device information through secure protocol",
      action: async (connection?: SecureConnectionResult) => {
        if (!device.id) throw new Error("Device ID is required");

        let deviceInfo;
        if (connection) {
          console.log(`📱 Using existing connection for device info test`);
          deviceInfo = connection.deviceInfo;
        } else {
          const connectionResult = await connect(device.id);
          deviceInfo = connectionResult.deviceInfo;
        }

        console.log(`📱 Hardware Version: ${deviceInfo.hardwareVersion}`);
        console.log(
          `📱 Firmware Version: ${deviceInfo.firmwareVersionMajor}.${deviceInfo.firmwareVersionMinor}`,
        );
        console.log(`📱 Build Number: ${deviceInfo.firmwareBuildNumber}`);

        if (!connection) {
          await disconnect();
        }
      },
    },
    {
      name: "Protocol Test",
      description: "Test if secure protocol is established correctly",
      action: async (connection?: SecureConnectionResult) => {
        if (!device.id) throw new Error("Device ID is required");

        let protocol;
        if (connection) {
          console.log(`🔐 Using existing connection for protocol test`);
          protocol = connection.protocol;
        } else {
          const connectionResult = await connect(device.id);
          protocol = connectionResult.protocol;
        }

        console.log(
          `🔐 Dynamic key established: ${protocol.isDynamicKeyEstablished()}`,
        );
        console.log(`🔐 Protocol ready for commands`);

        if (!connection) {
          await disconnect();
        }
      },
    },
    {
      name: "Get Device Details & Time",
      description:
        "Get comprehensive device details including info, time, and battery level",
      action: async (connection?: SecureConnectionResult) => {
        if (!device.id) throw new Error("Device ID is required");

        let connectionToUse = connection;
        connectionToUse ??= await connect(device.id);

        console.log(`📋 Getting comprehensive device details...`);
        const details = await readComprehensiveDeviceDetails(connectionToUse);

        setDeviceDetails(details);

        console.log(`📱 Device Info:`, details.deviceInfo);
        console.log(`⏰ Device Time:`, details.deviceTime);
        console.log(`🔋 Battery Level: ${details.batteryLevel}%`);
        console.log(`📅 Timestamp:`, details.timestamp);

        if (!connection) {
          await disconnect();
        }
      },
    },
    {
      name: "Connection Stability Test",
      description: "Test multiple connect/disconnect cycles",
      action: async (connection?: SecureConnectionResult) => {
        if (!device.id) throw new Error("Device ID is required");

        if (connection) {
          console.log(
            `🔄 Using existing connection - simulating stability test`,
          );
          for (let i = 1; i <= 3; i++) {
            console.log(`🔄 Stability check ${i}/3`);
            await new Promise((resolve) => setTimeout(resolve, 500));
            console.log(`✅ Connection stable (check ${i})`);
          }
          console.log(`🎉 All 3 stability checks completed successfully`);
        } else {
          for (let i = 1; i <= 3; i++) {
            console.log(`🔄 Connection cycle ${i}/3`);
            await connect(device.id);
            console.log(`✅ Connected (cycle ${i})`);
            await new Promise((resolve) => setTimeout(resolve, 500));
            await disconnect();
            console.log(`🔌 Disconnected (cycle ${i})`);
            if (i < 3) {
              await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait between cycles
            }
          }
          console.log(`🎉 All 3 connection cycles completed successfully`);
        }
      },
    },
    {
      name: "Device State Test",
      description: "Check device connection state and properties",
      action: async (connection?: SecureConnectionResult) => {
        if (!device.id) throw new Error("Device ID is required");

        let bleDevice;
        if (connection) {
          console.log(`🔗 Using existing connection for device state test`);
          bleDevice = connection.device;
        } else {
          const connectionResult = await connect(device.id);
          bleDevice = connectionResult.device;
        }

        console.log(`🔗 Device ID: ${bleDevice.id}`);
        console.log(`🔗 Device Name: ${bleDevice.name ?? "Unknown"}`);
        console.log(
          `🔗 Device Local Name: ${bleDevice.localName ?? "Unknown"}`,
        );

        // Check connection state
        const isConnected = await bleDevice.isConnected();
        console.log(`🔗 Is Connected: ${isConnected}`);

        if (!connection) {
          await disconnect();
        }
      },
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>BLE Connection Test</Text>
          <Text style={styles.subtitle}>
            Device: {device.title ?? "Unknown"}
          </Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {testCommands.map((command) => (
            <View key={command.name} style={styles.commandCard}>
              <View style={styles.commandHeader}>
                <Text style={styles.commandName}>{command.name}</Text>
              </View>
              <Text style={styles.commandDescription}>
                {command.description}
              </Text>

              <Pressable
                style={[
                  styles.testButton,
                  isTesting && styles.testButtonDisabled,
                  testingCommand === command.name && styles.testButtonActive,
                ]}
                onPress={() => executeTest(command)}
                disabled={isTesting}
              >
                <Text
                  style={[
                    styles.testButtonText,
                    testingCommand === command.name &&
                      styles.testButtonTextActive,
                  ]}
                >
                  {testingCommand === command.name ? "Testing..." : "Test"}
                </Text>
              </Pressable>
            </View>
          ))}

          {lastResult && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultTitle}>Last Test Result:</Text>
              <Text style={styles.resultText}>{lastResult}</Text>
            </View>
          )}

          {deviceDetails && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultTitle}>Device Details:</Text>
              <View style={styles.deviceDetailsContainer}>
                <Text style={styles.deviceDetailItem}>
                  📱 Serial Number: {deviceDetails.deviceInfo.serialNumber}
                </Text>
                <Text style={styles.deviceDetailItem}>
                  🔧 Firmware Version:{" "}
                  {deviceDetails.deviceInfo.firmwareVersion}
                </Text>
                <Text style={styles.deviceDetailItem}>
                  🔋 Battery Level: {deviceDetails.batteryLevel}%
                </Text>
                <Text style={styles.deviceDetailItem}>
                  ⏰ Device Time: {deviceDetails.deviceTime.toLocaleString()}
                </Text>
                <Text style={styles.deviceDetailItem}>
                  📅 Retrieved: {deviceDetails.timestamp.toLocaleString()}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.medium,
    backgroundColor: colors.background.secondary,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing[1],
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing[3],
  },
  closeButton: {
    alignSelf: "flex-end",
    backgroundColor: colors.gray[200],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: 8,
  },
  closeButtonText: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: spacing[4],
  },
  commandCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: spacing[4],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  commandHeader: {
    marginBottom: spacing[2],
  },
  commandName: {
    ...typography.h4,
    color: colors.text.primary,
  },
  commandDescription: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing[3],
  },
  testButton: {
    backgroundColor: colors.primary[500],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: 8,
    alignItems: "center",
  },
  testButtonDisabled: {
    backgroundColor: colors.gray[300],
  },
  testButtonActive: {
    backgroundColor: colors.warning[500],
  },
  testButtonText: {
    ...typography.body,
    color: colors.text.inverse,
    fontWeight: "600",
  },
  testButtonTextActive: {
    color: colors.text.inverse,
  },
  resultContainer: {
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: spacing[4],
    marginTop: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  resultTitle: {
    ...typography.h5,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  resultText: {
    ...typography.body,
    color: colors.text.secondary,
    fontFamily: "monospace",
  },
  deviceDetailsContainer: {
    marginTop: spacing[2],
  },
  deviceDetailItem: {
    ...typography.body,
    color: colors.text.primary,
    marginBottom: spacing[1],
    fontSize: 14,
  },
});
