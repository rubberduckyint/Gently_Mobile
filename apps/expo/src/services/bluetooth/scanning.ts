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
  const logPrefix = "📊 ADVERTISEMENT";

  if (!device.manufacturerData) {
    console.log(
      `${logPrefix}: No manufacturer data available for ${device.name ?? "Unknown"}`,
    );
    return null;
  }

  try {
    console.log(
      `${logPrefix}: Parsing advertisement for device: ${device.name ?? "Unknown"}`,
    );
    console.log(
      `${logPrefix}: Raw manufacturer data: ${device.manufacturerData}`,
    );

    const manufacturerArray = base64ToUint8Array(device.manufacturerData);
    console.log(
      `${logPrefix}: Manufacturer data (${manufacturerArray.length} bytes): ${Array.from(
        manufacturerArray,
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`,
    );

    const protocol = new GentlyBLEProtocol();
    const advertisementData =
      protocol.parseAdvertisementData(manufacturerArray);

    if (advertisementData) {
      console.log(`${logPrefix}: ✅ Successfully parsed advertisement data:`);
      console.log(
        `${logPrefix}:   - API Version: ${advertisementData.apiVersion}`,
      );
      console.log(
        `${logPrefix}:   - Packet Counter: ${advertisementData.packetCounter}`,
      );
      console.log(
        `${logPrefix}:   - Error Code: ${advertisementData.errorCode}`,
      );
      console.log(
        `${logPrefix}:   - Serial Number: ${Array.from(
          advertisementData.serialNumber,
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")}`,
      );
      console.log(
        `${logPrefix}:   - Battery Voltage: ${advertisementData.batteryVoltage}mV`,
      );
      console.log(
        `${logPrefix}:   - Charging: ${advertisementData.flags.charging}`,
      );
      console.log(
        `${logPrefix}:   - Battery Level: ${advertisementData.flags.batteryLevel}/7`,
      );
      console.log(
        `${logPrefix}:   - Bracelet Key Type: ${advertisementData.flags.braceletKeyType}`,
      );
      console.log(
        `${logPrefix}:   - Any Event Active: ${advertisementData.flags.anyEventActive}`,
      );
    } else {
      console.log(`${logPrefix}: ❌ Failed to parse advertisement data`);
    }

    return advertisementData;
  } catch (error) {
    console.log(`${logPrefix}: ❌ Error parsing advertisement:`, error);
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
  // Set up timeout if specified
  let timeoutId: NodeJS.Timeout | null = null;
  if (options.timeout) {
    timeoutId = setTimeout(() => {
      void manager.stopDeviceScan();
      callbacks.onComplete?.();
    }, options.timeout);
  }

  // Start scanning with specific service UUID for production
  // Use null for demo/testing if you need to find demo devices
  void manager.startDeviceScan(
    null, // serviceUUIDs - scan specifically for Gently devices
    {
      scanMode: 2, // Low latency scan mode
      legacyScan: false, // Use modern BLE scanning
    },
    (error: BleError | null, device: Device | null) => {
      if (error) {
        console.error("❌ BLE scan error:", error);
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
          console.log(
            "📱 FOUND GENTLY DEVICE:",
            device.name ?? "Unknown",
            `(${device.rssi} dBm)`,
          );

          // Parse advertisement data for better device info
          const deviceWithAdvData = mapBleDevice(device);

          // Log comprehensive device information
          console.log("📱 DEVICE DETAILS:");
          console.log(`📱   - Device ID: ${deviceWithAdvData.id}`);
          console.log(`📱   - Device Name: ${deviceWithAdvData.name}`);
          console.log(`📱   - Signal Strength: ${deviceWithAdvData.rssi} dBm`);

          if (deviceWithAdvData.advertisementData) {
            console.log("�   - Advertisement Data: AVAILABLE");
            console.log(
              `📱     * Serial Number: ${Array.from(
                deviceWithAdvData.advertisementData.serialNumber,
              )
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("")}`,
            );
            console.log(
              `📱     * Battery: ${deviceWithAdvData.advertisementData.batteryVoltage}mV`,
            );
            console.log(
              `📱     * Charging: ${deviceWithAdvData.advertisementData.flags.charging}`,
            );
            console.log(
              `📱     * Battery Level: ${deviceWithAdvData.advertisementData.flags.batteryLevel}/7`,
            );
            console.log(
              `📱     * Events Active: ${deviceWithAdvData.advertisementData.flags.anyEventActive}`,
            );
          } else {
            console.log("📱   - Advertisement Data: NOT AVAILABLE");
          }

          callbacks.onDeviceFound(deviceWithAdvData);
        }
      }
    },
  );

  // Return stop function
  return () => {
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
