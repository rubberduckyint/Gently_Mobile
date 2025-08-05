import React, { useState, useEffect, useRef } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useMutation } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import { bluetoothService, BluetoothDevice } from "~/services/BluetoothService";

type ConnectionStep = "scanning" | "found" | "connecting" | "connected" | "error";

interface AddDeviceModalProps {
  visible: boolean;
  onClose: () => void;
  onDeviceAdded: () => void;
}

export function AddDeviceModal({ visible, onClose, onDeviceAdded }: AddDeviceModalProps) {
  const [step, setStep] = useState<ConnectionStep>("scanning");
  const [foundDevices, setFoundDevices] = useState<BluetoothDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<{
    serialNumber: string;
    firmwareVersion: string;
    batteryLevel: number;
  } | null>(null);

  // Keep track of found device IDs to prevent duplicates
  const foundDeviceIds = useRef(new Set<string>());

  const createDeviceMutation = useMutation({
    mutationFn: async (deviceData: { 
      title: string; 
      description: string;
      serialNumber?: string;
      firmwareVersion?: string;
      batteryLevel?: number;
    }) => {
      return await trpc.device.create.mutate(deviceData);
    },
    onSuccess: () => {
      setStep("connected");
      setTimeout(() => {
        handleClose();
        onDeviceAdded();
      }, 2000);
    },
    onError: (error) => {
      setStep("error");
      setErrorMessage(error.message || "Failed to create device");
    },
  });

  const resetState = () => {
    setStep("scanning");
    setFoundDevices([]);
    setSelectedDevice(null);
    setIsScanning(false);
    setIsConnecting(false);
    setErrorMessage("");
    setDeviceInfo(null);
    foundDeviceIds.current.clear();
    
    // Stop any ongoing Bluetooth operations
    bluetoothService.stopScan();
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleStartScan = async () => {
    setIsScanning(true);
    setFoundDevices([]);
    foundDeviceIds.current.clear();
    setStep("scanning");

    try {
      // Use the real Bluetooth service to scan for devices
      await bluetoothService.startScan(
        (device: BluetoothDevice) => {
          // Prevent duplicate devices
          if (!foundDeviceIds.current.has(device.id)) {
            foundDeviceIds.current.add(device.id);
            setFoundDevices(prev => [...prev, device]);
            
            // If this is the first device found, transition to "found" step
            if (foundDeviceIds.current.size === 1) {
              setStep("found");
            }
          }
        },
        (error: string) => {
          setStep("error");
          setErrorMessage(error);
          setIsScanning(false);
        }
      );
      
      setIsScanning(false);
      
      // If no devices were found after scanning, show an appropriate message
      setTimeout(() => {
        if (foundDevices.length === 0 && step === "scanning") {
          setStep("error");
          setErrorMessage("No Gently devices found. Make sure your device is powered on and in pairing mode.");
        }
      }, 5000); // Give 5 seconds for devices to be discovered
      
    } catch (error) {
      setStep("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to scan for devices");
      setIsScanning(false);
    }
  };

  const handleDeviceSelect = (device: BluetoothDevice) => {
    setSelectedDevice(device);
  };

  const handleConnect = async () => {
    if (!selectedDevice) return;

    setIsConnecting(true);
    setStep("connecting");

    try {
      // Connect to the selected device using the Bluetooth service
      await bluetoothService.connectToDevice(selectedDevice.id);
      
      // Get device information
      const info = await bluetoothService.getDeviceInfo();
      setDeviceInfo(info);
      
      // Create the device in the database with the retrieved info
      createDeviceMutation.mutate({
        title: `${selectedDevice.name} Device`,
        description: `Bluetooth device ${selectedDevice.id}`,
        serialNumber: info.serialNumber,
        firmwareVersion: info.firmwareVersion,
        batteryLevel: info.batteryLevel,
      });
      
    } catch (error) {
      setStep("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to connect to device");
      setIsConnecting(false);
      
      // Disconnect if partially connected
      bluetoothService.disconnectDevice();
    }
  };

  const getSignalStrength = (rssi: number) => {
    if (rssi > -50) return "Excellent";
    if (rssi > -60) return "Good";
    if (rssi > -70) return "Fair";
    return "Weak";
  };

  const getSignalColor = (rssi: number) => {
    if (rssi > -50) return "#10b981"; // green
    if (rssi > -60) return "#3b82f6"; // blue
    if (rssi > -70) return "#f59e0b"; // amber
    return "#ef4444"; // red
  };

  // Start scanning when modal opens
  useEffect(() => {
    if (visible) {
      handleStartScan();
    } else {
      // Clean up when modal closes
      bluetoothService.stopScan();
    }
    
    // Cleanup on unmount
    return () => {
      bluetoothService.stopScan();
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {step === "scanning" && (
            <>
              <Text style={styles.modalTitle}>Scanning for Devices</Text>
              <Text style={styles.modalDescription}>
                Looking for nearby Gently devices...
              </Text>
              <View style={styles.centerContent}>
                <View style={styles.bluetoothIcon}>
                  <Text style={styles.bluetoothText}>📶</Text>
                  {isScanning && (
                    <ActivityIndicator 
                      size="small" 
                      color="#3b82f6" 
                      style={styles.loadingSpinner}
                    />
                  )}
                </View>
                <Text style={styles.instructionText}>
                  Make sure your Gently device is in pairing mode
                </Text>
              </View>
            </>
          )}

          {step === "found" && (
            <>
              <Text style={styles.modalTitle}>Found Devices</Text>
              <Text style={styles.modalDescription}>
                Select a Gently device to connect
              </Text>
              <ScrollView style={styles.deviceList}>
                {foundDevices.map((device) => (
                  <Pressable
                    key={device.id}
                    style={[
                      styles.deviceItem,
                      selectedDevice?.id === device.id && styles.deviceItemSelected
                    ]}
                    onPress={() => handleDeviceSelect(device)}
                  >
                    <View style={styles.deviceInfo}>
                      <Text style={styles.bluetoothEmoji}>📶</Text>
                      <View style={styles.deviceDetails}>
                        <Text style={styles.deviceName}>{device.name}</Text>
                        <Text style={styles.deviceId}>{device.id}</Text>
                      </View>
                    </View>
                    <View style={styles.signalInfo}>
                      <Text style={[styles.signalStrength, { color: getSignalColor(device.rssi) }]}>
                        {getSignalStrength(device.rssi)}
                      </Text>
                      <Text style={styles.signalValue}>{device.rssi} dBm</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.button, styles.secondaryButton]}
                  onPress={handleStartScan}
                  disabled={isScanning}
                >
                  <Text style={styles.secondaryButtonText}>Scan Again</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.button, 
                    styles.primaryButton,
                    (!selectedDevice || isConnecting) && styles.buttonDisabled
                  ]}
                  onPress={handleConnect}
                  disabled={!selectedDevice || isConnecting}
                >
                  <Text style={styles.primaryButtonText}>Connect</Text>
                </Pressable>
              </View>
            </>
          )}

          {step === "connecting" && (
            <>
              <Text style={styles.modalTitle}>Connecting</Text>
              <Text style={styles.modalDescription}>
                Connecting to {selectedDevice?.name}...
              </Text>
              <View style={styles.centerContent}>
                <View style={styles.connectingIcon}>
                  <Text style={styles.bluetoothText}>📶</Text>
                  <ActivityIndicator size="large" color="#3b82f6" />
                </View>
                <Text style={styles.instructionText}>
                  Please wait while we establish a connection...
                </Text>
              </View>
            </>
          )}

          {step === "connected" && (
            <>
              <Text style={[styles.modalTitle, styles.successTitle]}>
                ✓ Connected Successfully
              </Text>
              <Text style={styles.modalDescription}>
                Your device has been connected and added to your account.
              </Text>
              <View style={styles.centerContent}>
                <View style={styles.successIcon}>
                  <Text style={styles.successEmoji}>✅</Text>
                </View>
                <Text style={styles.instructionText}>
                  {selectedDevice?.name} is now ready to use!
                </Text>
                {deviceInfo && (
                  <View style={styles.deviceInfoContainer}>
                    <Text style={styles.deviceInfoTitle}>Device Information:</Text>
                    <Text style={styles.deviceInfoText}>Serial: {deviceInfo.serialNumber}</Text>
                    <Text style={styles.deviceInfoText}>Firmware: {deviceInfo.firmwareVersion}</Text>
                    <Text style={styles.deviceInfoText}>Battery: {deviceInfo.batteryLevel}%</Text>
                  </View>
                )}
                {createDeviceMutation.isPending && (
                  <ActivityIndicator size="small" color="#10b981" />
                )}
              </View>
            </>
          )}

          {step === "error" && (
            <>
              <Text style={[styles.modalTitle, styles.errorTitle]}>
                ⚠️ Connection Failed
              </Text>
              <Text style={styles.modalDescription}>
                {errorMessage}
              </Text>
              <View style={styles.centerContent}>
                <View style={styles.errorIcon}>
                  <Text style={styles.errorEmoji}>❌</Text>
                </View>
                <Text style={styles.instructionText}>
                  Please check your device and try again.
                </Text>
              </View>
              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.button, styles.secondaryButton]}
                  onPress={handleClose}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleStartScan}
                >
                  <Text style={styles.primaryButtonText}>Try Again</Text>
                </Pressable>
              </View>
            </>
          )}

          {step !== "connecting" && step !== "connected" && (
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
    textAlign: "center",
  },
  successTitle: {
    color: "#059669",
  },
  errorTitle: {
    color: "#dc2626",
  },
  modalDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  centerContent: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 20,
  },
  bluetoothIcon: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  bluetoothText: {
    fontSize: 48,
  },
  loadingSpinner: {
    position: "absolute",
    top: -8,
    right: -8,
  },
  connectingIcon: {
    alignItems: "center",
    gap: 12,
  },
  successIcon: {
    backgroundColor: "#dcfce7",
    borderRadius: 40,
    padding: 16,
  },
  successEmoji: {
    fontSize: 32,
  },
  errorIcon: {
    backgroundColor: "#fef2f2",
    borderRadius: 40,
    padding: 16,
  },
  errorEmoji: {
    fontSize: 32,
  },
  instructionText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  deviceList: {
    maxHeight: 200,
    marginBottom: 20,
  },
  deviceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    marginBottom: 8,
  },
  deviceItemSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bluetoothEmoji: {
    fontSize: 20,
  },
  deviceDetails: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1f2937",
  },
  deviceId: {
    fontSize: 12,
    color: "#6b7280",
  },
  signalInfo: {
    alignItems: "flex-end",
  },
  signalStrength: {
    fontSize: 12,
    fontWeight: "500",
  },
  signalValue: {
    fontSize: 10,
    color: "#6b7280",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: "#3b82f6",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 18,
    color: "#6b7280",
  },
  deviceInfoContainer: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    width: "100%",
  },
  deviceInfoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    textAlign: "center",
  },
  deviceInfoText: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
    textAlign: "center",
  },
});
