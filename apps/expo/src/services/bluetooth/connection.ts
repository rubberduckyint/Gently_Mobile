// Device connection functionality with Gently BLE Protocol support
import type { BleManager, Device } from "react-native-ble-plx";
import { State } from "react-native-ble-plx";

import type { AdvertisementData, DeviceInformation } from "./protocol";
import { base64ToUint8Array, uint8ArrayToBase64 } from "../../utils/base64";
import { ActiveEventNotifyCommand } from "./commands/ActiveEventNotifyCommand";
import { BatteryStatusNotifyCommand } from "./commands/BatteryStatusNotifyCommand";
import { DeviceInfoCommand } from "./commands/DeviceInfoCommand";
import { GetAllEventsCommand } from "./commands/GetAllEventsCommand";
import { GetDeviceStatusCommand } from "./commands/GetDeviceStatusCommand";
import { GetNumberOfEventsCommand } from "./commands/GetNumberOfEventsCommand";
import { GetTimeCommand } from "./commands/GetTimeCommand";
import { GetUptimeCommand } from "./commands/GetUptimeCommand";
import { SetTimeCommand } from "./commands/SetTimeCommand";
import { TimeNotifyCommand } from "./commands/TimeNotifyCommand";
import {
  CommandCode,
  DEFAULT_FACTORY_KEY,
  GENTLY_SERVICE_UUID,
  GentlyBLEProtocol,
  REQUEST_CHARACTERISTIC_UUID,
  RESPONSE_CHARACTERISTIC_UUID,
  ResponseStatus,
} from "./protocol";

export interface SecureConnectionResult {
  device: Device;
  protocol: GentlyBLEProtocol;
  deviceInfo: DeviceInformation;
  uptime: Uint8Array;
  serialNumber: string; // Hex string representation of the serial number from advertisement data
}

/**
 * Connect to a Gently device and establish secure communication
 * Following the detailed Gently BLE pairing process specification
 */
export async function connectToGentlyDevice(
  manager: BleManager,
  deviceId: string,
  advertisementData?: AdvertisementData,
  customBraceletKey?: Uint8Array,
): Promise<SecureConnectionResult> {
  const logPrefix = "🔗 GENTLY PAIRING";

  try {
    console.log(`${logPrefix}: Starting pairing with device ${deviceId}`);
    if (advertisementData) {
      console.log(
        `${logPrefix}: Found Gently device (Serial: ${Array.from(
          advertisementData.serialNumber,
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")})`,
      );
    }

    // STEP 0 - Verify Bluetooth is powered on before attempting connection
    let bluetoothState: State;
    try {
      bluetoothState = await manager.state();
    } catch (error) {
      if (error instanceof Error && error.message.includes("destroyed")) {
        throw new Error("Bluetooth manager was destroyed");
      }
      throw new Error(
        `Failed to check Bluetooth state: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    if (bluetoothState !== State.PoweredOn) {
      const errorMessage = `Bluetooth is not powered on. Current state: ${bluetoothState}. Please enable Bluetooth and try again.`;
      console.log(`${logPrefix}: ❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // Log advertisement data details if available
    if (advertisementData) {
      console.log(
        `${logPrefix}: Battery: ${advertisementData.batteryVoltage}mV (Level: ${advertisementData.flags.batteryLevel}/7, Charging: ${advertisementData.flags.charging})`,
      );
      if (advertisementData.flags.anyEventActive) {
        console.log(`${logPrefix}: Has active events`);
      }
    }

    console.log(`${logPrefix}: Connecting to device...`);

    // Connect to the device
    let device: Device;
    try {
      device = await manager.connectToDevice(deviceId);
    } catch (error) {
      console.log("ERROR", error);
      if (error instanceof Error && error.message.includes("destroyed")) {
        throw new Error("Bluetooth manager was destroyed during connection");
      }
      throw error;
    }

    console.log(
      `${logPrefix}: ✅ Connected to ${device.name ?? "Unknown"} (RSSI: ${device.rssi}dBm)`,
    );

    // Discover services and characteristics
    await device.discoverAllServicesAndCharacteristics();

    // Verify it's a Gently device with correct service
    await verifyGentlyDevice(device);

    // Verify Gently service is available
    const services = await device.services();
    let gentlyServiceFound = false;
    for (const service of services) {
      if (service.uuid.toLowerCase() === GENTLY_SERVICE_UUID.toLowerCase()) {
        gentlyServiceFound = true;
        break;
      }
    }

    if (!gentlyServiceFound) {
      console.warn(
        `${logPrefix}: ⚠️ Gently service not found, continuing for demo purposes`,
      );
    }

    // Initialize protocol with appropriate key
    const braceletKey = customBraceletKey ?? DEFAULT_FACTORY_KEY;
    const protocol = new GentlyBLEProtocol(braceletKey);

    console.log(
      `${logPrefix}: Using ${customBraceletKey ? "custom" : "factory default"} bracelet key`,
    );

    // Enable notifications on response characteristic and set up response handling

    // Simple notification handling - process responses immediately
    let waitingForResponse = false;
    let currentResponseResolver: ((value: string) => void) | null = null;
    let currentResponseRejecter: ((reason: Error) => void) | null = null;

    const waitForNotification = (): Promise<string> => {
      return new Promise((resolve, reject) => {
        // Wait for the next response
        waitingForResponse = true;
        currentResponseResolver = resolve;
        currentResponseRejecter = reject;

        // Set a timeout for the response
        setTimeout(() => {
          if (currentResponseRejecter && waitingForResponse) {
            currentResponseRejecter(
              new Error("Timeout waiting for bracelet response"),
            );
            currentResponseResolver = null;
            currentResponseRejecter = null;
            waitingForResponse = false;
          }
        }, 10000); // 10 second timeout
      });
    };

    device.monitorCharacteristicForService(
      GENTLY_SERVICE_UUID,
      RESPONSE_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          console.error(`${logPrefix}: ❌ Notification error:`, error);
          if (currentResponseRejecter && waitingForResponse) {
            currentResponseRejecter(error);
            currentResponseResolver = null;
            currentResponseRejecter = null;
            waitingForResponse = false;
          }
          return;
        }
        if (characteristic?.value) {
          // IMMEDIATELY DECRYPT AND LOG THE NOTIFICATION
          try {
            const encryptedData = base64ToUint8Array(characteristic.value);
            const decryptedResponse = protocol.parseResponse(encryptedData);

            // Log human-readable interpretation for common commands
            if (
              decryptedResponse.command === CommandCode.GET_UPTIME &&
              decryptedResponse.payload.length >= 8
            ) {
              const uptimeMs = new DataView(
                decryptedResponse.payload.buffer,
              ).getBigUint64(0, true);
              console.log(
                `${logPrefix}: ⏰ Uptime: ${Number(uptimeMs / 1000n)} seconds`,
              );
            } else if (
              decryptedResponse.command === CommandCode.GET_DEVICE_INFO
            ) {
              console.log(`${logPrefix}: ℹ️  Device info received`);
              DeviceInfoCommand.logPayloadDetails(decryptedResponse.payload);
            } else if (
              decryptedResponse.command === CommandCode.GET_DEVICE_STATUS
            ) {
              console.log(`${logPrefix}: 📊 Device status received`);
              GetDeviceStatusCommand.logPayloadDetails(
                decryptedResponse.payload,
              );
            } else if (decryptedResponse.command === CommandCode.GET_TIME) {
              GetTimeCommand.logPayloadDetails(decryptedResponse.payload);
            } else if (decryptedResponse.command === CommandCode.SET_TIME) {
              SetTimeCommand.logPayloadDetails(decryptedResponse.payload);
            } else if (
              decryptedResponse.command === CommandCode.GET_NUMBER_OF_EVENTS
            ) {
              GetNumberOfEventsCommand.logPayloadDetails(
                decryptedResponse.payload,
              );
            } else if (
              decryptedResponse.command === CommandCode.GET_ALL_EVENTS
            ) {
              console.log(`${logPrefix}: 📋 Events received`);
              try {
                // Parse the event response immediately
                const { packetNumber, totalPackets, eventInfo } =
                  GetAllEventsCommand.parseEventResponse(
                    decryptedResponse.payload,
                  );

                console.log(
                  `${logPrefix}: Processing event packet ${packetNumber}/${totalPackets}`,
                );

                if (eventInfo) {
                  console.log(
                    `${logPrefix}: Event #${eventInfo.eventIndex}: "${eventInfo.eventName}"`,
                  );
                  console.log(
                    `${logPrefix}: State: ${GetAllEventsCommand.getStateDescription(eventInfo.currentState)}`,
                  );
                  console.log(
                    `${logPrefix}: Schedule: "${eventInfo.cronExpression}"`,
                  );
                  console.log(
                    `${logPrefix}: ${GetAllEventsCommand.getVibrationDescription(eventInfo.vibrationIntensity)} vibration, ${GetAllEventsCommand.getLedDescription(eventInfo.ledColor, eventInfo.ledPattern)} LED`,
                  );
                }

                // Log detailed payload info
                GetAllEventsCommand.logPayloadDetails(
                  decryptedResponse.payload,
                );
              } catch (error) {
                console.error(
                  `${logPrefix}: Failed to parse GET_ALL_EVENTS response:`,
                  error,
                );
                GetAllEventsCommand.logPayloadDetails(
                  decryptedResponse.payload,
                );
              }
            } else if (
              decryptedResponse.command === CommandCode.BATTERY_STATUS_NOTIFY
            ) {
              // Battery status notification - async from device
              console.log(`${logPrefix}:  Battery status notification`);
              try {
                const batteryData =
                  BatteryStatusNotifyCommand.parseNotification(
                    decryptedResponse.payload,
                  );
                BatteryStatusNotifyCommand.logNotificationDetails(batteryData);
              } catch (error) {
                console.error(
                  `${logPrefix}: Failed to parse battery notification:`,
                  error,
                );
              }
            } else if (
              decryptedResponse.command === CommandCode.ACTIVE_EVENT_NOTIFY
            ) {
              // Active event notification - async from device
              console.log(`${logPrefix}: 📅 Event notification`);
              try {
                const eventData = ActiveEventNotifyCommand.parseNotification(
                  decryptedResponse.payload,
                );
                ActiveEventNotifyCommand.logNotificationDetails(eventData);
              } catch (error) {
                console.error(
                  `${logPrefix}: Failed to parse event notification:`,
                  error,
                );
              }
            } else if (decryptedResponse.command === CommandCode.TIME_NOTIFY) {
              // Time notification - async from device
              console.log(`${logPrefix}: 🕐 Time notification`);
              try {
                const timeData = TimeNotifyCommand.parseNotification(
                  decryptedResponse.payload,
                );
                TimeNotifyCommand.logNotificationDetails(timeData);
              } catch (error) {
                console.error(
                  `${logPrefix}: Failed to parse time notification:`,
                  error,
                );
              }
            }
          } catch (decryptError) {
            console.error(
              `${logPrefix}: ❌ Failed to decrypt notification:`,
              decryptError,
            );
          }

          // Determine if this is an async notification (no corresponding request) or a response to a request
          if (waitingForResponse && currentResponseResolver) {
            // Someone is waiting for this response
            currentResponseResolver(characteristic.value);
            currentResponseResolver = null;
            currentResponseRejecter = null;
            waitingForResponse = false;
          }
        }
      },
    );

    // Extract serial number from advertisement data
    const serialNumber = advertisementData?.serialNumber ?? new Uint8Array(8);

    // Step 1: Get uptime (encrypted with bracelet key)
    console.log(`${logPrefix}: Requesting device uptime...`);
    const uptimeRequestPayload = GetUptimeCommand.createRequest();

    // Encrypt the request using the protocol
    const uptimeRequest = protocol.createRequest(
      CommandCode.GET_UPTIME,
      uptimeRequestPayload,
    );

    await device.writeCharacteristicWithResponseForService(
      GENTLY_SERVICE_UUID,
      REQUEST_CHARACTERISTIC_UUID,
      uint8ArrayToBase64(uptimeRequest),
    );

    // Wait for the response via notification
    const uptimeResponseValue = await waitForNotification();

    if (!uptimeResponseValue) {
      throw new Error("No uptime response received");
    }

    // Parse uptime response and establish dynamic key
    let uptime: Uint8Array;
    try {
      uptime = protocol.parseUptimeResponse(
        base64ToUint8Array(uptimeResponseValue),
        serialNumber,
      );

      console.log(`${logPrefix}: ✅ Dynamic key established successfully`);
    } catch (error) {
      console.error(`${logPrefix}: ❌ Failed to parse uptime response:`, error);
      throw error;
    }

    // Step 2: Get device info (encrypted with dynamic key)
    console.log(`${logPrefix}: Requesting device information...`);
    const deviceInfoRequest = DeviceInfoCommand.createRequest();

    // Encrypt the request using the protocol
    const encryptedRequest = protocol.createRequest(
      CommandCode.GET_DEVICE_INFO,
      deviceInfoRequest,
    );

    await device.writeCharacteristicWithResponseForService(
      GENTLY_SERVICE_UUID,
      REQUEST_CHARACTERISTIC_UUID,
      uint8ArrayToBase64(encryptedRequest),
    );

    // Wait for the device info response via notification
    const deviceInfoResponseValue = await waitForNotification();

    if (!deviceInfoResponseValue) {
      throw new Error("No device info response received");
    }

    // Parse the response using the protocol first, then the command parser
    const parsedResponse = protocol.parseResponse(
      base64ToUint8Array(deviceInfoResponseValue),
    );
    const deviceInfo = DeviceInfoCommand.parseResponse(
      parsedResponse.payload,
      parsedResponse.status,
    );

    console.log(
      `${logPrefix}: ✅ Connected to Gently device (HW: ${deviceInfo.hardwareVersion}, FW: ${deviceInfo.firmwareVersionMajor}.${deviceInfo.firmwareVersionMinor}.${deviceInfo.firmwareBuildNumber})`,
    );

    // Convert serial number bytes to hex string for consistent usage
    const serialNumberHex = Array.from(serialNumber)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    return {
      device,
      protocol,
      deviceInfo,
      uptime,
      serialNumber: serialNumberHex,
    };
  } catch (error) {
    console.error(`${logPrefix}: ❌ Pairing failed:`, error);
    throw new Error(
      `Failed to connect to device: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Legacy connection function for backward compatibility
 */
export async function connectToDevice(
  manager: BleManager,
  deviceId: string,
): Promise<Device> {
  try {
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    await verifyGentlyDevice(device);

    return device;
  } catch (error) {
    console.error("Failed to connect to device:", error);
    throw new Error(
      `Failed to connect to device: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Disconnect from a device
 */
export async function disconnectDevice(
  manager: BleManager,
  device: Device,
): Promise<void> {
  try {
    await manager.cancelDeviceConnection(device.id);
  } catch (error) {
    console.error("❌ Error disconnecting device:", error);
    throw error;
  }
}

/**
 * Verify that a connected device is actually a Gently device
 */
async function verifyGentlyDevice(device: Device): Promise<void> {
  try {
    const services = await device.services();
    const hasGentlyService = services.some(
      (service) =>
        service.uuid.toLowerCase() === GENTLY_SERVICE_UUID.toLowerCase(),
    );

    if (!hasGentlyService) {
      // For demo purposes, we'll continue anyway
      // In production, you might want to throw an error here
    }
  } catch {
    // For demo purposes, continue anyway
  }
}

/**
 * Check if device is connected
 */
export async function isDeviceConnected(device: Device): Promise<boolean> {
  try {
    return await device.isConnected();
  } catch {
    return false;
  }
}

/**
 * Send a command to a connected Gently device
 */
export async function sendCommand(
  device: Device,
  protocol: GentlyBLEProtocol,
  command: CommandCode,
  payload?: Uint8Array,
): Promise<Uint8Array> {
  try {
    if (
      !protocol.isDynamicKeyEstablished() &&
      command !== CommandCode.GET_UPTIME
    ) {
      throw new Error(
        "Dynamic key not established. Call connectToGentlyDevice first.",
      );
    }

    // Create the request
    const request = protocol.createRequest(command, payload);

    // Send the request
    await device.writeCharacteristicWithResponseForService(
      GENTLY_SERVICE_UUID,
      REQUEST_CHARACTERISTIC_UUID,
      uint8ArrayToBase64(request),
    );

    // Read the response
    const response = await device.readCharacteristicForService(
      GENTLY_SERVICE_UUID,
      RESPONSE_CHARACTERISTIC_UUID,
    );

    if (!response.value) {
      throw new Error("No response received");
    }

    // Parse the response
    const parsedResponse = protocol.parseResponse(
      base64ToUint8Array(response.value),
    );

    if (parsedResponse.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${parsedResponse.status}`);
    }

    return parsedResponse.payload;
  } catch (error) {
    console.error("❌ Failed to send command:", error);
    throw error;
  }
}
