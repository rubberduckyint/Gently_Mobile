import type {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  Peripheral,
} from "react-native-ble-manager";
import React, { useCallback, useEffect, useState } from "react";
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
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";

import type { AdvertisementData } from "~/services/ble/types";
import { Header } from "~/components/ui/Header";
import {
  createGetDeviceInfoRequest,
  parseGetDeviceInfoResponse,
} from "~/services/ble/commands/getDeviceInfo";
import {
  createGetUptimeRequest,
  parseGetUptimeResponse,
} from "~/services/ble/commands/getUptime";
import {
  extractAndDecryptAdvertisementData,
  generateDynamicKey,
} from "~/services/ble/encryption";
import {
  sendCommand,
  startNotifications,
  stopNotifications,
} from "~/services/ble/manager";
import {
  FACTORY_BRACELET_KEY,
  ResponseStatus,
} from "~/services/ble/types";
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

const AddDeviceScreen = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus | null>(
    null,
  );
  const [hasScanned, setHasScanned] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState(
    new Map<Peripheral["id"], DiscoveredGentlyDevice>(),
  );

  const handleDiscoverPeripheral = useCallback(
    async (peripheral: Peripheral) => {
      // Only log and process Gently devices
      if (!peripheral.name?.includes("Gently")) {
        return;
      }

      console.log(`📱 Discovered Gently device: ${peripheral.id}`);

      try {
        const manufacturerData = peripheral.advertising.manufacturerRawData;

        const advertisementData =
          extractAndDecryptAdvertisementData(manufacturerData);

        if (!advertisementData) {
          console.warn(
            `⚠️ Could not decrypt advertisement data for device: ${peripheral.id}`,
          );
          return;
        }

        // Check if device is already paired by looking up serial number in database
        const existingDevice = await trpc.device.findBySerialNumber.query({
          serialNumber: advertisementData.serialNumber,
        });

        const discoveredDevice: DiscoveredGentlyDevice = {
          peripheral,
          advertisementData,
          isAlreadyPaired: !!existingDevice,
        };

        setDiscoveredDevices((prev) =>
          new Map(prev).set(peripheral.id, discoveredDevice),
        );

        const pairingStatus = existingDevice
          ? "already paired"
          : "available to pair";
        console.log(
          `✅ Gently device ${advertisementData.serialNumber} (${pairingStatus})`,
        );
      } catch (error) {
        console.error("❌ Error processing Gently device:", error);
      }
    },
    [],
  );

  const handleStopScan = () => {
    setIsScanning(false);
    console.log("[handleStopScan] scan is stopped.");
  };

  const handleDisconnectedPeripheral = (
    event: BleDisconnectPeripheralEvent,
  ) => {
    console.log(
      `[handleDisconnectedPeripheral][${event.peripheral}] disconnected.`,
    );
  };

  const handleUpdateValueForCharacteristic = (
    data: BleManagerDidUpdateValueForCharacteristicEvent,
  ) => {
    console.log(
      `[handleUpdateValueForCharacteristic] received data from '${data.peripheral}' with characteristic='${data.characteristic}'`,
      data.value,
    );
  };

  useEffect(() => {
    void requestBluetoothPermissions();

    BleManager.start({ showAlert: false })
      .then(() => {
        console.log("BleManager started.");
      })
      .catch((error) => {
        console.error("BleManager could not be started.", error);
      });

    const listeners = [
      BleManager.onDiscoverPeripheral(handleDiscoverPeripheral),
      BleManager.onStopScan(handleStopScan),
      BleManager.onDisconnectPeripheral(handleDisconnectedPeripheral),
      BleManager.onDidUpdateValueForCharacteristic(
        handleUpdateValueForCharacteristic,
      ),
    ];

    return () => {
      console.debug("[app] main component unmounting. Removing listeners...");
      for (const listener of listeners) {
        listener.remove();
      }
    };
  }, [handleDiscoverPeripheral]);

  const startScan = () => {
    if (!isScanning) {
      // Reset found devices before scan
      setDiscoveredDevices(new Map<Peripheral["id"], DiscoveredGentlyDevice>());
      setHasScanned(true);

      try {
        console.debug("[startScan] starting scan...");
        setIsScanning(true);
        BleManager.scan([], 5, false, {
          matchMode: BleScanMatchMode.Sticky,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
          legacy: false,
        })
          .then(() => {
            console.debug("[startScan] scan promise returned successfully.");
          })
          .catch((err) => {
            console.error("[startScan] ble scan returned in error", err);
            setIsScanning(false);
            Alert.alert(
              "Scan Error",
              "Failed to scan for devices. Please try again.",
            );
          });
      } catch (error) {
        console.error("[startScan] ble scan error thrown", error);
        setIsScanning(false);
        Alert.alert(
          "Scan Error",
          "Failed to start scanning. Please try again.",
        );
      }
    }
  };

  const connectToDevice = async (device: DiscoveredGentlyDevice) => {
    if (isConnecting || device.isAlreadyPaired) return;

    const { peripheral, advertisementData } = device;
    setIsConnecting(peripheral.id);

    try {
      console.log(`🔗 Starting pairing process for device: ${peripheral.id}`);

      // Step 1: Connect to device
      setPairingStatus({
        step: "Connecting to device...",
        progress: 10,
        isComplete: false,
      });
      console.log(`🔗 Connecting to device: ${peripheral.id}`);
      await BleManager.connect(peripheral.id);
      console.log(`✅ Connected to device: ${peripheral.id}`);

      // Request MTU of 512 for better communication performance
      try {
        await BleManager.requestMTU(peripheral.id, 512);
        console.log(`📶 MTU 512 requested for ${peripheral.id}`);
      } catch (mtuError) {
        console.warn(`⚠️ MTU request failed for ${peripheral.id}:`, mtuError);
        // Continue without MTU - this is not critical for basic functionality
      }

      // Step 2: Discover services and characteristics
      setPairingStatus({
        step: "Discovering services...",
        progress: 20,
        isComplete: false,
      });
      console.log(`🔍 Discovering services...`);
      await BleManager.retrieveServices(peripheral.id);
      console.log(`✅ Services discovered for ${peripheral.id}`);

      // Step 3: Start notifications
      setPairingStatus({
        step: "Setting up communication...",
        progress: 30,
        isComplete: false,
      });
      console.log(`🔔 Starting notifications...`);
      await startNotifications(peripheral.id);

      // Step 4: Send GetUptime command using factory key
      setPairingStatus({
        step: "Authenticating with device...",
        progress: 40,
        isComplete: false,
      });
      console.log(`⏱️ Getting device uptime...`);
      const uptimeCommand = createGetUptimeRequest();
      const uptimeResponse = await sendCommand({
        peripheralId: peripheral.id,
        command: uptimeCommand,
        encryptionKey: FACTORY_BRACELET_KEY,
        timeoutMs: 5000,
      });

      if (uptimeResponse.status !== ResponseStatus.OK) {
        throw new Error(
          `GetUptime command failed with status: ${uptimeResponse.status}`,
        );
      }

      const uptimeData = parseGetUptimeResponse(uptimeResponse.payload);
      console.log(`✅ Device uptime received: ${uptimeData.uptime}ms`);

      // Step 5: Generate custom dynamic key
      setPairingStatus({
        step: "Generating secure key...",
        progress: 60,
        isComplete: false,
      });
      console.log(`🔑 Generating custom dynamic key...`);
      const customKey = generateDynamicKey(
        FACTORY_BRACELET_KEY,
        uptimeData.uptimeBytes,
        advertisementData.serialNumber,
      );
      console.log(`✅ Custom key generated`);

      // Step 6: Send GetDeviceInfo command using custom key
      setPairingStatus({
        step: "Verifying secure connection...",
        progress: 70,
        isComplete: false,
      });
      console.log(`📱 Getting device info with custom key...`);
      const deviceInfoCommand = createGetDeviceInfoRequest();
      const deviceInfoResponse = await sendCommand({
        peripheralId: peripheral.id,
        command: deviceInfoCommand,
        encryptionKey: customKey,
        timeoutMs: 5000,
      });

      if (deviceInfoResponse.status !== ResponseStatus.OK) {
        throw new Error(
          `GetDeviceInfo command failed with status: ${deviceInfoResponse.status}`,
        );
      }

      const deviceInfo = parseGetDeviceInfoResponse(deviceInfoResponse.payload);
      console.log(`✅ Device info received:`, deviceInfo);

      // Step 7: Store custom key in secure storage
      setPairingStatus({
        step: "Storing device credentials...",
        progress: 80,
        isComplete: false,
      });
      console.log(`💾 Storing custom key in secure storage...`);
      // Sanitize device ID for SecureStore (remove colons and other invalid chars)
      const sanitizedDeviceId = peripheral.id.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageKey = `ble_device_key_${sanitizedDeviceId}`;
      await SecureStore.setItemAsync(
        storageKey,
        JSON.stringify({
          deviceId: peripheral.id,
          serialNumber: advertisementData.serialNumber,
          customEncryptionKey: customKey,
          createdAt: Date.now(),
          apiVersion: 1,
        }),
      );
      console.log(`✅ Custom key stored securely`);

      // Step 8: Create device in database
      setPairingStatus({
        step: "Registering device...",
        progress: 90,
        isComplete: false,
      });
      console.log(`💾 Creating device in database...`);
      const newDevice = await trpc.device.create.mutate({
        title: `Gently ${advertisementData.serialNumber.slice(-4)}`,
        description: `Gently Bracelet (${advertisementData.serialNumber})`,
        serialNumber: advertisementData.serialNumber,
        batteryLevel: advertisementData.batteryLevel,
        firmwareVersion: `${deviceInfo.firmwareVersionMajor}.${deviceInfo.firmwareVersionMinor}.${deviceInfo.firmwareBuildNumber}`,
      });
      console.log(`✅ Device created in database:`, newDevice);

      // Step 9: Stop notifications and disconnect (optional, device will stay connected)
      setPairingStatus({
        step: "Finalizing pairing...",
        progress: 100,
        isComplete: true,
      });
      await stopNotifications(peripheral.id);

      // Step 10: Navigate to the paired device
      console.log(`✅ Device paired successfully: ${newDevice?.title}`);
      if (newDevice?.id) {
        router.push({
          pathname: "/devices/[deviceId]",
          params: { deviceId: newDevice.id },
        });
      }
    } catch (error) {
      console.error(`❌ Pairing failed for device ${peripheral.id}:`, error);

      // Cleanup on error
      try {
        await stopNotifications(peripheral.id);
        await BleManager.disconnect(peripheral.id);
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError);
      }

      Alert.alert(
        "Pairing Failed",
        `Could not pair with ${peripheral.name}. ${error instanceof Error ? error.message : "Please try again."}`,
        [{ text: "OK" }],
      );
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
        disabled={isConnecting !== null || isAlreadyPaired}
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
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.success[500]}
            />
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
    </SafeAreaView>
  );
};

export default AddDeviceScreen;
