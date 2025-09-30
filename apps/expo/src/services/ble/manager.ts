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

  console.log(
    `🔧 BLE Manager: Constructing packet for command 0x${commandCode.toString(16).padStart(2, "0")}`,
  );
  console.log(`  - API Version: 0x${apiVersion.toString(16).padStart(2, "0")}`);
  console.log(
    `  - Command Code: 0x${commandCode.toString(16).padStart(2, "0")}`,
  );

  // Basic packet: API Version (1 byte) + Command Code (1 byte) + Payload
  const payloadLength = command.payload?.length ?? 0;
  const totalLength = 2 + payloadLength;

  console.log(`  - Payload Length: ${payloadLength} bytes`);
  if (command.payload) {
    console.log(
      `  - Payload Hex: [${Array.from(command.payload)
        .map((b) => "0x" + b.toString(16).padStart(2, "0"))
        .join(", ")}]`,
    );
  }

  // Ensure packet is 8-byte aligned for TEA encryption
  const alignedLength = Math.ceil(totalLength / 8) * 8;
  const packet = new Uint8Array(alignedLength);

  packet[0] = apiVersion;
  packet[1] = commandCode;

  if (command.payload) {
    packet.set(command.payload, 2);
  }

  console.log(
    `  - Total Length: ${totalLength} bytes, Aligned: ${alignedLength} bytes`,
  );
  console.log(
    `  - Final Packet: [${Array.from(packet)
      .map((b) => "0x" + b.toString(16).padStart(2, "0"))
      .join(", ")}]`,
  );

  // Pad with zeros if needed (already done by Uint8Array constructor)

  return packet;
}

/**
 * Parses a BLE response packet according to the protocol
 */
function parseResponsePacket(encryptedData: Uint8Array): BLECommandResponse {
  console.log(`🔍 BLE Manager: Parsing response packet`);
  console.log(`  - Raw Data Length: ${encryptedData.length} bytes`);
  console.log(
    `  - Raw Data Hex: [${Array.from(encryptedData)
      .map((b) => "0x" + b.toString(16).padStart(2, "0"))
      .join(", ")}]`,
  );

  if (encryptedData.length < 3) {
    console.error(
      `❌ BLE Manager: Response packet too short (${encryptedData.length} < 3)`,
    );
    throw new Error("Response packet too short");
  }

  const apiVersion = encryptedData[0] ?? 0;
  const commandCode = encryptedData[1] ?? 0;
  const status = encryptedData[2] ?? 0;

  console.log(`  - API Version: 0x${apiVersion.toString(16).padStart(2, "0")}`);
  console.log(
    `  - Command Code: 0x${commandCode.toString(16).padStart(2, "0")}`,
  );
  console.log(
    `  - Status: 0x${status.toString(16).padStart(2, "0")} (${status === 0 ? "OK" : "ERROR"})`,
  );

  // Extract payload (everything after the header)
  const payload = encryptedData.slice(3);
  console.log(`  - Payload Length: ${payload.length} bytes`);
  if (payload.length > 0) {
    console.log(
      `  - Payload Hex: [${Array.from(payload)
        .map((b) => "0x" + b.toString(16).padStart(2, "0"))
        .join(", ")}]`,
    );
  }

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

              // Validate command code matches what we sent
              if (response.commandCode !== command.command) {
                console.warn(
                  `⚠️ Command code mismatch! Sent: 0x${command.command.toString(16).padStart(2, "0")}, Received: 0x${response.commandCode.toString(16).padStart(2, "0")}`,
                );
                console.warn(
                  `  - This may indicate a device firmware issue or protocol mismatch`,
                );
                console.warn(
                  `  - Device may not support this command or there's a timing issue`,
                );
              }

              console.log(
                `✅ Command ${command.command} completed with status: ${Number(response.status) === 0 ? "SUCCESS" : "ERROR"}`,
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
      console.log(`🔑 Using encryption key: ${encryptionKey}`);
      // Encrypt in 8-byte blocks
      const encryptedPacket = new Uint8Array(packet.length);
      for (let i = 0; i < packet.length; i += 8) {
        const block = packet.slice(i, i + 8);
        const encryptedBlock = tea.encrypt(block);
        encryptedPacket.set(encryptedBlock, i);
      }

      console.log(
        `  - Encrypted Packet: [${Array.from(encryptedPacket)
          .map((b) => "0x" + b.toString(16).padStart(2, "0"))
          .join(", ")}]`,
      );

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
