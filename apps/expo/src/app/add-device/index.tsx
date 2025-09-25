import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { BleManager } from "@b1naryth1ef/react-native-ble-plx";
import { useMutation } from "@tanstack/react-query";

import type { DiscoveredGentlyDevice } from "~/services/ble";
import {
  ConnectingStep,
  ErrorStep,
  FoundDevicesStep,
  ScanningStep,
  SuccessStep,
} from "~/components/add-device";
import {
  connectBySerialNumber,
  requestBlePermissions,
  scanForGentlyDevices,
  stopScan as stopBLEScan,
} from "~/services/ble";
import {
  buttons,
  buttonText,
  colors,
  containers,
  flex,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";

type ConnectionStep = "scanning" | "found" | "connecting" | "success" | "error";

export default function AddDevicePage() {
  console.log("🚀 AddDevicePage: Component initializing...");

  const [step, setStep] = useState<ConnectionStep>("scanning");
  const [foundDevices, setFoundDevices] = useState<DiscoveredGentlyDevice[]>(
    [],
  );
  const [selectedDevice, setSelectedDevice] =
    useState<DiscoveredGentlyDevice | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<{
    serialNumber: string;
    firmwareVersion: string;
    batteryLevel: number;
  } | null>(null);
  const [createdDeviceId, setCreatedDeviceId] = useState<string | null>(null);

  // BLE state management
  const [bleManager, setBleManager] = useState<BleManager | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const scanStopFunctionRef = useRef<(() => void) | null>(null);

  // Keep track of found device IDs to prevent duplicates
  const foundDeviceIds = useRef(new Set<string>());
  const hasStartedInitialScan = useRef(false);

  // Initialize Bluetooth
  useEffect(() => {
    console.log("🔧 AddDevicePage: Initializing Bluetooth...");

    const initBluetooth = async () => {
      try {
        const manager = new BleManager();
        setBleManager(manager);

        await requestBlePermissions();
        setIsInitialized(true);
        console.log("✅ AddDevicePage: Bluetooth initialized successfully");
      } catch (error) {
        console.error(
          "❌ AddDevicePage: Failed to initialize Bluetooth:",
          error,
        );
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to initialize Bluetooth",
        );
        setStep("error");
      }
    };

    void initBluetooth();

    return () => {
      if (scanStopFunctionRef.current) {
        scanStopFunctionRef.current();
      }
    };
  }, []);

  const addDeviceMutation = useMutation({
    mutationFn: async (params: {
      title: string;
      description: string;
      serialNumber: string;
      firmwareVersion: string;
      batteryLevel: number;
    }) => {
      return await trpc.device.create.mutate(params);
    },
    onSuccess: (data) => {
      if (data?.id) {
        console.log(
          "✅ AddDevicePage: Device saved successfully with ID:",
          data.id,
        );
        setCreatedDeviceId(data.id);
        setStep("success");
      } else {
        console.error("❌ AddDevicePage: Device saved but no ID returned");
        setErrorMessage("Device saved but could not get device ID");
        setStep("error");
      }
    },
    onError: (error) => {
      setErrorMessage(`Failed to save device: ${error.message}`);
      setStep("error");
    },
  });

  const handleDeviceFound = useCallback((device: DiscoveredGentlyDevice) => {
    console.log(
      "📱 AddDevicePage: Device selected:",
      device.device.name,
      device.device.id,
    );

    // All devices from scanForGentlyDevices are already confirmed Gently devices
    console.log(
      "📊 AddDevicePage: Gently device data:",
      device.advertisementData,
    );

    console.log("✅ AddDevicePage: Confirmed Gently device - adding to list");

    // Check if device is in factory mode (has factory key)
    if (device.advertisementData.braceletKeyType === "factory") {
      console.log(
        "✅ AddDevicePage: Device is in factory mode (ready to pair)",
      );
    } else {
      console.log(
        "🔄 AddDevicePage: Device has custom key (can re-pair with new key)",
      );
    }

    if (!foundDeviceIds.current.has(device.device.id)) {
      console.log("✅ AddDevicePage: Adding new device to list");
      foundDeviceIds.current.add(device.device.id);
      setFoundDevices((prev) => [...prev, device]);
    } else {
      console.log("🔄 AddDevicePage: Device already in list, skipping");
    }
  }, []);

  const startScan = useCallback(async () => {
    console.log("🔍 AddDevicePage: startScan called");

    if (!bleManager) {
      console.log("❌ AddDevicePage: BLE manager not initialized");
      setErrorMessage("Bluetooth not initialized");
      setStep("error");
      return;
    }

    try {
      console.log(
        "🔍 AddDevicePage: Checking initialization status:",
        isInitialized,
      );
      if (!isInitialized) {
        const errorMsg =
          "Bluetooth is still initializing. Please wait a moment and try again.";
        console.log("❌ AddDevicePage: Bluetooth not ready:", errorMsg);
        setErrorMessage(errorMsg);
        setStep("error");
        return;
      }

      console.log("🔍 AddDevicePage: Setting up scan...");
      setStep("scanning");
      setFoundDevices([]);
      foundDeviceIds.current.clear();
      setErrorMessage("");

      console.log("🔍 AddDevicePage: Calling scanForGentlyDevices...");

      try {
        const devices = await scanForGentlyDevices({
          timeoutMs: 10000,
          allowDuplicates: false,
        });

        console.log("✅ AddDevicePage: Scan completed");
        console.log("📊 AddDevicePage: Found devices:", devices.length);

        // Process found devices
        devices.forEach((device) => {
          handleDeviceFound(device);
        });

        setStep("found");
      } catch (error) {
        console.error("❌ AddDevicePage: Scan error:", error);
        setErrorMessage(error instanceof Error ? error.message : "Scan failed");
        setStep("error");
      }
      console.log("✅ AddDevicePage: Scan started");
    } catch (error) {
      console.error("❌ AddDevicePage: Scan failed:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to scan for devices",
      );
      setStep("error");
    }
  }, [bleManager, handleDeviceFound, isInitialized]);

  const stopScan = useCallback(() => {
    console.log("🛑 AddDevicePage: Stopping scan...");
    stopBLEScan(); // Use the imported stopScan function
    if (scanStopFunctionRef.current) {
      scanStopFunctionRef.current();
      scanStopFunctionRef.current = null;
    }
  }, []);

  const handleDeviceSelect = async (device: DiscoveredGentlyDevice) => {
    console.log(
      "🔗 AddDevicePage: Starting connection process for device:",
      device.device.name,
    );

    if (!bleManager) {
      console.log("❌ AddDevicePage: BLE manager not initialized");
      setErrorMessage("Bluetooth not initialized");
      setStep("error");
      return;
    }

    // Stop scanning immediately to prevent interference with pairing
    console.log("🛑 AddDevicePage: Stopping scan before pairing...");
    stopScan();

    setSelectedDevice(device);
    setStep("connecting");

    try {
      console.log("🔗 AddDevicePage: Initiating GENTLY PAIRING process...");

      const deviceInfo = await connectBySerialNumber(
        device.advertisementData.serialNumber,
      );

      console.log("✅ AddDevicePage: GENTLY PAIRING completed successfully");

      // Extract device info and continue with existing flow
      if (!deviceInfo.device || !deviceInfo.isConnected) {
        throw new Error("Connection failed - device not available");
      }

      console.log("🔑 AddDevicePage: Connection established with device key");

      // Create device info for registration using the REAL data
      const info = {
        serialNumber: deviceInfo.serialNumber,
        firmwareVersion:
          deviceInfo.firmwareVersionMajor &&
          deviceInfo.firmwareVersionMinor &&
          deviceInfo.firmwareBuildNumber
            ? `${deviceInfo.firmwareVersionMajor}.${deviceInfo.firmwareVersionMinor}.${deviceInfo.firmwareBuildNumber}`
            : "Unknown",
        batteryLevel: device.advertisementData.batteryLevel, // Use from advertisement data
      };

      setDeviceInfo(info);

      // Automatically save the device after successful connection
      console.log(
        "💾 AddDevicePage: Automatically saving device after successful connection",
      );
      console.log(
        `💾 AddDevicePage: Using REAL serial number from advertisement data: ${deviceInfo.serialNumber}`,
      );

      const deviceTitle = device.device.name ?? "Unknown Device";
      const deviceDescription = `Bluetooth device (${device.device.id.slice(-6)})`;

      addDeviceMutation.mutate({
        title: deviceTitle,
        description: deviceDescription,
        serialNumber: info.serialNumber, // This will now be the real serial number from advertisement data
        firmwareVersion: info.firmwareVersion,
        batteryLevel: info.batteryLevel,
      });
    } catch (error) {
      console.error("❌ AddDevicePage: GENTLY PAIRING failed:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to connect to device",
      );
      setStep("error");
    }
  };

  const handleRetry = () => {
    console.log("🔄 AddDevicePage: handleRetry called");
    console.log("🔄 AddDevicePage: Current isInitialized:", isInitialized);

    setErrorMessage("");

    // Reset scan flag to allow new scan
    hasStartedInitialScan.current = false;

    // Clear found devices for fresh scan
    foundDeviceIds.current.clear();
    setFoundDevices([]);

    if (isInitialized) {
      console.log(
        "✅ AddDevicePage: Bluetooth is ready, starting scan directly",
      );
      setStep("scanning");
      void startScan();
    } else {
      console.log(
        "⏳ AddDevicePage: Bluetooth not ready, setting to scanning and waiting",
      );
      // Set to scanning state and let the useEffect handle initialization
      setStep("scanning");
    }
  };

  const handleBack = () => {
    router.back();
  };

  // Initialize scanning when component mounts and Bluetooth is ready
  useEffect(() => {
    console.log("📱 AddDevicePage: Initialization useEffect triggered");
    console.log("📱 AddDevicePage: isInitialized:", isInitialized);
    console.log("📱 AddDevicePage: current step:", step);

    // Only start scan if we're in scanning step and bluetooth is ready
    if (
      isInitialized &&
      step === "scanning" &&
      !hasStartedInitialScan.current
    ) {
      console.log(
        "✅ AddDevicePage: Bluetooth is initialized and step is scanning, starting scan...",
      );
      hasStartedInitialScan.current = true;
      void startScan();
    } else {
      console.log(
        "⏳ AddDevicePage: Waiting for conditions or not in scanning step",
      );
    }
  }, [isInitialized, step, startScan]);

  // Cleanup effect that runs on unmount
  useEffect(() => {
    return () => {
      console.log("🧹 AddDevicePage: Cleaning up and stopping scan...");
      stopScan();
    };
  }, [stopScan]);

  const renderStep = () => {
    switch (step) {
      case "scanning":
        return (
          <ScanningStep isInitialized={isInitialized} onCancel={handleBack} />
        );
      case "found":
        return (
          <FoundDevicesStep
            devices={foundDevices}
            onDeviceSelect={handleDeviceSelect}
            onRetry={handleRetry}
            onCancel={handleBack}
          />
        );
      case "connecting":
        return (
          <ConnectingStep
            deviceName={selectedDevice?.device.name ?? undefined}
            isSaving={addDeviceMutation.isPending}
          />
        );
      case "success":
        return (
          <SuccessStep
            deviceName={selectedDevice?.device.name ?? undefined}
            deviceInfo={deviceInfo ?? undefined}
            onViewDevice={() => {
              if (createdDeviceId) {
                router.replace(`/devices/${createdDeviceId}`);
              } else {
                router.replace("/dashboard");
              }
            }}
          />
        );
      case "error":
        return (
          <ErrorStep
            errorMessage={errorMessage}
            onRetry={handleRetry}
            onCancel={handleBack}
          />
        );
      default:
        return (
          <ScanningStep isInitialized={isInitialized} onCancel={handleBack} />
        );
    }
  };

  return (
    <SafeAreaView style={containers.safeArea}>
      {/* Header */}
      <View
        style={[
          flex.row,
          flex.itemsCenter,
          flex.justifyBetween,
          {
            paddingHorizontal: spacing[6],
            paddingVertical: spacing[4],
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
          },
        ]}
      >
        <View style={[flex.row, flex.itemsCenter]}>
          <Pressable
            style={[buttons.base, buttons.small, { marginRight: spacing[3] }]}
            onPress={handleBack}
          >
            <Text style={[buttonText.primary, buttonText.small]}>← Back</Text>
          </Pressable>
          <View>
            <Text style={typography.h3}>Add New Device</Text>
            <Text
              style={[typography.bodySmall, { color: colors.text.secondary }]}
            >
              Scan and connect to your Gently device
            </Text>
          </View>
        </View>
      </View>
      {renderStep()}
    </SafeAreaView>
  );
}
