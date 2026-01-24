import type { Peripheral } from "react-native-ble-manager";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import BleManager from "react-native-ble-manager";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import type { AdvertisementData } from "~/services/ble/types";
import { Header } from "~/components/ui/Header";
import { useBLE } from "~/contexts/BLEContext";
import { useResponsive } from "~/hooks/useResponsive";
import {
  trackDevicePairingError,
  trackDevicePairingStarted,
  trackDevicePairingSuccess,
  trackDeviceScanCompleted,
  trackDeviceScanStarted,
} from "~/services/analytics";
import {
  buttons,
  buttonText,
  cards,
  colors,
  containers,
  emptyStates,
  inputs,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { getSimulatedDeviceData, isTestUserSession } from "~/utils/testMode";

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

const AddDeviceScreen = () => {
  // Use BLE context
  const { connectToPeripheral, scanForDevices, disconnectDevice } = useBLE();

  // Get session to check for test user
  const { data: session } = authClient.useSession();
  const isTestUser = isTestUserSession(session?.user?.email);

  // Responsive design hook
  const { getIconSize, getSpacing } = useResponsive();

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

  // Test mode state
  const [isSimulatingPairing, setIsSimulatingPairing] = useState(false);

  // Form state for naming the device
  const [deviceName, setDeviceName] = useState("");
  const [isUpdatingDevice, setIsUpdatingDevice] = useState(false);

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Cleanup effect - runs when component unmounts
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      console.log(
        "🧹 [Add Device] Component unmounting, cleaning up BLE operations...",
      );

      // Stop any ongoing scan
      BleManager.stopScan()
        .then(() => {
          console.log("✅ [Add Device] Scan stopped successfully");
        })
        .catch((error) => {
          console.log("ℹ️ [Add Device] No scan to stop:", error);
        });

      // If currently connecting, disconnect
      if (isConnecting) {
        console.log(
          `🔌 [Add Device] Disconnecting from device: ${isConnecting}`,
        );
        disconnectDevice()
          .then(() => {
            console.log("✅ [Add Device] Device disconnected successfully");
          })
          .catch((error) => {
            console.warn("⚠️ [Add Device] Error disconnecting:", error);
          });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount

  const startScan = async () => {
    if (isScanning) return;

    // Reset found devices before scan
    setDiscoveredDevices(new Map<Peripheral["id"], DiscoveredGentlyDevice>());
    setHasScanned(true);
    setIsScanning(true);
    trackDeviceScanStarted();

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
                if (!isMountedRef.current) return; // Don't update state if unmounted

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
      if (isMountedRef.current) {
        Alert.alert(
          "Scan Error",
          "Failed to scan for devices. Please try again.",
        );
      }
    } finally {
      if (isMountedRef.current) {
        // Track scan completed with device count
        trackDeviceScanCompleted(discoveredDevices.size);
        setIsScanning(false);
      }
    }
  };

  const connectToDevice = async (device: DiscoveredGentlyDevice) => {
    if (isConnecting) return;

    const { peripheral, advertisementData } = device;
    setIsConnecting(peripheral.id);
    trackDevicePairingStarted(advertisementData.serialNumber);

    try {
      // Start with connection step
      setPairingStatus({
        step: "Connecting to device...",
        progress: 10,
        isComplete: false,
      });

      // Use BLE context's connectToPeripheral to skip scanning
      // since we already have the peripheral from the scan
      await connectToPeripheral(
        peripheral,
        advertisementData.serialNumber,
        (progress) => {
          // Map BLE context progress to pairing progress (10-80%)
          const mappedProgress = 10 + progress.progress * 0.7;
          setPairingStatus({
            step: progress.message,
            progress: mappedProgress,
            isComplete: false,
          });
        },
        {
          maxRetries: 3,
          connectionTimeoutMs: 60000, // 60 seconds per attempt
          stabilizationDelayMs: 900,
          mtuSize: 512,
          scanTimeoutSeconds: 30,
        },
      );

      // Create device in database
      setPairingStatus({
        step: "Registering device...",
        progress: 90,
        isComplete: false,
      });

      const newDevice = await trpc.device.create.mutate({
        title: "My Gently",
        description: "",
        serialNumber: advertisementData.serialNumber,
        batteryLevel: advertisementData.batteryLevel,
        firmwareVersion: "1.0.0",
      });

      // Finalize pairing
      setPairingStatus({
        step: "Pairing complete!",
        progress: 100,
        isComplete: true,
      });

      // Show success message
      if (newDevice?.id) {
        // Set default device name for the form
        setDeviceName("My Gently");

        trackDevicePairingSuccess(newDevice.title);
        setPairingSuccess({
          deviceName: newDevice.title,
          deviceId: newDevice.id,
          serialNumber: advertisementData.serialNumber,
        });
      }
    } catch (error) {
      console.error("❌ Device pairing failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      trackDevicePairingError(errorMessage);

      // Cleanup on error
      try {
        await disconnectDevice();
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError);
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
          `Unable to connect to ${peripheral.name}. Please ensure the device is in pairing mode by holding the button for 10 seconds until it beeps, then try again.`,
          [
            {
              text: "Try Again",
              onPress: () => {
                setDiscoveredDevices(new Map());
                setHasScanned(false);
                setIsScanning(false);
              },
            },
            { text: "OK" },
          ],
        );
      } else {
        Alert.alert(
          "Pairing Failed",
          `Could not pair with ${peripheral.name}. ${errorMessage}`,
          [{ text: "OK" }],
        );
      }
    } finally {
      setIsConnecting(null);
      setPairingStatus(null);
    }
  };

  /**
   * Simulated device pairing for Apple App Review test users.
   * Creates a mock device without requiring actual BLE hardware.
   */
  const simulateDevicePairing = async () => {
    if (isSimulatingPairing) return;

    setIsSimulatingPairing(true);
    const simulatedDevice = getSimulatedDeviceData();
    trackDevicePairingStarted(simulatedDevice.serialNumber);

    try {
      // Simulate connection progress
      setPairingStatus({
        step: "Connecting to simulated device...",
        progress: 10,
        isComplete: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 800));

      setPairingStatus({
        step: "Authenticating device...",
        progress: 30,
        isComplete: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 600));

      setPairingStatus({
        step: "Synchronizing time...",
        progress: 50,
        isComplete: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      setPairingStatus({
        step: "Configuring device settings...",
        progress: 70,
        isComplete: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if a test device already exists for this user
      const existingDevice = await trpc.device.findBySerialNumber.query({
        serialNumber: simulatedDevice.serialNumber,
      });

      if (existingDevice) {
        console.log(
          "🧪 [Test Mode] Test device already exists, using existing device",
        );
        setPairingStatus({
          step: "Device already paired!",
          progress: 100,
          isComplete: true,
        });

        setDeviceName(existingDevice.title);
        trackDevicePairingSuccess(existingDevice.title);
        setPairingSuccess({
          deviceName: existingDevice.title,
          deviceId: existingDevice.id,
          serialNumber: simulatedDevice.serialNumber,
        });
        return;
      }

      setPairingStatus({
        step: "Registering device...",
        progress: 90,
        isComplete: false,
      });

      // Create the simulated device in the database
      const newDevice = await trpc.device.create.mutate({
        title: simulatedDevice.name,
        description: "Simulated test device for Apple App Review",
        serialNumber: simulatedDevice.serialNumber,
        batteryLevel: simulatedDevice.batteryLevel,
        firmwareVersion: simulatedDevice.firmwareVersion,
      });

      setPairingStatus({
        step: "Pairing complete!",
        progress: 100,
        isComplete: true,
      });

      if (newDevice?.id) {
        setDeviceName(simulatedDevice.name);
        trackDevicePairingSuccess(newDevice.title);
        setPairingSuccess({
          deviceName: newDevice.title,
          deviceId: newDevice.id,
          serialNumber: simulatedDevice.serialNumber,
        });
        console.log(
          "🧪 [Test Mode] Simulated device created successfully:",
          newDevice.id,
        );
      }
    } catch (error) {
      console.error("🧪 [Test Mode] Simulated pairing failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      trackDevicePairingError(errorMessage);

      Alert.alert(
        "Simulated Pairing Failed",
        `Could not create test device. ${errorMessage}`,
        [{ text: "OK" }],
      );
    } finally {
      setIsSimulatingPairing(false);
      setPairingStatus(null);
    }
  };

  const renderDeviceCard = (device: DiscoveredGentlyDevice) => {
    const { peripheral, advertisementData, isAlreadyPaired } = device;
    const isCurrentlyConnecting = isConnecting === peripheral.id;

    // Responsive sizes
    const avatarSize = getIconSize(48);
    const iconSize = getIconSize(24);
    const chevronSize = getIconSize(20);
    const cardSpacing = getSpacing(spacing[3]);

    // Disable clicking while scanning or connecting
    const isDisabled = isScanning || isConnecting !== null;

    return (
      <Pressable
        key={peripheral.id}
        style={[
          cards.base,
          {
            marginBottom: cardSpacing,
            opacity: isDisabled ? 0.5 : 1,
            borderLeftWidth: isAlreadyPaired ? 4 : 0,
            borderLeftColor: isAlreadyPaired
              ? colors.success[500]
              : "transparent",
          },
        ]}
        onPress={() => connectToDevice(device)}
        disabled={isDisabled}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}
        >
          <View
            style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              backgroundColor: isAlreadyPaired
                ? colors.success[100]
                : colors.primary[100],
              alignItems: "center",
              justifyContent: "center",
              marginRight: cardSpacing,
              flexShrink: 0,
            }}
          >
            <Ionicons
              name={isAlreadyPaired ? "checkmark-circle" : "watch"}
              size={iconSize}
              color={
                isAlreadyPaired ? colors.success[600] : colors.primary[600]
              }
            />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing[1],
                flexWrap: "wrap",
              }}
            >
              <Text
                style={[typography.subtitle, { color: colors.text.primary }]}
                numberOfLines={1}
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
              numberOfLines={1}
            >
              Serial: {advertisementData.serialNumber}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: spacing[1],
                flexWrap: "wrap",
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
                  size={getIconSize(12)}
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
              name="refresh"
              size={chevronSize}
              color={colors.primary[500]}
            />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={chevronSize}
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
              paddingVertical: spacing[8],
              paddingHorizontal: spacing[4],
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
                  height: 8,
                  backgroundColor: colors.gray[200],
                  borderRadius: 4,
                  marginBottom: spacing[2],
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${pairingStatus.progress}%`,
                    height: "100%",
                    backgroundColor: pairingStatus.isComplete
                      ? colors.success[500]
                      : colors.primary[500],
                    borderRadius: 4,
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
    const emptyStateIconSize = getIconSize(48);

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
            <Ionicons
              name="search"
              size={emptyStateIconSize}
              color={colors.text.tertiary}
            />
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
            Hold the button on your device for 10 seconds until it beeps
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
            <Ionicons
              name="search"
              size={emptyStateIconSize}
              color={colors.text.tertiary}
            />
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
            Hold the button on your device for 10 seconds until it beeps and try
            scanning again
          </Text>
        </View>
      );
    }

    return null;
  };

  // Responsive sizing for the main UI elements
  const headerIconContainerSize = getIconSize(80);
  const headerIconSize = getIconSize(40);
  const scanIconSize = getIconSize(20);

  return (
    <SafeAreaView style={containers.safeArea}>
      <Header title="Add a Gently" />

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
            paddingHorizontal: spacing[4],
          }}
        >
          <View
            style={{
              width: headerIconContainerSize,
              height: headerIconContainerSize,
              borderRadius: headerIconContainerSize / 2,
              backgroundColor: colors.primary[100],
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing[4],
            }}
          >
            <Ionicons
              name="bluetooth"
              size={headerIconSize}
              color={colors.primary[600]}
            />
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
            Make sure your Gently device is ready to pair and within range. Hold
            the button for ten seconds until it beeps to enter pairing mode.
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
                size={scanIconSize}
                color={colors.text.inverse}
                style={{ marginRight: spacing[2] }}
              />
            )}
            <Text style={[buttonText.primary, buttonText.large]}>
              {isScanning ? "Scanning..." : "Scan Now"}
            </Text>
          </View>
        </Pressable>

        {/* Test Mode Section - Only visible for Apple App Review test users */}
        {isTestUser && (
          <View
            style={{
              marginBottom: spacing[6],
              padding: spacing[4],
              backgroundColor: colors.warning[50],
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.warning[200],
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: spacing[3],
              }}
            >
              <Ionicons
                name="flask"
                size={getIconSize(20)}
                color={colors.warning[600]}
                style={{ marginRight: spacing[2] }}
              />
              <Text
                style={[typography.subtitle, { color: colors.warning[700] }]}
              >
                Test Mode
              </Text>
            </View>
            <Text
              style={[
                typography.body,
                {
                  color: colors.warning[700],
                  marginBottom: spacing[4],
                  lineHeight: 20,
                },
              ]}
            >
              You are signed in as a test user. You can simulate pairing a
              Gently device without physical hardware.
            </Text>
            <Pressable
              style={[
                buttons.base,
                buttons.large,
                {
                  backgroundColor: colors.warning[500],
                  opacity: isSimulatingPairing ? 0.7 : 1,
                },
              ]}
              onPress={simulateDevicePairing}
              disabled={isSimulatingPairing}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isSimulatingPairing ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.text.inverse}
                    style={{ marginRight: spacing[2] }}
                  />
                ) : (
                  <Ionicons
                    name="hardware-chip"
                    size={scanIconSize}
                    color={colors.text.inverse}
                    style={{ marginRight: spacing[2] }}
                  />
                )}
                <Text style={[buttonText.primary, buttonText.large]}>
                  {isSimulatingPairing
                    ? "Simulating..."
                    : "Simulate Device Pairing"}
                </Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* Simulated Pairing Progress Overlay */}
        {isSimulatingPairing && pairingStatus && (
          <View
            style={[
              cards.base,
              {
                marginBottom: spacing[6],
                padding: spacing[5],
                alignItems: "center",
              },
            ]}
          >
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
            <View
              style={{
                width: "100%",
                height: 8,
                backgroundColor: colors.gray[200],
                borderRadius: 4,
                marginBottom: spacing[2],
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${pairingStatus.progress}%`,
                  height: "100%",
                  backgroundColor: pairingStatus.isComplete
                    ? colors.success[500]
                    : colors.primary[500],
                  borderRadius: 4,
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
          </View>
        )}

        {/* Device List */}
        {Array.from(discoveredDevices.values()).length > 0 ? (
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: spacing[3],
              }}
            >
              <Text
                style={[typography.subtitle, { color: colors.text.primary }]}
              >
                Found Devices
              </Text>
            </View>
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
            padding: spacing[4],
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
                maxHeight: "90%",
              },
            ]}
          >
            <ScrollView
              style={{ width: "100%" }}
              contentContainerStyle={{
                alignItems: "center",
              }}
              showsVerticalScrollIndicator={false}
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
                Gently Paired Successfully!
              </Text>

              <Text
                style={[
                  typography.body,
                  {
                    color: colors.text.secondary,
                    textAlign: "center",
                    marginBottom: spacing[6],
                  },
                ]}
              >
                Give your Gently a name to make it easier to identify.
              </Text>

              {/* Device Name Input */}
              <View style={{ width: "100%", marginBottom: spacing[6] }}>
                <Text
                  style={[
                    typography.label,
                    { color: colors.text.primary, marginBottom: spacing[2] },
                  ]}
                >
                  Name *
                </Text>
                <TextInput
                  style={[inputs.base]}
                  placeholder="e.g., Mom's Gently"
                  placeholderTextColor={colors.text.tertiary}
                  value={deviceName}
                  onChangeText={setDeviceName}
                  autoCapitalize="words"
                  returnKeyType="done"
                  maxLength={50}
                />
              </View>

              {/* Serial Number Display */}
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
                  style={[
                    buttons.primary,
                    buttons.large,
                    { alignItems: "center", justifyContent: "center" },
                    (!deviceName.trim() || isUpdatingDevice) && {
                      opacity: 0.5,
                    },
                  ]}
                  onPress={async () => {
                    if (!deviceName.trim() || isUpdatingDevice) return;

                    setIsUpdatingDevice(true);
                    try {
                      // Update the device with the user-provided name
                      await trpc.device.update.mutate({
                        id: pairingSuccess.deviceId,
                        title: deviceName.trim(),
                      });

                      console.log(
                        `✅ [Pairing] Device updated, navigating to: ${pairingSuccess.deviceId}`,
                      );

                      // Navigate to device page
                      router.push({
                        pathname: "/devices/[deviceId]",
                        params: { deviceId: pairingSuccess.deviceId },
                      });
                    } catch (error) {
                      console.error("Failed to update device:", error);
                      Alert.alert(
                        "Update Failed",
                        "Failed to save device name. Please try again.",
                      );
                      setIsUpdatingDevice(false);
                    }
                  }}
                  disabled={!deviceName.trim() || isUpdatingDevice}
                >
                  {isUpdatingDevice ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.text.inverse}
                    />
                  ) : (
                    <Text style={[buttonText.primary, buttonText.large]}>
                      Continue
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default AddDeviceScreen;
