// Device scanning functionality with Gently BLE Protocol support
import type { BleError, BleManager, Device } from "react-native-ble-plx";

import type { AdvertisementData } from "./protocol";
import type { BluetoothDevice, ScanCallbacks, ScanOptions } from "./types";
import { base64ToUint8Array } from "../../utils/base64";
import { parseManufacturerData } from "./commands";
import { GentlyBLEProtocol, isGentlyDeviceFromAdvertisement } from "./protocol";

/**
 * Parse manufacturer data to check if device is a Gently device
 */
export function isGentlyDevice(device: Device): boolean {
  // Check for exact device name "Gently" first
  if (device.name === "Gently") {
    console.log(
      `📱 FOUND: Gently device "${device.name}" (${device.id}) at ${device.rssi}dBm`,
    );
    return true;
  }

  // Check device name for "Gently" (case-insensitive fallback)
  if (device.name?.toLowerCase().includes("gently")) {
    console.log(
      `📱 FOUND: Gently device "${device.name}" (${device.id}) at ${device.rssi}dBm`,
    );
    return true;
  }

  // Check manufacturer data using the protocol
  if (device.manufacturerData) {
    try {
      // Convert base64 manufacturer data to Uint8Array
      const manufacturerArray = base64ToUint8Array(device.manufacturerData);
      const isGently = isGentlyDeviceFromAdvertisement(manufacturerArray);

      if (isGently) {
        console.log(
          `📱 FOUND: Gently device "${device.name ?? "Unknown"}" (${device.id}) at ${device.rssi}dBm - identified by manufacturer data`,
        );
        return true;
      }
    } catch {
      // Silently fail for non-Gently devices
    }
  }

  // Not a Gently device - don't log anything
  return false;
}

/**
 * Parse advertisement data from a Gently device
 */
export function parseGentlyAdvertisement(
  device: Device,
): AdvertisementData | null {
  if (!device.manufacturerData) {
    return null;
  }

  try {
    const manufacturerArray = base64ToUint8Array(device.manufacturerData);
    const protocol = new GentlyBLEProtocol();
    const advertisementData =
      protocol.parseAdvertisementData(manufacturerArray);

    return advertisementData;
  } catch (error) {
    console.warn(`Failed to parse advertisement for ${device.name}:`, error);
    return null;
  }
}

/**
 * Convert BLE Device to BluetoothDevice with advertisement data
 */
export function mapBleDevice(device: Device): BluetoothDevice {
  const base = {
    id: device.id,
    name: device.name ?? "Gently",
    rssi: device.rssi ?? -100,
    serviceUUIDs: device.serviceUUIDs ?? undefined,
    localName: device.localName ?? undefined,
  };

  // Try to parse advertisement data
  const advertisementData = parseGentlyAdvertisement(device);

  // Parse manufacturer data for device filtering
  let manufacturerData: BluetoothDevice["manufacturerData"] | undefined;
  if (device.manufacturerData) {
    try {
      const parsedManufacturerData = parseManufacturerData(
        device.manufacturerData,
      );
      if (parsedManufacturerData) {
        manufacturerData =
          parsedManufacturerData as BluetoothDevice["manufacturerData"];
      }
    } catch (error) {
      console.warn("Failed to parse manufacturer data:", error);
    }
  }

  return {
    ...base,
    advertisementData: advertisementData ?? undefined,
    manufacturerData,
  };
}

/**
 * Start scanning for Bluetooth devices
 */
export function startDeviceScan(
  manager: BleManager,
  callbacks: ScanCallbacks,
  options: ScanOptions = {},
): () => void {
  console.log("🔍 Scanning for Gently devices...");

  // Track unique Gently devices by their device ID to avoid duplicates
  const foundGentlyDevices = new Map<string, BluetoothDevice>();

  // Function to display the current list of found Gently devices
  const displayGentlyDevicesList = () => {
    if (foundGentlyDevices.size === 0) {
      console.log("📋 No Gently devices found");
      return;
    }

    console.log(`📋 Found ${foundGentlyDevices.size} Gently devices:`);
    let index = 1;
    foundGentlyDevices.forEach((device) => {
      console.log(`📱 [${index}] ${device.name} (${device.id})`);
      console.log(`    📡 Signal: ${device.rssi} dBm`);

      if (device.advertisementData) {
        const serialHex = Array.from(device.advertisementData.serialNumber)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        console.log(`    🔢 Serial: ${serialHex}`);
        console.log(
          `    🔋 Battery: ${device.advertisementData.batteryVoltage}mV (Level: ${device.advertisementData.flags.batteryLevel}/7)`,
        );
        if (device.advertisementData.flags.charging) {
          console.log(`    ⚡ Charging`);
        }
        if (device.advertisementData.flags.anyEventActive) {
          console.log(`    � Has active events`);
        }
      }
      index++;
    });
  };

  // Set up timeout if specified
  let timeoutId: NodeJS.Timeout | null = null;
  if (options.timeout) {
    timeoutId = setTimeout(() => {
      console.log(`⏰ Scan timeout reached (${options.timeout}ms)`);
      displayGentlyDevicesList();
      void manager.stopDeviceScan();
      callbacks.onComplete?.();
    }, options.timeout);
  }

  // Start scanning
  void manager.startDeviceScan(
    null,
    {
      scanMode: 2, // Low latency scan mode
      legacyScan: false, // Use modern BLE scanning
    },
    (error: BleError | null, device: Device | null) => {
      if (error) {
        console.error("❌ BLE scan error:", error);
        displayGentlyDevicesList();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        callbacks.onError(error.message);
        return;
      }

      if (device) {
        // Check if this is a Gently device
        const isGently = isGentlyDevice(device);

        if (isGently) {
          // Check if we've already found this device (avoid duplicates)
          if (foundGentlyDevices.has(device.id)) {
            // Update the existing device with new RSSI if it's stronger
            const existingDevice = foundGentlyDevices.get(device.id);
            if (existingDevice && (device.rssi ?? -100) > existingDevice.rssi) {
              const deviceWithAdvData = mapBleDevice(device);
              foundGentlyDevices.set(device.id, deviceWithAdvData);
            }
          } else {
            console.log(
              `📱 Found Gently device: "${device.name ?? "Unknown"}" (${device.rssi}dBm)`,
            );

            // Parse advertisement data for better device info
            const deviceWithAdvData = mapBleDevice(device);

            // Add to our unique devices map
            foundGentlyDevices.set(device.id, deviceWithAdvData);

            if (deviceWithAdvData.advertisementData) {
              const serialHex = Array.from(
                deviceWithAdvData.advertisementData.serialNumber,
              )
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
              console.log(`    Serial: ${serialHex}`);
              console.log(
                `    Battery: ${deviceWithAdvData.advertisementData.batteryVoltage}mV (Level: ${deviceWithAdvData.advertisementData.flags.batteryLevel}/7)`,
              );
              if (deviceWithAdvData.advertisementData.flags.charging) {
                console.log(`    Charging: Yes`);
              }
              if (deviceWithAdvData.advertisementData.flags.anyEventActive) {
                console.log(`    Has active events`);
              }
            }

            callbacks.onDeviceFound(deviceWithAdvData);
          }
        }
      }
    },
  );

  // Return stop function
  return () => {
    console.log("🛑 Stopping device scan");
    displayGentlyDevicesList();
    void manager.stopDeviceScan();
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Stop device scanning
 */
export function stopDeviceScan(manager: BleManager): void {
  void manager.stopDeviceScan();
}
