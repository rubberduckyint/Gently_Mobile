import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import type { BluetoothDevice, DeviceInfo } from "~/services/bluetooth";
import {
  ConnectingStep,
  ErrorStep,
  FoundDevicesStep,
  ScanningStep,
  SuccessStep,
} from "~/components/add-device";
import { useBluetooth } from "~/services/bluetooth";
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
  const [foundDevices, setFoundDevices] = useState<BluetoothDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<{
    serialNumber: string;
    firmwareVersion: string;
    batteryLevel: number;
  } | null>(null);
  const [createdDeviceId, setCreatedDeviceId] = useState<string | null>(null);

  // Keep track of found device IDs to prevent duplicates
  const foundDeviceIds = useRef(new Set<string>());
  const hasStartedInitialScan = useRef(false);

  console.log("🔧 AddDevicePage: Setting up useBluetooth hook...");
  const {
    startScan: bluetoothStartScan,
    stopScan,
    connect,
    disconnect,
    connectedDevice,
    isInitialized,
    lastError: bluetoothError,
  } = useBluetooth();

  console.log("📊 HOOK RESULT: useBluetooth returned values:");
  console.log("📊   - isInitialized:", isInitialized);
  console.log("📊   - bluetoothError:", bluetoothError);
  console.log("📊   - connectedDevice:", connectedDevice);
  console.log("📊   - startScan function:", !!bluetoothStartScan);
  console.log("📊   - stopScan function:", !!stopScan);
  console.log("📊   - connect function:", !!connect);

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

  const handleDeviceFound = useCallback((device: BluetoothDevice) => {
    console.log(
      "📱 AddDevicePage: Device found:",
      device.name,
      device.id,
      "RSSI:",
      device.rssi,
    );

    // Check if this is a Gently device
    if (device.manufacturerData) {
      console.log(
        "📊 AddDevicePage: Manufacturer data available:",
        device.manufacturerData,
      );

      if (device.manufacturerData.isGentlyDevice) {
        console.log(
          "✅ AddDevicePage: Confirmed Gently device - adding to list",
        );

        if (device.manufacturerData.isFactoryMode === true) {
          console.log(
            "✅ AddDevicePage: Device is in factory mode (ready to pair)",
          );
        } else if (device.manufacturerData.isFactoryMode === false) {
          console.log(
            "⚠️ AddDevicePage: Device is already paired (will show but disable connect)",
          );
        } else {
          console.log(
            "❓ AddDevicePage: Could not determine factory mode status",
          );
        }
      } else {
        console.log("❌ AddDevicePage: Not a Gently device - skipping");
        return;
      }
    } else {
      console.log(
        "⚠️ AddDevicePage: No manufacturer data available - adding anyway (legacy support)",
      );
    }

    if (!foundDeviceIds.current.has(device.id)) {
      console.log("✅ AddDevicePage: Adding new device to list");
      foundDeviceIds.current.add(device.id);
      setFoundDevices((prev) => [...prev, device]);
    } else {
      console.log("🔄 AddDevicePage: Device already in list, skipping");
    }
  }, []);

  const startScan = useCallback(() => {
    console.log("🔍 AddDevicePage: startScan called");

    try {
      // Check if Bluetooth is initialized
      console.log(
        "🔍 AddDevicePage: Checking initialization status:",
        isInitialized,
      );
      if (!isInitialized) {
        const errorMsg =
          bluetoothError ??
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

      console.log("🔍 AddDevicePage: Calling bluetoothStartScan...");
      bluetoothStartScan(handleDeviceFound, { timeout: 10000 });

      console.log("✅ AddDevicePage: Scan started");

      // Set a timeout to move to found step
      setTimeout(() => {
        console.log("⏰ AddDevicePage: Scan timeout reached");
        console.log(
          "📊 AddDevicePage: Found device IDs:",
          Array.from(foundDeviceIds.current),
        );
        console.log(
          "📊 AddDevicePage: Found devices count:",
          foundDeviceIds.current.size,
        );
        setStep("found");
      }, 10000);
    } catch (error) {
      console.error("❌ AddDevicePage: Scan failed:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to scan for devices",
      );
      setStep("error");
    }
  }, [bluetoothStartScan, handleDeviceFound, isInitialized, bluetoothError]);

  const handleDeviceSelect = async (device: BluetoothDevice) => {
    console.log(
      "🔗 AddDevicePage: Starting connection process for device:",
      device.name,
    );

    // Stop scanning immediately to prevent interference with pairing
    console.log("🛑 AddDevicePage: Stopping scan before pairing...");
    stopScan();

    setSelectedDevice(device);
    setStep("connecting");

    try {
      console.log("🔗 AddDevicePage: Initiating GENTLY PAIRING process...");
      const connectionResult = await connect(device.id);

      console.log("✅ AddDevicePage: GENTLY PAIRING completed successfully");

      // Convert protocol device info to our DeviceInfo format
      const info: DeviceInfo = {
        serialNumber: `GNT-${connectionResult.deviceInfo.hardwareVersion}-${connectionResult.deviceInfo.firmwareBuildNumber}`,
        firmwareVersion: `${connectionResult.deviceInfo.firmwareVersionMajor}.${connectionResult.deviceInfo.firmwareVersionMinor}.${connectionResult.deviceInfo.firmwareBuildNumber}`,
        batteryLevel: 85, // Mock battery level - would need separate battery status command
      };
      setDeviceInfo(info);

      // Automatically save the device after successful connection
      console.log(
        "💾 AddDevicePage: Automatically saving device after successful connection",
      );
      const deviceTitle = device.name || "Unknown Device";
      const deviceDescription = `Bluetooth device (${device.id.slice(-6)})`;

      addDeviceMutation.mutate({
        title: deviceTitle,
        description: deviceDescription,
        serialNumber: info.serialNumber,
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
    console.log("🔄 AddDevicePage: Current bluetoothError:", bluetoothError);

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
    console.log("📱 AddDevicePage: bluetoothError:", bluetoothError);
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
    } else if (bluetoothError && step === "scanning") {
      console.log(
        "❌ AddDevicePage: Bluetooth error detected:",
        bluetoothError,
      );
      setErrorMessage(bluetoothError);
      setStep("error");
    } else {
      console.log(
        "⏳ AddDevicePage: Waiting for conditions or not in scanning step",
      );
    }
  }, [isInitialized, bluetoothError, step, startScan]);

  // Cleanup effect that runs on unmount
  useEffect(() => {
    return () => {
      console.log("🧹 AddDevicePage: Cleaning up...");
      stopScan();
      if (connectedDevice) {
        void disconnect();
      }
    };
  }, [stopScan, connectedDevice, disconnect]);

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
            deviceName={selectedDevice?.name}
            isSaving={addDeviceMutation.isPending}
          />
        );
      case "success":
        return (
          <SuccessStep
            deviceName={selectedDevice?.name}
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
