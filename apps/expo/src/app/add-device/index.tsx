import type { Peripheral } from "react-native-ble-manager";
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
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import type { AdvertisementData } from "~/services/ble/types";
import { Header } from "~/components/ui/Header";
import { useBLE } from "~/contexts/BLEContext";
import { useResponsive } from "~/hooks/useResponsive";
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

const AddDeviceScreen = () => {
  // Use BLE context
  const { connectToPeripheral, scanForDevices, disconnectDevice } = useBLE();

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
          connectionTimeoutMs: 30000, // 30 seconds per attempt
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
        title: `Gently ${advertisementData.serialNumber.slice(-4)}`,
        description: `Gently Bracelet (${advertisementData.serialNumber})`,
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
        setPairingSuccess({
          deviceName: newDevice.title,
          deviceId: newDevice.id,
          serialNumber: advertisementData.serialNumber,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

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

  const renderDeviceCard = (device: DiscoveredGentlyDevice) => {
    const { peripheral, advertisementData, isAlreadyPaired } = device;
    const isCurrentlyConnecting = isConnecting === peripheral.id;

    // Responsive sizes
    const avatarSize = getIconSize(48);
    const iconSize = getIconSize(24);
    const chevronSize = getIconSize(20);
    const cardSpacing = getSpacing(spacing[3]);

    return (
      <Pressable
        key={peripheral.id}
        style={[
          cards.base,
          {
            marginBottom: cardSpacing,
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
              Gently Paired Successfully!
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
                style={[
                  buttons.primary,
                  buttons.large,
                  { alignItems: "center", justifyContent: "center" },
                ]}
                onPress={() => {
                  console.log(
                    `🔗 [Pairing] Navigating to device: ${pairingSuccess.deviceId}`,
                  );
                  router.push({
                    pathname: "/devices/[deviceId]",
                    params: { deviceId: pairingSuccess.deviceId },
                  });
                }}
              >
                <Text style={[buttonText.primary, buttonText.large]}>
                  Go to Gently
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default AddDeviceScreen;
