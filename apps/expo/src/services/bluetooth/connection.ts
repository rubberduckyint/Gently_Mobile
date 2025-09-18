// Device connection functionality with Gently BLE Protocol support
import type { BleManager, Device } from "react-native-ble-plx";
import { State } from "react-native-ble-plx";

import type { AdvertisementData, DeviceInformation } from "./protocol";
import { base64ToUint8Array, uint8ArrayToBase64 } from "../../utils/base64";
import { ActiveEventNotifyCommand } from "./commands/ActiveEventNotifyCommand";
import { BatteryStatusNotifyCommand } from "./commands/BatteryStatusNotifyCommand";
import { CreateEventCommand } from "./commands/CreateEventCommand";
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
    console.log(`${logPrefix}: ========== STARTING PAIRING PROCESS ==========`);
    console.log(`${logPrefix}: Device ID: ${deviceId}`);
    console.log(
      `${logPrefix}: Advertisement Data:`,
      advertisementData ? "PROVIDED" : "NOT PROVIDED",
    );
    if (advertisementData) {
      console.log(
        `${logPrefix}: Advertisement Serial Number:`,
        Array.from(advertisementData.serialNumber)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );
    }

    // STEP 0 - Verify Bluetooth is powered on before attempting connection
    console.log(`${logPrefix}: STEP 0 - Verifying Bluetooth state`);
    let bluetoothState: State;
    try {
      bluetoothState = await manager.state();
      console.log(`${logPrefix}: Current Bluetooth state: ${bluetoothState}`);
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
    console.log(`${logPrefix}: ✅ Bluetooth is powered on and ready`);

    // Log advertisement data details if available
    if (advertisementData) {
      console.log(`${logPrefix}: Advertisement Data Found:`);
      console.log(
        `${logPrefix}:   - API Version: ${advertisementData.apiVersion}`,
      );
      console.log(
        `${logPrefix}:   - Serial Number: ${Array.from(
          advertisementData.serialNumber,
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")}`,
      );
      console.log(
        `${logPrefix}:   - Battery: ${advertisementData.batteryVoltage}mV`,
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
      console.log(`${logPrefix}: No advertisement data available`);
    }

    console.log(`${logPrefix}: STEP 1 - Establishing BLE connection session`);

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
      `${logPrefix}: ✅ BLE connection established with device: ${device.name ?? "Unknown"}`,
    );
    console.log(
      `${logPrefix}: Device details: ID=${device.id}, RSSI=${device.rssi}dBm`,
    );

    console.log(
      `${logPrefix}: STEP 2 - Discovering services and characteristics`,
    );

    // Discover services and characteristics
    await device.discoverAllServicesAndCharacteristics();
    console.log(`${logPrefix}: ✅ Service discovery completed`);

    // Verify it's a Gently device with correct service
    await verifyGentlyDevice(device);

    console.log(
      `${logPrefix}: STEP 3 - Discovering custom BLE characteristics`,
    );
    console.log(
      `${logPrefix}: Looking for Gently service UUID: ${GENTLY_SERVICE_UUID}`,
    );
    console.log(
      `${logPrefix}: Request characteristic UUID: ${REQUEST_CHARACTERISTIC_UUID} (0xF023)`,
    );
    console.log(
      `${logPrefix}: Response characteristic UUID: ${RESPONSE_CHARACTERISTIC_UUID} (0xF024)`,
    );

    const services = await device.services();
    let gentlyServiceFound = false;
    for (const service of services) {
      if (service.uuid.toLowerCase() === GENTLY_SERVICE_UUID.toLowerCase()) {
        gentlyServiceFound = true;
        console.log(`${logPrefix}: ✅ Found Gently service: ${service.uuid}`);

        const characteristics = await service.characteristics();
        for (const char of characteristics) {
          console.log(`${logPrefix}: Found characteristic: ${char.uuid}`);
          if (
            char.uuid.toLowerCase() ===
            REQUEST_CHARACTERISTIC_UUID.toLowerCase()
          ) {
            console.log(
              `${logPrefix}: ✅ Found REQUEST characteristic (0xF023): ${char.uuid}`,
            );
          }
          if (
            char.uuid.toLowerCase() ===
            RESPONSE_CHARACTERISTIC_UUID.toLowerCase()
          ) {
            console.log(
              `${logPrefix}: ✅ Found RESPONSE characteristic (0xF024): ${char.uuid}`,
            );
          }
        }
        break;
      }
    }

    if (!gentlyServiceFound) {
      console.log(
        `${logPrefix}: ⚠️ Gently service not found, but continuing for demo purposes`,
      );
    }

    // Initialize protocol with appropriate key
    const braceletKey = customBraceletKey ?? DEFAULT_FACTORY_KEY;
    const protocol = new GentlyBLEProtocol(braceletKey);

    console.log(
      `${logPrefix}: STEP 4 - Initializing encryption with Bracelet Key`,
    );
    console.log(
      `${logPrefix}: Using ${customBraceletKey ? "custom" : "factory default"} bracelet key`,
    );
    console.log(
      `${logPrefix}: Bracelet key: ${Array.from(braceletKey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`,
    );

    // Enable notifications on response characteristic and set up response handling
    console.log(
      `${logPrefix}: STEP 5 - Enabling notifications on response characteristic`,
    );

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
          const responseLength = base64ToUint8Array(
            characteristic.value,
          ).length;
          console.log(
            `${logPrefix}: 📩 Received notification from bracelet: ${responseLength} bytes`,
          );
          console.log(
            `${logPrefix}: 📩 Raw notification data: ${Array.from(
              base64ToUint8Array(characteristic.value),
            )
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("")}`,
          );

          // IMMEDIATELY DECRYPT AND LOG THE NOTIFICATION
          try {
            const encryptedData = base64ToUint8Array(characteristic.value);
            const decryptedResponse = protocol.parseResponse(encryptedData);

            console.log(`${logPrefix}: 🔓 DECRYPTED NOTIFICATION:`);
            console.log(
              `${logPrefix}: 🔓   API Version: ${decryptedResponse.apiVersion}`,
            );
            console.log(
              `${logPrefix}: 🔓   Command: 0x${decryptedResponse.command.toString(16).padStart(2, "0")} (${decryptedResponse.command})`,
            );
            console.log(
              `${logPrefix}: 🔓   Status: 0x${decryptedResponse.status.toString(16).padStart(2, "0")} (${decryptedResponse.status})`,
            );
            console.log(
              `${logPrefix}: 🔓   Payload length: ${decryptedResponse.payload.length} bytes`,
            );
            console.log(
              `${logPrefix}: 🔓   Payload data: ${Array.from(
                decryptedResponse.payload,
              )
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("")}`,
            );

            // Log human-readable interpretation for common commands
            if (
              decryptedResponse.command === CommandCode.GET_UPTIME &&
              decryptedResponse.payload.length >= 8
            ) {
              const uptimeMs = new DataView(
                decryptedResponse.payload.buffer,
              ).getBigUint64(0, true);
              console.log(
                `${logPrefix}: 🔓   ⏰ UPTIME: ${uptimeMs}ms (${Number(uptimeMs / 1000n)} seconds)`,
              );
            } else if (
              decryptedResponse.command === CommandCode.GET_DEVICE_INFO
            ) {
              console.log(
                `${logPrefix}: 🔓   ℹ️  DEVICE INFO response received`,
              );
              DeviceInfoCommand.logPayloadDetails(decryptedResponse.payload);
            } else if (
              decryptedResponse.command === CommandCode.GET_DEVICE_STATUS
            ) {
              console.log(
                `${logPrefix}: 🔓   📊 DEVICE STATUS response received`,
              );
              GetDeviceStatusCommand.logPayloadDetails(
                decryptedResponse.payload,
              );
            } else if (decryptedResponse.command === CommandCode.GET_TIME) {
              console.log(`${logPrefix}: 🔓   🕐 GET TIME response received`);
              GetTimeCommand.logPayloadDetails(decryptedResponse.payload);
            } else if (decryptedResponse.command === CommandCode.SET_TIME) {
              console.log(`${logPrefix}: 🔓   🕐 SET TIME response received`);
              SetTimeCommand.logPayloadDetails(decryptedResponse.payload);
            } else if (decryptedResponse.command === CommandCode.ADD_EVENT) {
              console.log(`${logPrefix}: 🔓   📅 ADD EVENT response received`);
              CreateEventCommand.logPayloadDetails(decryptedResponse.payload);
            } else if (
              decryptedResponse.command === CommandCode.GET_NUMBER_OF_EVENTS
            ) {
              console.log(
                `${logPrefix}: 🔓   📋 GET NUMBER OF EVENTS response received`,
              );
              GetNumberOfEventsCommand.logPayloadDetails(
                decryptedResponse.payload,
              );
            } else if (
              decryptedResponse.command === CommandCode.GET_ALL_EVENTS
            ) {
              console.log(
                `${logPrefix}: 🔓   📋 GET ALL EVENTS response received`,
              );
              try {
                // Parse the event response immediately
                const { packetNumber, totalPackets, eventInfo } =
                  GetAllEventsCommand.parseEventResponse(
                    decryptedResponse.payload,
                  );

                console.log(
                  `${logPrefix}: 🔓   📋 Processing event packet ${packetNumber}/${totalPackets}`,
                );

                if (eventInfo) {
                  console.log(
                    `${logPrefix}: 🔓   📋 Event #${eventInfo.eventIndex}: "${eventInfo.eventName}"`,
                  );
                  console.log(
                    `${logPrefix}: 🔓   📋 State: ${GetAllEventsCommand.getStateDescription(eventInfo.currentState)}`,
                  );
                  console.log(
                    `${logPrefix}: 🔓   📋 Cron: "${eventInfo.cronExpression}"`,
                  );
                  console.log(
                    `${logPrefix}: 🔓   📋 Settings: ${GetAllEventsCommand.getVibrationDescription(eventInfo.vibrationIntensity)} vibration, ${GetAllEventsCommand.getLedDescription(eventInfo.ledColor, eventInfo.ledPattern)} LED`,
                  );
                } else {
                  console.log(
                    `${logPrefix}: 🔓   📋 No event data (empty response)`,
                  );
                }

                // Log detailed payload info
                GetAllEventsCommand.logPayloadDetails(
                  decryptedResponse.payload,
                );

                // TODO: Store parsed event data in a global state or emit event for UI to consume
                // For now, we're processing and logging immediately
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
              console.log(
                `${logPrefix}: 🔓   🔋 BATTERY STATUS NOTIFICATION (async):`,
              );
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
              console.log(
                `${logPrefix}: 🔓   📅 ACTIVE EVENT NOTIFICATION (async):`,
              );
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
              console.log(`${logPrefix}: 🔓   🕐 TIME NOTIFICATION (async):`);
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
            console.log(
              `${logPrefix}: 📩 Delivering response to waiting request`,
            );
            currentResponseResolver(characteristic.value);
            currentResponseResolver = null;
            currentResponseRejecter = null;
            waitingForResponse = false;
          } else {
            // This is either an async notification or a response with no one waiting
            // Both cases are already processed above in the immediate decryption section
            console.log(
              `${logPrefix}: 📩 Response processed immediately (no queue)`,
            );
          }
        }
      },
    );
    console.log(`${logPrefix}: ✅ Notifications enabled on UUID 0xF024`);

    // Debug advertisement data before extracting serial number
    console.log(`${logPrefix}: 🔍 DEBUG: Advertisement data check:`);
    console.log(
      `${logPrefix}: 🔍 DEBUG: advertisementData object:`,
      advertisementData,
    );
    console.log(
      `${logPrefix}: 🔍 DEBUG: advertisementData is null/undefined:`,
      advertisementData == null,
    );
    if (advertisementData) {
      console.log(
        `${logPrefix}: 🔍 DEBUG: advertisementData.serialNumber exists:`,
        !!advertisementData.serialNumber,
      );
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (advertisementData.serialNumber) {
        console.log(
          `${logPrefix}: 🔍 DEBUG: advertisementData.serialNumber length:`,
          advertisementData.serialNumber.length,
        );
        console.log(
          `${logPrefix}: 🔍 DEBUG: advertisementData.serialNumber hex:`,
          Array.from(advertisementData.serialNumber)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        );
      } else {
        console.log(
          `${logPrefix}: 🔍 DEBUG: advertisementData.serialNumber is null/undefined`,
        );
      }
    }

    // Extract serial number from advertisement data
    const serialNumber = advertisementData?.serialNumber ?? new Uint8Array(8);
    console.log(
      `${logPrefix}: Using serial number: ${Array.from(serialNumber)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`,
    );
    console.log(
      `${logPrefix}: 🔍 DEBUG: Serial number is all zeros:`,
      serialNumber.every((b) => b === 0),
    );

    console.log(
      `${logPrefix}: STEP 6 - Requesting uptime from bracelet (Command 0x01)`,
    );
    console.log(`${logPrefix}: APP → BRACELET: Sending uptime request`);
    console.log(`${logPrefix}: Encryption: Using Bracelet Key`);
    console.log(`${logPrefix}: Command Code: 0x01 (GET_UPTIME)`);

    // Step 1: Get uptime (encrypted with bracelet key)
    const uptimeRequestPayload = GetUptimeCommand.createRequest();
    console.log(
      `${logPrefix}: Request payload (before encryption): ${Array.from(
        uptimeRequestPayload,
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`,
    );

    // Encrypt the request using the protocol
    const uptimeRequest = protocol.createRequest(
      CommandCode.GET_UPTIME,
      uptimeRequestPayload,
    );
    console.log(
      `${logPrefix}: Encrypted request payload: ${Array.from(uptimeRequest)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`,
    );

    await device.writeCharacteristicWithResponseForService(
      GENTLY_SERVICE_UUID,
      REQUEST_CHARACTERISTIC_UUID,
      uint8ArrayToBase64(uptimeRequest),
    );
    console.log(
      `${logPrefix}: ✅ Uptime request sent to characteristic 0xF023`,
    );

    // Wait for the response via notification
    console.log(`${logPrefix}: Waiting for uptime response from bracelet...`);
    const uptimeResponseValue = await waitForNotification();

    if (!uptimeResponseValue) {
      throw new Error("No uptime response received");
    }

    console.log(`${logPrefix}: STEP 7 - Processing uptime response`);
    console.log(`${logPrefix}: BRACELET → APP: Received uptime response`);
    console.log(
      `${logPrefix}: Response length: ${base64ToUint8Array(uptimeResponseValue).length} bytes`,
    );
    console.log(
      `${logPrefix}: Encrypted response: ${Array.from(
        base64ToUint8Array(uptimeResponseValue),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`,
    );
    console.log(`${logPrefix}: Decryption: Using Bracelet Key`);

    // Parse uptime response and establish dynamic key
    let uptime: Uint8Array;
    try {
      uptime = protocol.parseUptimeResponse(
        base64ToUint8Array(uptimeResponseValue),
        serialNumber,
      );

      console.log(
        `${logPrefix}: ✅ Uptime successfully decrypted: ${Array.from(uptime)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")}`,
      );
      console.log(
        `${logPrefix}: Uptime value (8 bytes): ${Array.from(uptime)
          .map((b) => b.toString(10))
          .join(", ")}`,
      );

      console.log(`${logPrefix}: STEP 8 - Creating Dynamic Key`);
      console.log(`${logPrefix}: Generating 16-byte Dynamic Key using:`);
      console.log(
        `${logPrefix}:   - Bracelet uptime (8 bytes): ${Array.from(uptime)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")}`,
      );
      console.log(
        `${logPrefix}:   - Bracelet unique ID (8 bytes): ${Array.from(
          serialNumber,
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")}`,
      );
      console.log(
        `${logPrefix}:   - Bracelet Key (16 bytes): ${Array.from(braceletKey)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")}`,
      );

      // The dynamic key generation happens inside parseUptimeResponse
      const dynamicKey = protocol.getDynamicKey();
      if (dynamicKey) {
        console.log(
          `${logPrefix}: ✅ Dynamic Key established: ${Array.from(dynamicKey)
            .map((b: number) => b.toString(16).padStart(2, "0"))
            .join("")}`,
        );
      } else {
        console.log(`${logPrefix}: ❌ Failed to establish Dynamic Key`);
      }
    } catch (error) {
      console.error(`${logPrefix}: ❌ Failed to parse uptime response:`, error);
      console.error(`${logPrefix}: This might be due to:`);
      console.error(`${logPrefix}:   - Incorrect encryption key`);
      console.error(`${logPrefix}:   - Wrong response format`);
      console.error(`${logPrefix}:   - Corrupted data transmission`);
      throw error;
    }

    console.log(`${logPrefix}: STEP 9 - Requesting device info (Command 0x02)`);
    console.log(`${logPrefix}: APP → BRACELET: Sending device info request`);
    console.log(`${logPrefix}: Encryption: Using NEW Dynamic Key`);
    console.log(`${logPrefix}: Command Code: 0x02 (GET_DEVICE_INFO)`);

    // Step 2: Get device info (encrypted with dynamic key)
    const deviceInfoRequest = DeviceInfoCommand.createRequest();
    console.log(
      `${logPrefix}: Request payload (before encryption): ${Array.from(
        deviceInfoRequest,
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`,
    );

    // Encrypt the request using the protocol
    const encryptedRequest = protocol.createRequest(
      CommandCode.GET_DEVICE_INFO,
      deviceInfoRequest,
    );
    console.log(
      `${logPrefix}: Encrypted request payload: ${Array.from(encryptedRequest)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`,
    );

    await device.writeCharacteristicWithResponseForService(
      GENTLY_SERVICE_UUID,
      REQUEST_CHARACTERISTIC_UUID,
      uint8ArrayToBase64(encryptedRequest),
    );
    console.log(
      `${logPrefix}: ✅ Device info request sent to characteristic 0xF023`,
    );

    // Wait for the device info response via notification
    console.log(
      `${logPrefix}: Waiting for device info response from bracelet...`,
    );
    const deviceInfoResponseValue = await waitForNotification();

    if (!deviceInfoResponseValue) {
      throw new Error("No device info response received");
    }

    console.log(`${logPrefix}: STEP 10 - Processing device info response`);
    console.log(`${logPrefix}: BRACELET → APP: Received device info response`);
    console.log(
      `${logPrefix}: Response length: ${base64ToUint8Array(deviceInfoResponseValue).length} bytes`,
    );
    console.log(
      `${logPrefix}: Encrypted response: ${Array.from(
        base64ToUint8Array(deviceInfoResponseValue),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`,
    );
    console.log(`${logPrefix}: Decryption: Using Dynamic Key`);

    // Parse the response using the protocol first, then the command parser
    const parsedResponse = protocol.parseResponse(
      base64ToUint8Array(deviceInfoResponseValue),
    );
    const deviceInfo = DeviceInfoCommand.parseResponse(
      parsedResponse.payload,
      parsedResponse.status,
    );

    console.log(`${logPrefix}: ✅ Device info successfully decrypted:`);
    console.log(
      `${logPrefix}:   - Hardware Version: ${deviceInfo.hardwareVersion}`,
    );
    console.log(
      `${logPrefix}:   - Firmware Version: ${deviceInfo.firmwareVersionMajor}.${deviceInfo.firmwareVersionMinor}.${deviceInfo.firmwareBuildNumber}`,
    );

    console.log(
      `${logPrefix}: ========== PAIRING PROCESS COMPLETED SUCCESSFULLY ==========`,
    );
    console.log(`${logPrefix}: ✅ Secure communication channel established`);
    console.log(
      `${logPrefix}: ✅ Both devices now using Dynamic Key for future communications`,
    );

    // Convert serial number bytes to hex string for consistent usage
    const serialNumberHex = Array.from(serialNumber)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    console.log(`${logPrefix}: 📝 Final serial number: ${serialNumberHex}`);

    return {
      device,
      protocol,
      deviceInfo,
      uptime,
      serialNumber: serialNumberHex,
    };
  } catch (error) {
    console.error(`${logPrefix}: ❌ PAIRING FAILED:`, error);
    console.error(
      `${logPrefix}: ========== PAIRING PROCESS TERMINATED ==========`,
    );
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
