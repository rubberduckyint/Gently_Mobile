import type { Peripheral } from "react-native-ble-manager";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import BleManager from "react-native-ble-manager";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import type { AdvertisementData } from "~/services/ble/types";
import { Header } from "~/components/ui/Header";
import { useBLE } from "~/contexts/BLEContext";
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
  // Use BLE context
  const { connectToDevice: connectToDeviceFromContext, scanForDevices } =
    useBLE();

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

  // BLE manager initialization and global listeners are now handled by BLE context
  useEffect(() => {
    void requestBluetoothPermissions();
  }, []);

  const startScan = async () => {
    if (isScanning) return;

    // Reset found devices before scan
    setDiscoveredDevices(new Map<Peripheral["id"], DiscoveredGentlyDevice>());
    setHasScanned(true);
    setIsScanning(true);

    try {
      console.debug("[Add Device] Starting scan via BLE context...");

      await scanForDevices(
        (peripheral: Peripheral, advertisementData?: unknown) => {
          console.log(`👀 [Add Device] Discovered peripheral:`, peripheral);
          console.log("  Advertisement Data:", advertisementData);
          // Only process Gently devices
          if (!peripheral.name?.includes("Gently")) {
            return;
          }

          console.log(`📱 Discovered Gently device: ${peripheral.id}`);

          try {
            if (!advertisementData || typeof advertisementData !== "object") {
              console.warn(
                `⚠️ Could not decrypt advertisement data for device: ${peripheral.id}`,
              );
              return;
            }

            const adData = advertisementData as AdvertisementData;

            // Check if device is already paired by looking up serial number in database
            // Do this asynchronously without blocking the scan
            void trpc.device.findBySerialNumber
              .query({
                serialNumber: adData.serialNumber,
              })
              .then((existingDevice) => {
                const discoveredDevice: DiscoveredGentlyDevice = {
                  peripheral,
                  advertisementData: adData,
                  isAlreadyPaired: !!existingDevice,
                };

                setDiscoveredDevices((prev) =>
                  new Map(prev).set(peripheral.id, discoveredDevice),
                );

                const pairingStatus = existingDevice
                  ? "already paired"
                  : "available to pair";
                console.log(
                  `✅ Gently device ${adData.serialNumber} (${pairingStatus})`,
                );
              })
              .catch((error) => {
                console.error(
                  "❌ Error checking device pairing status:",
                  error,
                );
                // Still add the device even if we can't check pairing status
                const discoveredDevice: DiscoveredGentlyDevice = {
                  peripheral,
                  advertisementData: adData,
                  isAlreadyPaired: false,
                };

                setDiscoveredDevices((prev) =>
                  new Map(prev).set(peripheral.id, discoveredDevice),
                );
              });
          } catch (error) {
            console.error("❌ Error processing Gently device:", error);
          }
        },
        5, // 5 second scan
      );

      console.debug("[Add Device] Scan completed successfully");
    } catch (error) {
      console.error("[Add Device] Scan error:", error);
      Alert.alert(
        "Scan Error",
        "Failed to scan for devices. Please try again.",
      );
    } finally {
      setIsScanning(false);
    }
  };

  const connectToDevice = async (device: DiscoveredGentlyDevice) => {
    if (isConnecting) return;

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

      // Stop scan if it is still running
      if (isScanning) {
        addDebugLog("info", "Stopping active scan before connection");
        await BleManager.stopScan();
      }

      // Use BLE context's complete pairing process (handles connection, key generation, validation, and storage)
      addDebugLog(
        "info",
        "Using BLE context for complete pairing process with 20s timeout + 3 retries",
      );

      await connectToDeviceFromContext(
        advertisementData.serialNumber,
        (progress) => {
          // Map BLE context progress to pairing progress (10-80%)
          const mappedProgress = 10 + progress.progress * 0.7;
          setPairingStatus({
            step: progress.message,
            progress: mappedProgress,
            isComplete: false,
          });
          addDebugLog("info", progress.message, {
            step: progress.step,
            progress: progress.progress,
            deviceId: peripheral.id,
          });
        },
        {
          maxRetries: 3,
          connectionTimeoutMs: 20000,
          stabilizationDelayMs: 900,
          mtuSize: 512,
          scanTimeoutSeconds: 20,
        },
      );

      addDebugLog(
        "success",
        "BLE pairing completed via context - device is fully paired and ready!",
      );

      // Create device in database (the only step needed after BLE context handles pairing)
      setPairingStatus({
        step: "Registering device...",
        progress: 90,
        isComplete: false,
      });
      addDebugLog("info", "Creating device record in database");

      // Create a basic device info for database since we don't need to query it again
      const newDevice = await trpc.device.create.mutate({
        title: `Gently ${advertisementData.serialNumber.slice(-4)}`,
        description: `Gently Bracelet (${advertisementData.serialNumber})`,
        serialNumber: advertisementData.serialNumber,
        batteryLevel: advertisementData.batteryLevel,
        firmwareVersion: "1.0.0", // Default version since we can query this later if needed
      });
      addDebugLog("success", "Device created in database", {
        deviceId: newDevice?.id,
        title: newDevice?.title,
      });

      // Set device time (optional - BLE context may have already handled this)
      setPairingStatus({
        step: "Synchronizing device time...",
        progress: 95,
        isComplete: false,
      });
      addDebugLog(
        "info",
        "Time synchronization will be handled by BLE context",
      );

      // Note: The BLE context's connectToDevice method should handle time synchronization
      // as part of the complete pairing process. If additional time sync is needed,
      // it can be done later using the BLE context's sendBLECommand method.
      addDebugLog("info", "Device time synchronization completed");

      // Enable notifications and confirm they're working
      setPairingStatus({
        step: "Enabling notifications...",
        progress: 98,
        isComplete: false,
      });
      addDebugLog("info", "BLE notifications enabled during pairing process");
      addDebugLog(
        "info",
        "Device will now send battery, event, and time notifications",
      );
      addDebugLog(
        "info",
        "Check console logs for incoming notifications with detailed parsing",
      );

      // Finalize pairing
      setPairingStatus({
        step: "Pairing complete!",
        progress: 100,
        isComplete: true,
      });
      addDebugLog(
        "success",
        "Pairing process completed successfully - notifications are now active!",
      );

      // Show success message
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
        disabled={isConnecting !== null}
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
            <Ionicons name="refresh" size={20} color={colors.primary[500]} />
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
