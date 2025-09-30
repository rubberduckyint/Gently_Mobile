/**
 * BLE Manager for Gently Bracelet Communication
 * Handles BLE connection, service discovery, and command execution
 */

import type { BleManagerDidUpdateValueForCharacteristicEvent } from "react-native-ble-manager";
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
 * Constructs a BLE command packet according to the protocol
 */
function constructCommandPacket(command: BLECommandRequest): Uint8Array {
  const apiVersion = command.apiVersion ?? API_VERSION;
  const commandCode = command.command;

  // Basic packet: API Version (1 byte) + Command Code (1 byte) + Payload
  const payloadLength = command.payload?.length ?? 0;
  const totalLength = 2 + payloadLength;

  // Ensure packet is 8-byte aligned for TEA encryption
  const alignedLength = Math.ceil(totalLength / 8) * 8;
  const packet = new Uint8Array(alignedLength);

  packet[0] = apiVersion;
  packet[1] = commandCode;

  if (command.payload) {
    packet.set(command.payload, 2);
  }

  // Pad with zeros if needed (already done by Uint8Array constructor)

  return packet;
}

/**
 * Parses a BLE response packet according to the protocol
 */
function parseResponsePacket(encryptedData: Uint8Array): BLECommandResponse {
  if (encryptedData.length < 3) {
    throw new Error("Response packet too short");
  }

  const apiVersion = encryptedData[0] ?? 0;
  const commandCode = encryptedData[1] ?? 0;
  const status = encryptedData[2] ?? 0;

  // Extract payload (everything after the header)
  const payload = encryptedData.slice(3);

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
          if (
            data.peripheral === peripheralId &&
            data.characteristic.toUpperCase() ===
              BLE_RESPONSE_CHARACTERISTIC_UUID.toUpperCase()
          ) {
            try {
              console.log(
                `📥 Received response from ${peripheralId}:`,
                data.value,
              );

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
              console.log(
                `✅ Command ${command.command} completed successfully`,
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

      // Encrypt in 8-byte blocks
      const encryptedPacket = new Uint8Array(packet.length);
      for (let i = 0; i < packet.length; i += 8) {
        const block = packet.slice(i, i + 8);
        const encryptedBlock = tea.encrypt(block);
        encryptedPacket.set(encryptedBlock, i);
      }

      // Send the encrypted packet
      BleManager.writeWithoutResponse(
        peripheralId,
        BLE_SERVICE_UUID,
        BLE_REQUEST_CHARACTERISTIC_UUID,
        Array.from(encryptedPacket),
      ).catch((error) => {
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
