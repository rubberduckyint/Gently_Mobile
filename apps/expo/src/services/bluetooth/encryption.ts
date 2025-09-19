// TEA (Tiny Encryption Algorithm) implementation for Gently BLE protocol
// Based on the specification in BLE_protocol.md

/**
 * TEA Encryption/Decryption class
 * Implements the Tiny Encryption Algorithm for secure BLE communication
 */
export class Tea {
  private key: Uint8Array;

  constructor(key: Uint8Array) {
    if (key.length !== 16) {
      throw new Error("Key must be a 16-byte array");
    }
    this.key = new Uint8Array(key);
  }

  /**
   * Convert byte array to array of uint32 values (little-endian)
   */
  private bytesToUint32(bytes: Uint8Array): number[] {
    const result: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      const uint32 =
        (bytes[i] ?? 0) |
        ((bytes[i + 1] ?? 0) << 8) |
        ((bytes[i + 2] ?? 0) << 16) |
        ((bytes[i + 3] ?? 0) << 24);
      result.push(uint32 >>> 0); // Convert to unsigned 32-bit
    }
    return result;
  }

  /**
   * Convert array of uint32 values to byte array (little-endian)
   */
  private uint32ToBytes(uint32Array: number[]): Uint8Array {
    const bytes = new Uint8Array(uint32Array.length * 4);
    for (let i = 0; i < uint32Array.length; i++) {
      const value = uint32Array[i];
      if (value !== undefined) {
        bytes[i * 4] = value & 0xff;
        bytes[i * 4 + 1] = (value >>> 8) & 0xff;
        bytes[i * 4 + 2] = (value >>> 16) & 0xff;
        bytes[i * 4 + 3] = (value >>> 24) & 0xff;
      }
    }
    return bytes;
  }

  /**
   * Encrypt an 8-byte block using TEA
   * @param data - Input data (must be 8 bytes)
   * @returns Encrypted 8-byte output
   */
  encrypt(data: Uint8Array): Uint8Array {
    if (data.length !== 8) {
      throw new Error("Input data must be 8 bytes");
    }

    const v = this.bytesToUint32(data);
    const k = this.bytesToUint32(this.key);

    let y = (v[0] ?? 0) >>> 0;
    let z = (v[1] ?? 0) >>> 0;
    let sum = 0;
    const delta = 0x9e3779b9;
    const n = 32;

    for (let i = 0; i < n; i++) {
      sum = (sum + delta) >>> 0;
      y =
        (y +
          (((z << 4) + (k[0] ?? 0)) ^
            (z + sum) ^
            ((z >>> 5) + (k[1] ?? 0)))) >>>
        0;
      z =
        (z +
          (((y << 4) + (k[2] ?? 0)) ^
            (y + sum) ^
            ((y >>> 5) + (k[3] ?? 0)))) >>>
        0;
    }

    return this.uint32ToBytes([y, z]);
  }

  /**
   * Decrypt an 8-byte block using TEA
   * @param data - Input data (must be 8 bytes)
   * @returns Decrypted 8-byte output
   */
  decrypt(data: Uint8Array): Uint8Array {
    if (data.length !== 8) {
      throw new Error("Input data must be 8 bytes");
    }

    const v = this.bytesToUint32(data);
    const k = this.bytesToUint32(this.key);

    let y = (v[0] ?? 0) >>> 0;
    let z = (v[1] ?? 0) >>> 0;
    let sum = 0xc6ef3720 >>> 0;
    const delta = 0x9e3779b9;
    const n = 32;

    for (let i = 0; i < n; i++) {
      z =
        (z -
          (((y << 4) + (k[2] ?? 0)) ^
            (y + sum) ^
            ((y >>> 5) + (k[3] ?? 0)))) >>>
        0;
      y =
        (y -
          (((z << 4) + (k[0] ?? 0)) ^
            (z + sum) ^
            ((z >>> 5) + (k[1] ?? 0)))) >>>
        0;
      sum = (sum - delta) >>> 0;
    }

    return this.uint32ToBytes([y, z]);
  }

  /**
   * Encrypt variable-length data by padding to 8-byte alignment
   * @param data - Input data of any length
   * @returns Encrypted data padded to 8-byte alignment
   */
  encryptData(data: Uint8Array): Uint8Array {
    // Pad data to 8-byte alignment
    const paddedLength = Math.ceil(data.length / 8) * 8;
    const paddedData = new Uint8Array(paddedLength);
    paddedData.set(data);
    // Remaining bytes are already 0 (padding)

    const encrypted = new Uint8Array(paddedLength);
    for (let i = 0; i < paddedLength; i += 8) {
      const block = paddedData.slice(i, i + 8);
      const encryptedBlock = this.encrypt(block);
      encrypted.set(encryptedBlock, i);
    }

    return encrypted;
  }
}

/**
 * Decrypt variable-length data and remove padding
 * @param data - Input encrypted data (must be 8-byte aligned)
 * @param originalLength - Original length before padding (optional)
 * @returns Decrypted data with padding removed
 */
export function decryptData(
  data: Uint8Array,
  key: Uint8Array,
  originalLength?: number,
): Uint8Array {
  const blockSize = 8;
  let decrypted = new Uint8Array(0);
  const tea = new Tea(key);

  for (let i = 0; i < data.length; i += blockSize) {
    const chunk = data.slice(i, i + blockSize);
    if (chunk.length === blockSize) {
      const decryptedChunk = tea.decrypt(chunk);
      const combined = new Uint8Array(decrypted.length + decryptedChunk.length);
      combined.set(decrypted);
      combined.set(decryptedChunk, decrypted.length);
      decrypted = combined;
    }
  }

  // Remove trailing zeros (padding) unless they might be valid data
  if (originalLength !== undefined && originalLength <= decrypted.length) {
    return decrypted.slice(0, originalLength);
  }

  // For uptime responses, we should NOT remove trailing zeros as they might be valid data
  // Return the full decrypted data to preserve uptime
  return decrypted;
}

/**
 * Generate dynamic key from bracelet key, uptime, and bluetooth device ID
 * @param braceletKey - 16-byte bracelet key
 * @param uptime - 8-byte uptime from device
 * @param bluetoothDeviceId - 8-byte bluetooth device ID
 * @returns 16-byte dynamic key
 */
export function generateDynamicKey(
  braceletKey: Uint8Array,
  uptime: Uint8Array,
  bluetoothDeviceId: Uint8Array,
): Uint8Array {
  if (braceletKey.length !== 16) {
    throw new Error("Bracelet key must be 16 bytes");
  }
  if (uptime.length !== 8) {
    throw new Error("Uptime must be 8 bytes");
  }
  if (bluetoothDeviceId.length !== 8) {
    throw new Error("Bluetooth device ID must be 8 bytes");
  }

  // Create the second part: uptime XOR bluetoothDeviceId
  const uptimeXorDeviceId = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    uptimeXorDeviceId[i] = (uptime[i] ?? 0) ^ (bluetoothDeviceId[i] ?? 0);
  }

  // Concatenate uptime and (uptime XOR bluetoothDeviceId) to form 16 bytes
  const combinedBytes = new Uint8Array(16);
  combinedBytes.set(uptime, 0);
  combinedBytes.set(uptimeXorDeviceId, 8);

  // XOR bracelet key with combined bytes
  const dynamicKey = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    dynamicKey[i] = (braceletKey[i] ?? 0) ^ (combinedBytes[i] ?? 0);
  }

  return dynamicKey;
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  // Remove any whitespace and padding
  const cleanBase64 = base64.replace(/\s/g, "");

  // Use atob for browser/React Native
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binaryString = "";
  for (const byte of bytes) {
    binaryString += String.fromCharCode(byte);
  }
  return btoa(binaryString);
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToUint8Array(hex: string): Uint8Array {
  // Remove any whitespace and hex prefix
  const cleanHex = hex.replace(/\s/g, "").replace(/^0x/i, "");

  if (cleanHex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }

  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
