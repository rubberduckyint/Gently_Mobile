/**
 * BLE Manager for Gently Bracelet Communication
 * Handles BLE connection, service discovery, and command execution
 */
import type { BleManagerDidUpdateValueForCharacteristicEvent } from "react-native-ble-manager";
import { Platform } from "react-native";
import BleManager from "react-native-ble-manager";

import type { BLECommandRequest, BLECommandResponse } from "./types";
import { TEAEncryption } from "./encryption";
import {
  API_VERSION,
  BLE_REQUEST_CHARACTERISTIC_UUID,
  BLE_RESPONSE_CHARACTERISTIC_UUID,
  BLE_SERVICE_UUID,
} from "./types";

// Match the bracelet's response characteristic in either UUID form.
// react-native-ble-manager delivers notification events with `characteristic`
// in the form the device exposes it — Gently firmware uses the short 16-bit
// form (`f024`). Our Android code uses the full 128-bit form
// (`0000F024-...-9B34FB`) as the canonical constant. Strict-equal comparison
// misses notifications when the forms don't match; the write goes out, the
// bracelet replies, but our listener filters out the response and the command
// times out after 5s. This helper accepts either representation.
function isResponseCharacteristic(uuid: string): boolean {
  const upper = uuid.toUpperCase();
  return (
    upper === BLE_RESPONSE_CHARACTERISTIC_UUID.toUpperCase() ||
    upper === "0000F024-0000-1000-8000-00805F9B34FB" ||
    upper === "F024"
  );
}

export interface BLECommand {
  peripheralId: string;
  command: BLECommandRequest;
  encryptionKey: string;
  timeoutMs?: number;
}

export interface BLEServiceManager {
  startNotifications: (peripheralId: string) => Promise<void>;
  sendCommand: (params: BLECommand) => Promise<BLECommandResponse>;
  stopNotifications: (peripheralId: string) => Promise<void>;
}

/**
 * Starts notifications on the response characteristic
 */
export async function startNotifications(peripheralId: string): Promise<void> {
  console.log(`🔔 Starting notifications for device: ${peripheralId}`);

  try {
    await BleManager.startNotification(
      peripheralId,
      BLE_SERVICE_UUID,
      BLE_RESPONSE_CHARACTERISTIC_UUID,
    );
    console.log(`✅ Notifications started for ${peripheralId}`);
  } catch (error) {
    console.error(
      `❌ Failed to start notifications for ${peripheralId}:`,
      error,
    );
    throw error;
  }
}

/**
 * Stops notifications on the response characteristic
 */
export async function stopNotifications(peripheralId: string): Promise<void> {
  try {
    await BleManager.stopNotification(
      peripheralId,
      BLE_SERVICE_UUID,
      BLE_RESPONSE_CHARACTERISTIC_UUID,
    );
    console.log(`🔕 Notifications stopped for ${peripheralId}`);
  } catch (error) {
    console.error(
      `❌ Failed to stop notifications for ${peripheralId}:`,
      error,
    );
    // Don't throw - this is cleanup
  }
}

/**
 * Sends a command that expects multi-packet responses (like GET_ALL_EVENTS)
 */
export async function sendMultiPacketCommand<T>(
  peripheralId: string,
  encryptionKey: string,
  command: BLECommandRequest,
  packetHandler: (payload: Uint8Array, deviceId: string) => T | null,
  timeoutMs = 30000, // Longer timeout for multi-packet commands
): Promise<T> {
  console.log(
    `🔄 Sending multi-packet command 0x${command.command.toString(16).padStart(2, "0")} to ${peripheralId}`,
  );

  // Validate connection and services before sending command
  try {
    await validateBLEConnection(peripheralId);
  } catch (validationError) {
    console.error(
      `❌ Pre-command validation failed for multi-packet command:`,
      validationError,
    );
    throw validationError;
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Multi-packet command timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    let responseListener: { remove: () => void } | null = null;

    const cleanup = () => {
      clearTimeout(timeout);
      if (responseListener) {
        try {
          responseListener.remove();
        } catch (cleanupError) {
          console.warn(
            "Warning: Failed to remove BLE response listener:",
            cleanupError,
          );
        }
        responseListener = null;
      }
    };

    try {
      // Set up response listener for multiple packets
      responseListener = BleManager.onDidUpdateValueForCharacteristic(
        (data: BleManagerDidUpdateValueForCharacteristicEvent) => {
          if (
            data.peripheral === peripheralId &&
            isResponseCharacteristic(data.characteristic)
          ) {
            try {
              console.log(
                `📥 Received multi-packet response from ${peripheralId}`,
              );

              // Decrypt the response
              const tea = new TEAEncryption(encryptionKey);
              const encryptedData = new Uint8Array(data.value);

              const decryptedData = new Uint8Array(encryptedData.length);
              for (let i = 0; i < encryptedData.length; i += 8) {
                const block = encryptedData.slice(i, i + 8);
                const decryptedBlock = tea.decrypt(block);
                decryptedData.set(decryptedBlock, i);
              }

              const response = parseResponsePacket(decryptedData);

              // Validate command code matches
              if (response.commandCode !== command.command) {
                console.warn(
                  `⚠️ Command mismatch! Sent 0x${command.command.toString(16).padStart(2, "0")}, received 0x${response.commandCode.toString(16).padStart(2, "0")}`,
                );
              }

              // Use the packet handler to process this packet (payload has headers stripped)
              const result = packetHandler(response.payload, peripheralId);

              // If handler returns a result, we're done
              if (result !== null) {
                console.log(
                  `✅ Multi-packet command 0x${command.command.toString(16).padStart(2, "0")} completed`,
                );
                cleanup();
                resolve(result);
              }
              // Otherwise, continue waiting for more packets
            } catch (error) {
              console.error(
                `❌ Error processing multi-packet response for command ${command.command}:`,
                error,
              );
              cleanup();
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          }
        },
      );

      // Send the command (same as single-packet)
      const packet = constructCommandPacket(command);
      const tea = new TEAEncryption(encryptionKey);

      const encryptedPacket = new Uint8Array(packet.length);
      for (let i = 0; i < packet.length; i += 8) {
        const block = packet.slice(i, i + 8);
        const encryptedBlock = tea.encrypt(block);
        encryptedPacket.set(encryptedBlock, i);
      }

      const dataToSend = Array.from(encryptedPacket);

      // Bracelet's F023 characteristic exposes only WRITE (not
      // WRITE_WITHOUT_RESPONSE) per nRF Connect inspection. Calling
      // writeWithoutResponse on a WRITE-only characteristic causes Android's
      // BLE stack to silently drop the bytes — no error to JS, no bytes to
      // peripheral. Always use Write Request (BleManager.write).
      const writePromise = BleManager.write(
        peripheralId,
        BLE_SERVICE_UUID,
        BLE_REQUEST_CHARACTERISTIC_UUID,
        dataToSend,
        dataToSend.length,
      );

      writePromise.catch((error) => {
        console.error(`❌ Failed to send multi-packet command:`, error);
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    } catch (error) {
      console.error(`❌ Failed to setup multi-packet command:`, error);
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Constructs a BLE command packet according to the protocol
 */
function constructCommandPacket(command: BLECommandRequest): Uint8Array {
  const apiVersion = command.apiVersion ?? API_VERSION;
  const commandCode = command.command;
  const payloadLength = command.payload?.length ?? 0;
  const totalLength = 2 + payloadLength;

  console.log(
    `🔧 Building packet: Command 0x${commandCode.toString(16).padStart(2, "0")}, Payload ${payloadLength} bytes`,
  );

  // Ensure packet is 8-byte aligned for TEA encryption
  const alignedLength = Math.ceil(totalLength / 8) * 8;
  const packet = new Uint8Array(alignedLength);

  packet[0] = apiVersion;
  packet[1] = commandCode;

  if (command.payload) {
    packet.set(command.payload, 2);
  }

  console.log(
    `  - Packet size: ${totalLength} → ${alignedLength} bytes (8-byte aligned)`,
  );

  return packet;
}

/**
 * Parses a BLE response packet according to the protocol
 */
function parseResponsePacket(encryptedData: Uint8Array): BLECommandResponse {
  if (encryptedData.length < 3) {
    console.error(
      `❌ Response packet too short (${encryptedData.length} < 3 bytes)`,
    );
    throw new Error("Response packet too short");
  }

  const apiVersion = encryptedData[0] ?? 0;
  const commandCode = encryptedData[1] ?? 0;
  const status = encryptedData[2] ?? 0;
  const payload = encryptedData.slice(3);

  console.log(
    `🔍 Response: Command 0x${commandCode.toString(16).padStart(2, "0")}, Status ${status === 0 ? "OK" : "ERROR"} (0x${status.toString(16).padStart(2, "0")}), Payload ${payload.length} bytes`,
  );

  return {
    apiVersion,
    commandCode,
    status,
    payload,
  };
}

/**
 * Validates BLE connection and service availability
 */
async function validateBLEConnection(peripheralId: string): Promise<void> {
  // Check if device is still connected
  const isConnected = await BleManager.isPeripheralConnected(peripheralId);
  if (!isConnected) {
    throw new Error(`Device ${peripheralId} is not connected`);
  }

  // Retrieve and check services
  try {
    const peripheralInfo = await BleManager.retrieveServices(peripheralId);
    // Accept the bracelet's service UUID in either form: full 128-bit
    // (`0000F021-...-9B34FB`) or short 16-bit (`F021`). react-native-ble-manager
    // returns whatever form the device advertised — Gently firmware uses the
    // short form, so on Android the services list contains `f021`. Strict
    // comparison against just the full form misses this and fails validation.
    const hasService = peripheralInfo.services?.some((service) => {
      const uuid = service.uuid.toUpperCase();
      return (
        uuid === BLE_SERVICE_UUID.toUpperCase() ||
        uuid === "0000F021-0000-1000-8000-00805F9B34FB" ||
        uuid === "F021"
      );
    });

    if (!hasService) {
      console.warn(
        `⚠️ BLE service ${BLE_SERVICE_UUID} not found. Available services:`,
        peripheralInfo.services?.map((s) => s.uuid) ?? [],
      );
      throw new Error(
        `BLE service ${BLE_SERVICE_UUID} not available on device ${peripheralId}`,
      );
    }

    console.log(`✅ BLE connection and service validated for ${peripheralId}`);
  } catch (error) {
    console.error(`❌ Service validation failed for ${peripheralId}:`, error);
    throw error;
  }
}

/**
 * Sends a command to the bracelet and waits for response
 */
export async function sendCommand({
  peripheralId,
  command,
  encryptionKey,
  timeoutMs = 5000,
}: BLECommand): Promise<BLECommandResponse> {
  console.log(`📤 Sending command ${command.command} to ${peripheralId}`);

  // Validate connection and services before sending command
  try {
    await validateBLEConnection(peripheralId);
  } catch (validationError) {
    console.error(`❌ Pre-command validation failed:`, validationError);
    throw validationError;
  }

  return new Promise<BLECommandResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(`Command ${command.command} timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    let responseListener: { remove: () => void } | null = null;

    const cleanup = () => {
      clearTimeout(timeout);
      if (responseListener) {
        try {
          responseListener.remove();
        } catch (cleanupError) {
          console.warn(
            "Warning: Failed to remove BLE response listener:",
            cleanupError,
          );
        }
        responseListener = null;
      }
    };

    try {
      // Set up response listener
      responseListener = BleManager.onDidUpdateValueForCharacteristic(
        (data: BleManagerDidUpdateValueForCharacteristicEvent) => {
          if (
            data.peripheral === peripheralId &&
            isResponseCharacteristic(data.characteristic)
          ) {
            try {
              console.log(`📥 Received response from ${peripheralId}`);

              // Decrypt the response
              const tea = new TEAEncryption(encryptionKey);
              const encryptedData = new Uint8Array(data.value);

              // Decrypt in 8-byte blocks
              const decryptedData = new Uint8Array(encryptedData.length);
              for (let i = 0; i < encryptedData.length; i += 8) {
                const block = encryptedData.slice(i, i + 8);
                const decryptedBlock = tea.decrypt(block);
                decryptedData.set(decryptedBlock, i);
              }

              const response = parseResponsePacket(decryptedData);

              // Validate command code matches what we sent
              if (response.commandCode !== command.command) {
                console.warn(
                  `⚠️ Command mismatch! Sent 0x${command.command.toString(16).padStart(2, "0")}, received 0x${response.commandCode.toString(16).padStart(2, "0")} - device may not support this command`,
                );
              }

              console.log(
                `✅ Command 0x${command.command.toString(16).padStart(2, "0")} completed: ${Number(response.status) === 0 ? "SUCCESS" : "ERROR"}`,
              );

              cleanup();
              resolve(response);
            } catch (error) {
              console.error(
                `❌ Error parsing response for command ${command.command}:`,
                error,
              );
              cleanup();
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          }
        },
      );

      // Construct and encrypt the command packet
      const packet = constructCommandPacket(command);
      const tea = new TEAEncryption(encryptionKey);

      console.log(
        `� Sending command 0x${command.command.toString(16).padStart(2, "0")} to ${peripheralId}`,
      );

      // Encrypt in 8-byte blocks
      const encryptedPacket = new Uint8Array(packet.length);
      for (let i = 0; i < packet.length; i += 8) {
        const block = packet.slice(i, i + 8);
        const encryptedBlock = tea.encrypt(block);
        encryptedPacket.set(encryptedBlock, i);
      }

      // Send the encrypted packet
      const dataToSend = Array.from(encryptedPacket);

      // Bracelet's F023 characteristic exposes only WRITE (not
      // WRITE_WITHOUT_RESPONSE) per nRF Connect inspection. Use Write Request
      // on both platforms.
      const writePromise = BleManager.write(
        peripheralId,
        BLE_SERVICE_UUID,
        BLE_REQUEST_CHARACTERISTIC_UUID,
        dataToSend,
        dataToSend.length,
      );

      writePromise.catch((error) => {
        console.error(`❌ Failed to send command ${command.command}:`, error);
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    } catch (error) {
      console.error(`❌ Error setting up command ${command.command}:`, error);
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export const bleManager: BLEServiceManager = {
  startNotifications,
  sendCommand,
  stopNotifications,
};
