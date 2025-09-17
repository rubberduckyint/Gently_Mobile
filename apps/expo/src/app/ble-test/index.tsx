import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { State } from "react-native-ble-plx";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type {
  BLECommandMetadata,
  BLECommandResult,
  RegistryExecutionContext,
} from "~/services/bluetooth/commands";
import { useBluetoothContext } from "~/services/bluetooth/BluetoothContext";
import {
  BLECommandSeverity,
  BLECommandStatus,
  getBLECommandRegistry,
} from "~/services/bluetooth/commands";
import { colors, spacing, typography } from "~/styles";
import { trpc } from "~/utils/api";

export default function BLETestPage() {
  const { deviceId } = useGlobalSearchParams<{ deviceId: string }>();
  const [isTesting, setIsTesting] = useState(false);
  const [lastResult, setLastResult] = useState<BLECommandResult | null>(null);
  const [testingCommand, setTestingCommand] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [availableCommands, setAvailableCommands] = useState<
    BLECommandMetadata[]
  >([]);
  const isCommandExecutionActiveRef = useRef(false);

  const {
    connectBySerialNumber,
    disconnect,
    getBluetoothState,
    stopScan,
    getCurrentConnection,
  } = useBluetoothContext();

  // Fetch device data
  const {
    data: device,
    isLoading: deviceLoading,
    error: deviceError,
  } = useQuery({
    queryKey: ["device", "getById", { id: deviceId }],
    queryFn: async () => {
      if (!deviceId) throw new Error("Device ID is required");
      return await trpc.device.getById.query({ id: deviceId });
    },
    enabled: !!deviceId,
  });

  // Load available commands from registry
  useEffect(() => {
    const registry = getBLECommandRegistry();
    const commands = registry.getAllCommands();
    setAvailableCommands(commands);
  }, []);

  // Cleanup any ongoing operations when component unmounts
  useEffect(() => {
    return () => {
      if (isCommandExecutionActiveRef.current) {
        console.log(
          "🛑 BLE Test Page: Component unmounting, cancelling ongoing operations",
        );
        isCommandExecutionActiveRef.current = false;
        stopScan();
      }
    };
  }, [stopScan]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setLogs((prev) => [...prev, logMessage]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const getDefaultParametersForCommand = (
    commandMetadata: BLECommandMetadata,
  ): Record<string, unknown> => {
    const parameters: Record<string, unknown> = {};

    // Use default values from command metadata parameters
    commandMetadata.parameters?.forEach((param) => {
      if (param.defaultValue !== undefined) {
        parameters[param.name] = param.defaultValue;
      }
    });

    // Add some specific defaults for testing
    if (commandMetadata.id === "create-event") {
      parameters.eventIndex = parameters.eventIndex ?? 0;
      parameters.eventName = parameters.eventName ?? "Test Event";
      parameters.minutesInFuture = parameters.minutesInFuture ?? 5;
      parameters.severityLevel = parameters.severityLevel ?? 2; // Important
      parameters.vibrationIntensity = parameters.vibrationIntensity ?? 1; // Medium
      parameters.ledColor = parameters.ledColor ?? 4; // Red
    }

    return parameters;
  };

  const executeCommand = async (commandMetadata: BLECommandMetadata) => {
    if (!device?.id || !device.serialNumber) {
      Alert.alert(
        "Error",
        "Device ID and serial number are required for BLE commands",
      );
      return;
    }

    // Mark command execution as active
    isCommandExecutionActiveRef.current = true;
    setIsTesting(true);
    setTestingCommand(commandMetadata.id);
    setLastResult(null);
    clearLogs();

    try {
      // Check if operation was cancelled
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!isCommandExecutionActiveRef.current) {
        console.log("🛑 Command execution cancelled before execution");
        return;
      }

      // Check Bluetooth state
      const bluetoothState = await getBluetoothState();
      if (bluetoothState !== State.PoweredOn) {
        Alert.alert(
          "Bluetooth Required",
          "Please enable Bluetooth to test commands.",
        );
        return;
      }

      addLog(`🧪 Executing BLE command: ${commandMetadata.name}`);

      // Get current connection if available
      const currentConnection = getCurrentConnection();
      if (currentConnection) {
        addLog(`🔗 Using existing connection for command execution`);
      } else {
        addLog(
          `🔄 No existing connection, will establish new connection if needed`,
        );
      }

      // Create execution context
      const context: RegistryExecutionContext = {
        deviceSerialNumber: device.serialNumber,
        connection: currentConnection, // Pass existing connection if available
        connect: () => connectBySerialNumber(device.serialNumber ?? ""),
        disconnect,
        parameters: getDefaultParametersForCommand(commandMetadata),
        options: {
          captureConsoleLogs: true,
          logLevel: "info",
        },
      };

      // Execute command via registry
      const registry = getBLECommandRegistry();
      const result = await registry.executeCommand(commandMetadata.id, context);

      // Merge command logs with our logs
      result.logs.forEach((log) => {
        const timestamp = log.timestamp.toLocaleTimeString();
        const logMessage = `[${timestamp}] ${log.message}`;
        setLogs((prev) => [...prev, logMessage]);
      });

      setLastResult(result);
      addLog(`✅ Command completed: ${result.message}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorText = `❌ ${commandMetadata.name} failed: ${errorMessage}`;

      const errorResult: BLECommandResult = {
        status: BLECommandStatus.ERROR,
        severity: BLECommandSeverity.ERROR,
        message: errorText,
        timestamp: new Date(),
        logs: [],
      };

      setLastResult(errorResult);
      addLog(errorText);

      // Try to disconnect on error
      try {
        await disconnect();
      } catch {
        addLog("❌ Error during cleanup disconnect");
      }
    } finally {
      isCommandExecutionActiveRef.current = false;
      setIsTesting(false);
      setTestingCommand("");
    }
  };

  if (deviceLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading device...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (deviceError || !device) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {deviceError?.message ?? "Device not found"}
          </Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Group commands by category
  const commandsByCategory = availableCommands.reduce(
    (acc, command) => {
      const category = command.category;
      acc[category] ??= [];
      acc[category].push(command);
      return acc;
    },
    {} as Record<string, BLECommandMetadata[]>,
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>BLE Connection Test</Text>
        <Text style={styles.subtitle}>Device: {device.title ?? "Unknown"}</Text>
        {device.serialNumber && (
          <Text style={styles.serialText}>Serial: {device.serialNumber}</Text>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {Object.entries(commandsByCategory).map(([category, commands]) => (
          <View key={category} style={styles.categorySection}>
            <Text style={styles.categoryTitle}>
              {category
                .replace("-", " ")
                .replace(/\b\w/g, (l) => l.toUpperCase())}
            </Text>

            {commands.map((command) => (
              <View key={command.id} style={styles.commandCard}>
                <View style={styles.commandHeader}>
                  <Text style={styles.commandName}>{command.name}</Text>
                  <Text style={styles.commandVersion}>v{command.version}</Text>
                </View>
                <Text style={styles.commandDescription}>
                  {command.description}
                </Text>

                <View style={styles.commandMeta}>
                  <Text style={styles.commandMetaText}>
                    Est. Duration:{" "}
                    {command.estimatedDuration
                      ? `${command.estimatedDuration}ms`
                      : "Unknown"}
                  </Text>
                  <Text style={styles.commandMetaText}>
                    Requires Connection:{" "}
                    {command.requiresConnection ? "Yes" : "No"}
                  </Text>
                </View>

                <View style={styles.commandTags}>
                  {command.tags.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>

                <Pressable
                  style={[
                    styles.testButton,
                    isTesting && styles.testButtonDisabled,
                    testingCommand === command.id && styles.testButtonActive,
                  ]}
                  onPress={() => void executeCommand(command)}
                  disabled={isTesting}
                >
                  <Text
                    style={[
                      styles.testButtonText,
                      testingCommand === command.id &&
                        styles.testButtonTextActive,
                    ]}
                  >
                    {testingCommand === command.id ? "Testing..." : "Test"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ))}

        {lastResult && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>Last Test Result:</Text>
            <View
              style={[
                styles.resultHeader,
                lastResult.severity === BLECommandSeverity.SUCCESS &&
                  styles.resultHeaderSuccess,
                lastResult.severity === BLECommandSeverity.ERROR &&
                  styles.resultHeaderError,
                lastResult.severity === BLECommandSeverity.WARNING &&
                  styles.resultHeaderWarning,
              ]}
            >
              <Text style={styles.resultStatus}>
                {lastResult.status.toUpperCase()}
              </Text>
              {lastResult.duration && (
                <Text style={styles.resultDuration}>
                  {lastResult.duration}ms
                </Text>
              )}
            </View>
            <Text style={styles.resultText}>{lastResult.message}</Text>
            {!!lastResult.data && (
              <View style={styles.resultDataContainer}>
                <Text style={styles.resultDataTitle}>Response Data:</Text>
                <Text style={styles.resultDataText}>
                  {JSON.stringify(lastResult.data, null, 2)}
                </Text>
              </View>
            )}
          </View>
        )}

        {logs.length > 0 && (
          <View style={styles.resultContainer}>
            <View style={styles.logsHeader}>
              <Text style={styles.resultTitle}>Execution Logs:</Text>
              <Pressable style={styles.clearLogsButton} onPress={clearLogs}>
                <Text style={styles.clearLogsText}>Clear</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.logsContainer}
              showsVerticalScrollIndicator={false}
            >
              {logs.map((log, index) => (
                <Text key={index} style={styles.logText}>
                  {log}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing[4],
  },
  errorText: {
    ...typography.body,
    color: colors.status.error,
    textAlign: "center",
    marginBottom: spacing[4],
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
    marginTop: spacing[2],
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing[1],
  },
  serialText: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
    fontFamily: "monospace",
  },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.gray[200],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 8,
  },
  backButtonText: {
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
  clearLogsButton: {
    alignSelf: "flex-end",
    backgroundColor: colors.gray[300],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: 6,
    marginBottom: spacing[2],
  },
  clearLogsText: {
    ...typography.bodySmall,
    color: colors.text.primary,
    fontWeight: "600",
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
  logsContainer: {
    maxHeight: 200,
    backgroundColor: colors.gray[50],
    borderRadius: 8,
    padding: spacing[2],
    marginTop: spacing[2],
  },
  logText: {
    ...typography.body,
    color: colors.text.secondary,
    fontFamily: "monospace",
    fontSize: 12,
    marginBottom: spacing[1],
  },
  categorySection: {
    marginBottom: spacing[6],
  },
  categoryTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    paddingBottom: spacing[2],
  },
  commandVersion: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontWeight: "600",
  },
  commandMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing[3],
  },
  commandMetaText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  commandTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[1],
    marginBottom: spacing[3],
  },
  tag: {
    backgroundColor: colors.primary[100],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: 12,
  },
  tagText: {
    ...typography.caption,
    color: colors.primary[700],
    fontWeight: "600",
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: 8,
    backgroundColor: colors.gray[100],
  },
  resultHeaderSuccess: {
    backgroundColor: colors.success[100],
  },
  resultHeaderError: {
    backgroundColor: colors.error[100],
  },
  resultHeaderWarning: {
    backgroundColor: colors.warning[100],
  },
  resultStatus: {
    ...typography.bodySmall,
    fontWeight: "700",
    color: colors.text.primary,
  },
  resultDuration: {
    ...typography.caption,
    color: colors.text.secondary,
    fontFamily: "monospace",
  },
  resultDataContainer: {
    marginTop: spacing[3],
    backgroundColor: colors.gray[50],
    borderRadius: 8,
    padding: spacing[3],
  },
  resultDataTitle: {
    ...typography.bodySmall,
    color: colors.text.primary,
    fontWeight: "600",
    marginBottom: spacing[2],
  },
  resultDataText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontFamily: "monospace",
  },
  logsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[2],
  },
});
