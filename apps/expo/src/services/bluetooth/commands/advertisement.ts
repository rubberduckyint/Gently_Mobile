// Advertisement parsing and manufacturer data handling
import { base64ToUint8Array } from "../../../utils/base64";
import { Tea } from "../encryption";

// Factory key for decrypting advertisements
const FACTORY_KEY = new Uint8Array([
  0x43, 0xea, 0x5f, 0x35, 0x65, 0x98, 0x59, 0x87, 0x4a, 0x6f, 0x18, 0x47, 0x42,
  0xc3, 0x2b, 0x2b,
]);

/**
 * Decrypt advertisement payload using factory key
 */
export function decryptAdvertisementPayload(
  encryptedPayload: Uint8Array,
): Uint8Array {
  if (encryptedPayload.length !== 24) {
    throw new Error("Advertisement payload must be 24 bytes");
  }

  // Decrypt in 8-byte blocks using TEA
  const decrypted = new Uint8Array(24);
  const tea = new Tea(FACTORY_KEY);

  for (let i = 0; i < 24; i += 8) {
    const block = encryptedPayload.slice(i, i + 8);
    const decryptedBlock = tea.decrypt(block);
    decrypted.set(decryptedBlock, i);
  }

  return decrypted;
}

/**
 * Parse manufacturer data from BLE advertisement according to Gently protocol
 */
export function parseManufacturerData(
  data: string,
): Record<string, unknown> | null {
  try {
    // Convert base64 manufacturer data to useful information
    const uint8Array = base64ToUint8Array(data);

    if (uint8Array.length < 26) {
      // 2 bytes company ID + 24 bytes payload
      return null;
    }

    // Parse company ID (first 2 bytes)
    const byte0 = uint8Array[0] ?? 0;
    const byte1 = uint8Array[1] ?? 0;
    const companyId = byte0 | (byte1 << 8);

    // Check if this is a Motsai Research device (0x0274)
    if (companyId !== 0x0274) {
      return {
        companyId,
        isGentlyDevice: false,
        rawData: data,
      };
    }

    try {
      // Extract the 24-byte encrypted payload
      const encryptedPayload = uint8Array.slice(2, 26);

      // Decrypt the payload using the factory key
      const decryptedPayload = decryptAdvertisementPayload(encryptedPayload);

      // Parse the decrypted payload
      const parsedData = parseGentlyAdvertisementPayload(decryptedPayload);

      return {
        companyId,
        isGentlyDevice: true,
        rawData: data,
        parsedData,
      };
    } catch (decryptError) {
      console.error("Failed to decrypt Gently advertisement:", decryptError);
      return {
        companyId,
        isGentlyDevice: true,
        rawData: data,
        decryptionError: String(decryptError),
      };
    }
  } catch (error) {
    console.error("Error parsing manufacturer data:", error);
    return null;
  }
}

/**
 * Parse decrypted Gently advertisement payload according to protocol specification
 */
export function parseGentlyAdvertisementPayload(decryptedPayload: Uint8Array): {
  apiVersion: number;
  packetCounter: number;
  errorCode: number;
  serialNumber: string;
  time: {
    hour: number;
    minute: number;
    second: number;
    year: number;
    month: number;
    date: number;
    weekDay: number;
  };
  batteryVoltage: number;
  status: {
    charging: boolean;
    batteryLevel: number;
    braceletKeyType: "factory" | "modified";
    anyEventActive: boolean;
  };
} | null {
  try {
    if (decryptedPayload.length !== 24) {
      throw new Error("Decrypted payload must be 24 bytes");
    }

    // Parse according to the Gently BLE protocol specification
    // API Version (byte 0)
    const apiVersion = decryptedPayload[0] ?? 0;

    // Packet counter (bytes 1-2)
    const packetCounter =
      (decryptedPayload[1] ?? 0) | ((decryptedPayload[2] ?? 0) << 8);

    // Error code (byte 3)
    const errorCode = decryptedPayload[3] ?? 0;

    // Serial number (bytes 4-11) - 8 bytes as hex string
    const serialBytes = decryptedPayload.slice(4, 12);
    const serialNumber = Array.from(serialBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    // Time data (bytes 12-18)
    const hour = decryptedPayload[12] ?? 0;
    const minute = decryptedPayload[13] ?? 0;
    const second = decryptedPayload[14] ?? 0;
    const year = 2000 + (decryptedPayload[15] ?? 0); // Year offset from 2000
    const month = decryptedPayload[16] ?? 1;
    const date = decryptedPayload[17] ?? 1;
    const weekDay = decryptedPayload[18] ?? 0;

    // Battery voltage (bytes 19-20)
    const batteryVoltage =
      (decryptedPayload[19] ?? 0) | ((decryptedPayload[20] ?? 0) << 8);

    // Status byte (byte 21)
    const statusByte = decryptedPayload[21] ?? 0;
    const charging = (statusByte & 0x04) !== 0; // Bit 2
    const batteryLevel = (statusByte >> 3) & 0x07; // Bits 3-5
    const braceletKeyType = (statusByte & 0x40) !== 0 ? "modified" : "factory"; // Bit 6
    const anyEventActive = (statusByte & 0x80) !== 0; // Bit 7

    return {
      apiVersion,
      packetCounter,
      errorCode,
      serialNumber,
      time: {
        hour,
        minute,
        second,
        year,
        month,
        date,
        weekDay,
      },
      batteryVoltage,
      status: {
        charging,
        batteryLevel,
        braceletKeyType,
        anyEventActive,
      },
    };
  } catch (error) {
    console.error("Error parsing Gently advertisement payload:", error);
    return null;
  }
}
