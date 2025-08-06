/**
 * Tiny Encryption Algorithm (TEA) implementation for Gently BLE Protocol
 * Based on the specification in Gently_BLE_Protocol_Full.md
 *
 * TEA uses a 16-byte private key and works on 8-byte payload chunks.
 * All messages must be aligned to 8, 16, 24, or 32 bytes, padded with 0x00 if necessary.
 */
export class TeaEncryption {
  private key: Uint8Array;

  constructor(key: Uint8Array) {
    if (key.length !== 16) {
      throw new Error("Key must be a 16-byte array");
    }
    this.key = new Uint8Array(key);
  }

  /**
   * Update the encryption key
   */
  setKey(key: Uint8Array): void {
    if (key.length !== 16) {
      throw new Error("Key must be a 16-byte array");
    }
    this.key = new Uint8Array(key);
  }

  /**
   * Get the current encryption key
   */
  getKey(): Uint8Array {
    return new Uint8Array(this.key);
  }

  /**
   * Encrypt a 64-bit block (8 bytes) using TEA with a 128-bit key.
   * @param data Byte array of size 8
   * @returns Encrypted 8-byte output
   */
  encrypt(data: Uint8Array): Uint8Array {
    if (data.length !== 8) {
      throw new Error("Input data must be 8 bytes");
    }

    const v = this.bytesToUint32Array(data);
    const k = this.bytesToUint32Array(this.key);

    if (v.length < 2 || k.length < 4) {
      throw new Error("Invalid array lengths for encryption");
    }

    let y = (v[0] ?? 0) >>> 0; // Convert to unsigned 32-bit
    let z = (v[1] ?? 0) >>> 0;
    let sum = 0;
    const delta = 0x9e3779b9;
    let n = 32;

    while (n > 0) {
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
      n -= 1;
    }

    const w = [y, z];
    return this.uint32ArrayToBytes(w);
  }

  /**
   * Decrypt a 64-bit block (8 bytes) using TEA with a 128-bit key.
   * @param data Byte array of size 8
   * @returns Decrypted 8-byte output
   */
  decrypt(data: Uint8Array): Uint8Array {
    if (data.length !== 8) {
      throw new Error("Input data must be 8 bytes");
    }

    const v = this.bytesToUint32Array(data);
    const k = this.bytesToUint32Array(this.key);

    if (v.length < 2 || k.length < 4) {
      throw new Error("Invalid array lengths for decryption");
    }

    let y = (v[0] ?? 0) >>> 0; // Convert to unsigned 32-bit
    let z = (v[1] ?? 0) >>> 0;
    let sum = 0xc6ef3720; // Sum after 32 rounds
    const delta = 0x9e3779b9;
    let n = 32;

    while (n > 0) {
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
      n -= 1;
    }

    const w = [y, z];
    return this.uint32ArrayToBytes(w);
  }

  /**
   * Encrypt data of any length (must be multiple of 8 bytes)
   * If data is not 8-byte aligned, it will be padded with 0x00
   */
  encryptData(data: Uint8Array): Uint8Array {
    // Pad data to 8-byte alignment
    const paddedData = this.padTo8Bytes(data);
    const result = new Uint8Array(paddedData.length);

    // Encrypt in 8-byte chunks
    for (let i = 0; i < paddedData.length; i += 8) {
      const chunk = paddedData.slice(i, i + 8);
      const encrypted = this.encrypt(chunk);
      result.set(encrypted, i);
    }

    return result;
  }

  /**
   * Decrypt data of any length (must be multiple of 8 bytes)
   */
  decryptData(data: Uint8Array): Uint8Array {
    if (data.length % 8 !== 0) {
      throw new Error("Encrypted data length must be a multiple of 8 bytes");
    }

    const result = new Uint8Array(data.length);

    // Decrypt in 8-byte chunks
    for (let i = 0; i < data.length; i += 8) {
      const chunk = data.slice(i, i + 8);
      const decrypted = this.decrypt(chunk);
      result.set(decrypted, i);
    }

    return result;
  }

  /**
   * Convert byte array to uint32 array (little-endian format)
   * @param byteArray Input bytes
   * @returns Array of uint32 values
   */
  private bytesToUint32Array(byteArray: Uint8Array): number[] {
    const numUint32Values = byteArray.length / 4;
    const uint32Array: number[] = [];

    for (let i = 0; i < numUint32Values; i++) {
      const offset = i * 4;
      if (offset + 3 >= byteArray.length) {
        throw new Error("Invalid byte array length for conversion");
      }

      // Little-endian: LSB first
      const value =
        (byteArray[offset] ?? 0) |
        ((byteArray[offset + 1] ?? 0) << 8) |
        ((byteArray[offset + 2] ?? 0) << 16) |
        ((byteArray[offset + 3] ?? 0) << 24);
      uint32Array.push(value >>> 0); // Convert to unsigned
    }

    return uint32Array;
  }

  /**
   * Convert uint32 array to byte array (little-endian format)
   * @param uint32Array Input uint32 values
   * @returns Byte array
   */
  private uint32ArrayToBytes(uint32Array: number[]): Uint8Array {
    const byteArray = new Uint8Array(uint32Array.length * 4);

    for (let i = 0; i < uint32Array.length; i++) {
      const value = (uint32Array[i] ?? 0) >>> 0; // Ensure unsigned
      const offset = i * 4;

      // Little-endian: LSB first
      byteArray[offset] = value & 0xff;
      byteArray[offset + 1] = (value >>> 8) & 0xff;
      byteArray[offset + 2] = (value >>> 16) & 0xff;
      byteArray[offset + 3] = (value >>> 24) & 0xff;
    }

    return byteArray;
  }

  /**
   * Pad data to 8-byte alignment with 0x00 bytes
   * @param data Input data
   * @returns Padded data
   */
  private padTo8Bytes(data: Uint8Array): Uint8Array {
    const remainder = data.length % 8;
    if (remainder === 0) {
      return data;
    }

    const paddingSize = 8 - remainder;
    const paddedData = new Uint8Array(data.length + paddingSize);
    paddedData.set(data);
    // Remaining bytes are already 0x00 (default for Uint8Array)

    return paddedData;
  }

  /**
   * Remove padding from decrypted data (removes trailing 0x00 bytes)
   * @param data Decrypted data with potential padding
   * @returns Data with padding removed
   */
  removePadding(data: Uint8Array): Uint8Array {
    let length = data.length;
    while (length > 0 && data[length - 1] === 0x00) {
      length--;
    }
    return data.slice(0, length);
  }

  /**
   * Create a TEA instance with the factory key for advertisement decryption
   */
  static createWithFactoryKey(): TeaEncryption {
    const factoryKey = new Uint8Array([
      0x43, 0xea, 0x5f, 0x35, 0x65, 0x98, 0x59, 0x87, 0x4a, 0x6f, 0x18, 0x47,
      0x42, 0xc3, 0x2b, 0x2b,
    ]);
    return new TeaEncryption(factoryKey);
  }

  /**
   * Create a TEA instance with a custom bracelet key
   */
  static createWithBraceletKey(braceletKey: Uint8Array): TeaEncryption {
    return new TeaEncryption(braceletKey);
  }

  /**
   * Generate a Dynamic Key based on the protocol specification
   * DynamicKey[0:15] = (BraceletKey[0:15]) XOR {Uptime[0:7], (Uptime[0:7] XOR SerialNumber[0:7])}
   *
   * @param braceletKey 16-byte bracelet key
   * @param uptime 8-byte uptime from device
   * @param serialNumber 8-byte serial number from advertisement
   * @returns 16-byte dynamic key
   */
  static generateDynamicKey(
    braceletKey: Uint8Array,
    uptime: Uint8Array,
    serialNumber: Uint8Array,
  ): Uint8Array {
    if (braceletKey.length !== 16) {
      throw new Error("Bracelet key must be 16 bytes");
    }
    if (uptime.length !== 8) {
      throw new Error("Uptime must be 8 bytes");
    }
    if (serialNumber.length !== 8) {
      throw new Error("Serial number must be 8 bytes");
    }

    // Calculate: Uptime[0:7] XOR SerialNumber[0:7]
    const uptimeXorSerial = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      uptimeXorSerial[i] = (uptime[i] ?? 0) ^ (serialNumber[i] ?? 0);
    }

    // Create 16-byte array: {Uptime[0:7], (Uptime[0:7] XOR SerialNumber[0:7])}
    const combined = new Uint8Array(16);
    combined.set(uptime, 0);
    combined.set(uptimeXorSerial, 8);

    // Final XOR: BraceletKey[0:15] XOR combined
    const dynamicKey = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      dynamicKey[i] = (braceletKey[i] ?? 0) ^ (combined[i] ?? 0);
    }

    return dynamicKey;
  }

  /**
   * Create a TEA instance with a dynamic key
   */
  static createWithDynamicKey(
    braceletKey: Uint8Array,
    uptime: Uint8Array,
    serialNumber: Uint8Array,
  ): TeaEncryption {
    const dynamicKey = TeaEncryption.generateDynamicKey(
      braceletKey,
      uptime,
      serialNumber,
    );
    return new TeaEncryption(dynamicKey);
  }

  /**
   * Utility method to convert hex string to Uint8Array
   */
  static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Utility method to convert Uint8Array to hex string
   */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
}
