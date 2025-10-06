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
          const isCharacteristicMatch =
            data.characteristic.toUpperCase() ===
            BLE_RESPONSE_CHARACTERISTIC_UUID.toUpperCase();

          if (data.peripheral === peripheralId && isCharacteristicMatch) {
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
      console.log(`  - Sending ${dataToSend.length} bytes encrypted`);

      const writePromise =
        Platform.OS === "ios"
          ? BleManager.write(
              peripheralId,
              BLE_SERVICE_UUID,
              BLE_REQUEST_CHARACTERISTIC_UUID,
              dataToSend,
              dataToSend.length,
            )
          : BleManager.writeWithoutResponse(
              peripheralId,
              BLE_SERVICE_UUID,
              BLE_REQUEST_CHARACTERISTIC_UUID,
              dataToSend,
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
 * Sends a command to the bracelet and waits for response
 */
export async function sendCommand({
  peripheralId,
  command,
  encryptionKey,
  timeoutMs = 5000,
}: BLECommand): Promise<BLECommandResponse> {
  console.log(`📤 Sending command ${command.command} to ${peripheralId}`);

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
          // Check if this is the response characteristic for our platform
          const isCharacteristicMatch =
            data.characteristic.toUpperCase() ===
            BLE_RESPONSE_CHARACTERISTIC_UUID.toUpperCase();

          if (data.peripheral === peripheralId && isCharacteristicMatch) {
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
      console.log(`  - Sending ${dataToSend.length} bytes encrypted`);

      // Platform-specific BLE write methods - use write() for iOS, writeWithoutResponse() for Android
      const writePromise =
        Platform.OS === "ios"
          ? BleManager.write(
              peripheralId,
              BLE_SERVICE_UUID,
              BLE_REQUEST_CHARACTERISTIC_UUID,
              dataToSend,
              dataToSend.length, // Add length parameter for consistency
            )
          : BleManager.writeWithoutResponse(
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
