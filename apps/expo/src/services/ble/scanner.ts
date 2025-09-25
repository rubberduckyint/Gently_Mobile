/**
 * BLE Scanning Module for Gently Bracelets
 * Handles device discovery and advertisement data parsing
 */

import type { Device } from "@b1naryth1ef/react-native-ble-plx";
import { BleManager, ScanMode, State } from "@b1naryth1ef/react-native-ble-plx";

import type { AdvertisementData } from "./types";
import { base64ToUint8Array } from "../../utils/base64";
import { parseAdvertisementData } from "./encryption";

// Singleton BLE Manager
let bleManager: BleManager | null = null;

/**
 * Get or create BLE manager instance
 */
function getBleManager(): BleManager {
  bleManager ??= new BleManager();
  return bleManager;
}

/**
 * Request BLE permissions and enable Bluetooth
 */
export async function requestBlePermissions(): Promise<boolean> {
  try {
    const manager = getBleManager();

    // Check if Bluetooth is enabled
    const state = await manager.state();
    console.log("📱 BLE State:", state);

    if (state === State.PoweredOff) {
      throw new Error(
        "Bluetooth is turned off. Please enable Bluetooth and try again.",
      );
    }

    if (state === State.Unauthorized) {
      throw new Error(
        "Bluetooth permission denied. Please grant Bluetooth permissions in Settings.",
      );
    }

    if (state === State.Unsupported) {
      throw new Error("Bluetooth Low Energy is not supported on this device.");
    }

    if (state !== State.PoweredOn) {
      throw new Error(`Bluetooth is not ready. Current state: ${state}`);
    }

    console.log("✅ BLE permissions and state OK");
    return true;
  } catch (error) {
    console.error("❌ BLE permission check failed:", error);
    throw error;
  }
}

/**
 * Discovered Gently device with parsed advertisement data
 */
export interface DiscoveredGentlyDevice {
  device: Device;
  advertisementData: AdvertisementData;
  rssi: number;
  lastSeen: number;
}

/**
 * Scan for Gently devices
 * Returns discovered devices with parsed advertisement data
 */
export async function scanForGentlyDevices(
  options: {
    timeoutMs?: number;
    allowDuplicates?: boolean;
    /** Optional serial number that should stop the scan as soon as it's found */
    targetSerialNumber?: string;
    /** When true, resolves immediately once `targetSerialNumber` is discovered */
    resolveOnTarget?: boolean;
  } = {},
): Promise<DiscoveredGentlyDevice[]> {
  const {
    timeoutMs = 10000,
    allowDuplicates = false,
    targetSerialNumber,
    resolveOnTarget = false,
  } = options;

  try {
    await requestBlePermissions();

    const manager = getBleManager();
    const discoveredDevices = new Map<string, DiscoveredGentlyDevice>();

    console.log("🔍 Starting scan for Gently devices...");

    return new Promise((resolve, reject) => {
      let finished = false;

      const timeoutId = setTimeout(() => {
        console.log(
          `⏰ Scan timeout after ${timeoutMs}ms. Found ${discoveredDevices.size} Gently devices.`,
        );

        // Log summary of discovered devices
        if (discoveredDevices.size > 0) {
          console.log(`📋 Summary of discovered Gently devices:`);
          discoveredDevices.forEach((device, index) => {
            console.log(
              `  ${index + 1}. ${device.device.name} (${device.advertisementData.serialNumber}) - ${device.rssi}dBm`,
            );
          });
        }

        finishWithDevices(Array.from(discoveredDevices.values()));
      }, timeoutMs);

      const finishWithDevices = (devices: DiscoveredGentlyDevice[]) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeoutId);
        void manager.stopDeviceScan();
        resolve(devices);
      };

      const failScan = (error: Error) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeoutId);
        void manager.stopDeviceScan();
        reject(error);
      };

      void manager.startDeviceScan(
        null, // serviceUUIDs - null means scan for all devices
        {
          allowDuplicates,
          scanMode: ScanMode.LowLatency,
          legacyScan: false,
        },
        (error, device) => {
          if (error) {
            console.error("❌ BLE scan error:", error);
            failScan(new Error(`BLE scan failed: ${error.message}`));
            return;
          }

          if (!device) {
            return;
          }

          // Check if device name is 'Gently' first (only log Gently devices)
          if (device.name !== "Gently") {
            return;
          }

          try {
            // Parse manufacturer data for Gently devices
            const advertisementData = parseGentlyAdvertisement(device);

            if (advertisementData) {
              const discoveredDevice: DiscoveredGentlyDevice = {
                device,
                advertisementData,
                rssi: device.rssi ?? -100,
                lastSeen: Date.now(),
              };

              const isNewDevice =
                allowDuplicates || !discoveredDevices.has(device.id);

              // Store or update discovered device
              if (isNewDevice) {
                discoveredDevices.set(device.id, discoveredDevice);

                // Log only when we record the device (avoids duplicate spam)
                console.log(
                  `� Found Gently device: "${device.name}" (${device.id}) at ${device.rssi}dBm`,
                );

                // Log detailed advertisement data using helper function
                logAdvertisementData(
                  device.name,
                  device.id,
                  advertisementData,
                  device.rssi ?? -100,
                );

                // Check and log connection readiness
                const connectionCheck = isDeviceReadyForConnection(
                  advertisementData,
                  device.rssi ?? -100,
                );

                if (connectionCheck.ready) {
                  console.log(`  ✅ Device appears ready for connection`);
                } else {
                  console.log(`  ⚠️ Connection may have issues:`);
                  connectionCheck.warnings.forEach((warning) => {
                    console.log(`    - ${warning}`);
                  });
                }

                if (
                  resolveOnTarget &&
                  targetSerialNumber &&
                  advertisementData.serialNumber === targetSerialNumber
                ) {
                  console.log(
                    `🎯 Target device ${targetSerialNumber} discovered, stopping scan early.`,
                  );
                  finishWithDevices([discoveredDevice]);
                }
              }
            }
          } catch (parseError) {
            console.warn(
              "⚠️ Failed to parse advertisement data for device:",
              device.id,
              parseError,
            );
          }
        },
      );
    });
  } catch (error) {
    console.error("❌ Failed to scan for devices:", error);
    throw error;
  }
}

/**
 * Find a specific Gently device by serial number
 */
export async function findGentlyDeviceBySerial(
  serialNumber: string,
  timeoutMs = 15000,
): Promise<DiscoveredGentlyDevice | null> {
  try {
    console.log(`🔍 Searching for Gently device with serial: ${serialNumber}`);

    const devices = await scanForGentlyDevices({
      timeoutMs,
      targetSerialNumber: serialNumber,
      resolveOnTarget: true,
    });

    const targetDevice = devices.find(
      (d) => d.advertisementData.serialNumber === serialNumber,
    );

    if (targetDevice) {
      console.log(`✅ Found target device: ${targetDevice.device.id}`);
      return targetDevice;
    } else {
      console.log(`❌ Device with serial ${serialNumber} not found`);
      return null;
    }
  } catch (error) {
    console.error("❌ Failed to find device by serial:", error);
    throw error;
  }
}

/**
 * Stop any ongoing BLE scan
 */
export function stopScan(): void {
  try {
    const manager = getBleManager();
    void manager.stopDeviceScan();
    console.log("🛑 BLE scan stopped");
  } catch (error) {
    console.error("❌ Failed to stop scan:", error);
  }
}

/**
 * Parse Gently device advertisement data
 */
function parseGentlyAdvertisement(device: Device): AdvertisementData | null {
  try {
    // Look for manufacturer data with Motsai company ID (0x0274)
    const manufacturerData = device.manufacturerData;

    if (!manufacturerData) {
      return null;
    }

    // Convert base64 manufacturer data to bytes
    const manufacturerBytes = base64ToUint8Array(manufacturerData);

    // Check if it starts with Motsai company ID (0x74, 0x02 in little endian)
    if (
      manufacturerBytes.length < 26 ||
      manufacturerBytes[0] !== 0x74 ||
      manufacturerBytes[1] !== 0x02
    ) {
      return null;
    }

    // Extract the 24-byte encrypted payload (skip 2-byte company ID)
    const encryptedPayload = manufacturerBytes.slice(2, 26);

    // Parse the encrypted advertisement data
    return parseAdvertisementData(encryptedPayload);
  } catch (error) {
    console.warn("Failed to parse Gently advertisement:", error);
    console.warn(`  Device: ${device.name} (${device.id})`);
    if (device.manufacturerData) {
      const bytes = base64ToUint8Array(device.manufacturerData);
      console.warn(`  Manufacturer Data Length: ${bytes.length} bytes`);
      console.warn(
        `  Raw Manufacturer Data: ${Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")}`,
      );
    } else {
      console.warn(`  No manufacturer data available`);
    }
    return null;
  }
}

/**
 * Get current BLE state
 */
export async function getBleState(): Promise<State> {
  try {
    const manager = getBleManager();
    return await manager.state();
  } catch (error) {
    console.error("Failed to get BLE state:", error);
    return State.Unknown;
  }
}

/**
 * Cleanup BLE manager
 */
export function cleanupBleManager(): void {
  if (bleManager) {
    void bleManager.stopDeviceScan();
    void bleManager.destroy();
    bleManager = null;
    console.log("🧹 BLE manager cleaned up");
  }
}

/**
 * Monitor BLE state changes
 */
export function monitorBleState(callback: (state: State) => void): () => void {
  const manager = getBleManager();

  const subscription = manager.onStateChange(callback, true);

  return () => {
    subscription.remove();
  };
}

/**
 * Check if a Gently device is ready for connection based on advertisement data
 */
export function isDeviceReadyForConnection(
  adData: AdvertisementData,
  rssi: number,
): { ready: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (rssi < -85) {
    warnings.push("Weak signal may cause connection issues");
  }

  if (adData.batteryLevel <= 1) {
    warnings.push("Low battery may affect connection stability");
  }

  if (adData.errorCode !== 0) {
    warnings.push(`Device reporting error code ${adData.errorCode}`);
  }

  return {
    ready: warnings.length === 0,
    warnings,
  };
}

/**
 * Log formatted advertisement data for debugging
 */
export function logAdvertisementData(
  deviceName: string | null,
  deviceId: string,
  adData: AdvertisementData,
  rssi: number,
): void {
  console.log(
    `📱 Found Gently device: ${deviceName ?? "Unknown"} (${deviceId})`,
  );
  console.log(`  📊 Advertisement Data:`);
  console.log(`    🔢 API Version: ${adData.apiVersion}`);
  console.log(`    📋 Packet Counter: ${adData.packetCounter}`);
  console.log(`    ⚠️ Error Code: ${adData.errorCode}`);
  console.log(`    🆔 Serial Number: ${adData.serialNumber}`);
  console.log(
    `    🕐 Time: ${adData.timeHour.toString().padStart(2, "0")}:${adData.timeMinute.toString().padStart(2, "0")}:${adData.timeSeconds.toString().padStart(2, "0")}`,
  );
  console.log(
    `    📅 Date: ${adData.year}/${adData.month.toString().padStart(2, "0")}/${adData.date.toString().padStart(2, "0")} (Day ${adData.weekDay})`,
  );
  console.log(
    `    🔋 Battery: ${adData.batteryVoltage}mV (Level: ${adData.batteryLevel}/4)`,
  );
  console.log(`    ⚡ Charging: ${adData.chargingStatus ? "Yes" : "No"}`);
  console.log(`    🔑 Key Type: ${adData.braceletKeyType}`);
  console.log(`    📅 Events Active: ${adData.anyEventActive ? "Yes" : "No"}`);
  console.log(`    📡 RSSI: ${rssi}dBm`);

  // Connection readiness indicators
  console.log(`  🔗 Connection Readiness:`);
  console.log(
    `    📶 Signal Strength: ${rssi > -70 ? "Good" : rssi > -85 ? "Fair" : "Poor"} (${rssi}dBm)`,
  );
  console.log(
    `    🔋 Battery Status: ${adData.batteryLevel > 1 ? "OK" : "Low"} (${adData.batteryLevel}/4)`,
  );
  console.log(
    `    ⚠️ Error Status: ${adData.errorCode === 0 ? "None" : `Code ${adData.errorCode}`}`,
  );

  if (rssi < -85) {
    console.log(`    ⚠️ Warning: Weak signal may cause connection issues`);
  }
  if (adData.batteryLevel <= 1) {
    console.log(`    ⚠️ Warning: Low battery may affect connection stability`);
  }
  if (adData.errorCode !== 0) {
    console.log(
      `    ⚠️ Warning: Device reporting error code ${adData.errorCode}`,
    );
  }
}

/**
 * Log connection attempt information for debugging
 */
export function logConnectionAttempt(
  device: DiscoveredGentlyDevice,
  attemptNumber = 1,
): void {
  console.log(`🔗 Connection Attempt #${attemptNumber} for device:`);
  console.log(`  📱 Device: ${device.device.name} (${device.device.id})`);
  console.log(`  🆔 Serial: ${device.advertisementData.serialNumber}`);
  console.log(`  📡 Signal: ${device.rssi}dBm`);
  console.log(
    `  🔋 Battery: ${device.advertisementData.batteryVoltage}mV (Level: ${device.advertisementData.batteryLevel}/4)`,
  );
  console.log(`  🔑 Key Type: ${device.advertisementData.braceletKeyType}`);
  console.log(
    `  ⏱️ Last Seen: ${new Date(device.lastSeen).toLocaleTimeString()}`,
  );

  const connectionCheck = isDeviceReadyForConnection(
    device.advertisementData,
    device.rssi,
  );

  if (!connectionCheck.ready) {
    console.log(`  ⚠️ Potential Issues:`);
    connectionCheck.warnings.forEach((warning) => {
      console.log(`    - ${warning}`);
    });
  }
}
