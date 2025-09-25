import type { AdvertisementData } from "./types";

/**
 * TEA (Tiny Encryption Algorithm) Implementation
 * Based on the BLE protocol specification for Gently Bracelet
 */

/**
 * TEA encryption/decryption class
 * Works on 8-byte data blocks with 16-byte keys
 */
export class TEAEncryption {
  private key: Uint8Array;

  constructor(key: string | Uint8Array) {
    if (typeof key === "string") {
      // Convert hex string to Uint8Array
      this.key = this.hexStringToBytes(key);
    } else {
      this.key = new Uint8Array(key);
    }

    if (this.key.length !== 16) {
      throw new Error("Key must be 16 bytes long");
    }
  }

  /**
   * Get the key bytes (for internal use)
   */
  public getKeyBytes(): Uint8Array {
    return this.key;
  }

  /**
   * Convert hex string to byte array
   */
  public hexStringToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
      throw new Error("Hex string must have even length");
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Convert byte array to hex string
   */
  private bytesToHexString(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  /**
   * Convert 4 bytes to uint32 (little endian)
   */
  private bytesToUint32(bytes: Uint8Array, offset: number): number {
    return (
      ((bytes[offset] ?? 0) |
        ((bytes[offset + 1] ?? 0) << 8) |
        ((bytes[offset + 2] ?? 0) << 16) |
        ((bytes[offset + 3] ?? 0) << 24)) >>>
      0
    ); // Ensure unsigned 32-bit
  }

  /**
   * Convert uint32 to 4 bytes (little endian)
   */
  private uint32ToBytes(value: number): Uint8Array {
    const bytes = new Uint8Array(4);
    bytes[0] = value & 0xff;
    bytes[1] = (value >> 8) & 0xff;
    bytes[2] = (value >> 16) & 0xff;
    bytes[3] = (value >> 24) & 0xff;
    return bytes;
  }

  /**
   * Encrypt a 64-bit block (8 bytes) using TEA with a 128-bit key
   */
  encrypt(data: Uint8Array): Uint8Array {
    if (data.length !== 8) {
      throw new Error("Input data must be 8 bytes");
    }

    // Convert data to two 32-bit words
    let y = this.bytesToUint32(data, 0);
    let z = this.bytesToUint32(data, 4);

    // Convert key to four 32-bit words
    const k0 = this.bytesToUint32(this.key, 0);
    const k1 = this.bytesToUint32(this.key, 4);
    const k2 = this.bytesToUint32(this.key, 8);
    const k3 = this.bytesToUint32(this.key, 12);

    let sum = 0;
    const delta = 0x9e3779b9;
    const rounds = 32;

    for (let i = 0; i < rounds; i++) {
      sum = (sum + delta) >>> 0;
      y = (y + (((z << 4) + k0) ^ (z + sum) ^ ((z >>> 5) + k1))) >>> 0;
      z = (z + (((y << 4) + k2) ^ (y + sum) ^ ((y >>> 5) + k3))) >>> 0;
    }

    // Convert back to bytes
    const result = new Uint8Array(8);
    result.set(this.uint32ToBytes(y), 0);
    result.set(this.uint32ToBytes(z), 4);

    return result;
  }

  /**
   * Decrypt a 64-bit block (8 bytes) using TEA with a 128-bit key
   */
  decrypt(data: Uint8Array): Uint8Array {
    if (data.length !== 8) {
      throw new Error("Input data must be 8 bytes");
    }

    // Convert data to two 32-bit words
    let y = this.bytesToUint32(data, 0);
    let z = this.bytesToUint32(data, 4);

    // Convert key to four 32-bit words
    const k0 = this.bytesToUint32(this.key, 0);
    const k1 = this.bytesToUint32(this.key, 4);
    const k2 = this.bytesToUint32(this.key, 8);
    const k3 = this.bytesToUint32(this.key, 12);

    let sum = 0xc6ef3720; // delta * rounds
    const delta = 0x9e3779b9;
    const rounds = 32;

    for (let i = 0; i < rounds; i++) {
      z = (z - (((y << 4) + k2) ^ (y + sum) ^ ((y >>> 5) + k3))) >>> 0;
      y = (y - (((z << 4) + k0) ^ (z + sum) ^ ((z >>> 5) + k1))) >>> 0;
      sum = (sum - delta) >>> 0;
    }

    // Convert back to bytes
    const result = new Uint8Array(8);
    result.set(this.uint32ToBytes(y), 0);
    result.set(this.uint32ToBytes(z), 4);

    return result;
  }

  /**
   * Encrypt data of any length (must be multiple of 8 bytes)
   * Pads with zeros if needed
   */
  encryptData(data: Uint8Array): Uint8Array {
    // Pad to 8-byte alignment
    const paddedLength = Math.ceil(data.length / 8) * 8;
    const paddedData = new Uint8Array(paddedLength);
    paddedData.set(data);

    const result = new Uint8Array(paddedLength);
    for (let i = 0; i < paddedLength; i += 8) {
      const block = paddedData.slice(i, i + 8);
      const encryptedBlock = this.encrypt(block);
      result.set(encryptedBlock, i);
    }

    return result;
  }

  /**
   * Decrypt data of any length (must be multiple of 8 bytes)
   */
  decryptData(data: Uint8Array): Uint8Array {
    if (data.length % 8 !== 0) {
      throw new Error("Encrypted data length must be multiple of 8 bytes");
    }

    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 8) {
      const block = data.slice(i, i + 8);
      const decryptedBlock = this.decrypt(block);
      result.set(decryptedBlock, i);
    }

    return result;
  }
}

/**
 * Generate dynamic key using the formula from the protocol:
 * DynamicKey[0:15] = (BraceletKey[0:15]) XOR {Uptime[0:7], (Uptime[0:7] XOR SerialNumber[0:7])}
 */
export function generateDynamicKey(
  braceletKey: string,
  uptime: Uint8Array, // 8 bytes
  serialNumber: string, // 8 bytes as hex string
): string {
  if (uptime.length !== 8) {
    throw new Error("Uptime must be 8 bytes");
  }

  // Convert inputs to byte arrays
  const braceletKeyTea = new TEAEncryption(braceletKey);
  const braceletKeyBytes = braceletKeyTea.getKeyBytes();

  const serialNumberBytes = braceletKeyTea.hexStringToBytes(serialNumber);

  // XOR uptime with serial number
  const uptimeXorSerial = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    uptimeXorSerial[i] = (uptime[i] ?? 0) ^ (serialNumberBytes[i] ?? 0);
  }

  // Concatenate uptime and (uptime XOR serial) to form 16-byte array
  const combined = new Uint8Array(16);
  combined.set(uptime, 0);
  combined.set(uptimeXorSerial, 8);

  // XOR bracelet key with combined array
  const dynamicKey = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    dynamicKey[i] = (braceletKeyBytes[i] ?? 0) ^ (combined[i] ?? 0);
  }

  // Convert to hex string
  return Array.from(dynamicKey)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Parse advertisement data from encrypted 24-byte manufacturer specific payload
 */
export function parseAdvertisementData(
  encryptedPayload: Uint8Array,
): AdvertisementData {
  if (encryptedPayload.length !== 24) {
    throw new Error("Advertisement payload must be 24 bytes");
  }

  // Decrypt using factory key
  const factoryTea = new TEAEncryption("43EA5F35659859874A6F184742C32B2B");

  // Decrypt in 8-byte blocks
  const decrypted = new Uint8Array(24);
  for (let i = 0; i < 24; i += 8) {
    const block = encryptedPayload.slice(i, i + 8);
    const decryptedBlock = factoryTea.decrypt(block);
    decrypted.set(decryptedBlock, i);
  }

  // Parse the decrypted data according to protocol specification
  const safeBcdToDecimal = (value: number | undefined): number => {
    if (typeof value !== "number") return 0;
    const high = (value >> 4) & 0x0f;
    const low = value & 0x0f;
    if (high > 9 || low > 9) {
      return value;
    }
    return high * 10 + low;
  };

  return {
    apiVersion: decrypted[0] ?? 0,
    packetCounter: (decrypted[1] ?? 0) | ((decrypted[2] ?? 0) << 8),
    errorCode: (decrypted[3] ?? 0) | ((decrypted[4] ?? 0) << 8),
    serialNumber: Array.from(decrypted.slice(5, 13))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase(),
    timeHour: safeBcdToDecimal(decrypted[13]),
    timeMinute: safeBcdToDecimal(decrypted[14]),
    timeSeconds: safeBcdToDecimal(decrypted[15]),
    year: 2000 + safeBcdToDecimal(decrypted[16]),
    month: safeBcdToDecimal(decrypted[17]),
    date: safeBcdToDecimal(decrypted[18]),
    weekDay: decrypted[19] ?? 0,
    batteryVoltage: (decrypted[20] ?? 0) | ((decrypted[21] ?? 0) << 8),
    // Parse status flags
    chargingStatus: !!((decrypted[22] ?? 0) & 0x04),
    batteryLevel: ((decrypted[22] ?? 0) >> 3) & 0x07,
    braceletKeyType: (decrypted[22] ?? 0) & 0x40 ? "custom" : "factory",
    anyEventActive: !!((decrypted[22] ?? 0) & 0x80),
  };
}
