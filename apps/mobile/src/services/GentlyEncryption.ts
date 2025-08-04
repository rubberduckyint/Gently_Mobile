/**
 * Tiny Encryption Algorithm (TEA) implementation for Gently BLE protocol
 * Based on    const v = this.bytesToUint32(data);
    const k = this.bytesToUint32(this.key);
    
    let y = (v[0] || 0) >>> 0;
    let z = (v[1] || 0) >>> 0;
    let sum = 0xC6EF3720;
    const delta = 0x9e3779b9;
    const n = 32;

    for (let i = 0; i < n; i++) {
      z = (z - (((y << 4) + (k[2] || 0)) ^ (y + sum) ^ ((y >>> 5) + (k[3] || 0)))) >>> 0;
      y = (y - (((z << 4) + (k[0] || 0)) ^ (z + sum) ^ ((z >>> 5) + (k[1] || 0)))) >>> 0;
      sum = (sum - delta) >>> 0;
    }tion in Gently_BLE_Protocol_Full.md
 */

export class TEAEncryption {
  private key: Uint8Array;

  constructor(key: Uint8Array) {
    if (key.length !== 16) {
      throw new Error('Key must be a 16-byte array');
    }
    this.key = new Uint8Array(key);
  }

  /**
   * Convert byte array to uint32 array (little endian)
   */
  private bytesToUint32(byteArray: Uint8Array): number[] {
    const numUint32Values = Math.floor(byteArray.length / 4);
    const uint32Array: number[] = [];

    for (let i = 0; i < numUint32Values; i++) {
      const offset = i * 4;
      const value = 
        (byteArray[offset] || 0) |
        ((byteArray[offset + 1] || 0) << 8) |
        ((byteArray[offset + 2] || 0) << 16) |
        ((byteArray[offset + 3] || 0) << 24);
      uint32Array.push(value >>> 0); // Convert to unsigned 32-bit
    }

    return uint32Array;
  }

  /**
   * Convert uint32 array to byte array (little endian)
   */
  private uint32ToBytes(uint32Array: number[]): Uint8Array {
    const byteArray = new Uint8Array(uint32Array.length * 4);

    for (let i = 0; i < uint32Array.length; i++) {
      const value = uint32Array[i];
      if (value !== undefined) {
        const offset = i * 4;
        byteArray[offset] = value & 0xff;
        byteArray[offset + 1] = (value >>> 8) & 0xff;
        byteArray[offset + 2] = (value >>> 16) & 0xff;
        byteArray[offset + 3] = (value >>> 24) & 0xff;
      }
    }

    return byteArray;
  }

  /**
   * Encrypt a 64-bit block (8 bytes) using TEA with a 128-bit key
   */
  encrypt(data: Uint8Array): Uint8Array {
    if (data.length !== 8) {
      throw new Error('Input data must be 8 bytes');
    }

    const v = this.bytesToUint32(data);
    const k = this.bytesToUint32(this.key);
    
    let y = (v[0] || 0) >>> 0;
    let z = (v[1] || 0) >>> 0;
    let sum = 0;
    const delta = 0x9e3779b9;
    const n = 32;

    for (let i = 0; i < n; i++) {
      sum = (sum + delta) >>> 0;
      y = (y + (((z << 4) + (k[0] || 0)) ^ (z + sum) ^ ((z >>> 5) + (k[1] || 0)))) >>> 0;
      z = (z + (((y << 4) + (k[2] || 0)) ^ (y + sum) ^ ((y >>> 5) + (k[3] || 0)))) >>> 0;
    }

    return this.uint32ToBytes([y, z]);
  }

  /**
   * Decrypt a 64-bit block (8 bytes) using TEA with a 128-bit key
   */
  decrypt(data: Uint8Array): Uint8Array {
    if (data.length !== 8) {
      throw new Error('Input data must be 8 bytes');
    }

    const v = this.bytesToUint32(data);
    const k = this.bytesToUint32(this.key);
    
    let y = (v[0] || 0) >>> 0;
    let z = (v[1] || 0) >>> 0;
    let sum = 0xc6ef3720;
    const delta = 0x9e3779b9;
    const n = 32;

    for (let i = 0; i < n; i++) {
      z = (z - (((y << 4) + (k[2] || 0)) ^ (y + sum) ^ ((y >>> 5) + (k[3] || 0)))) >>> 0;
      y = (y - (((z << 4) + (k[0] || 0)) ^ (z + sum) ^ ((z >>> 5) + (k[1] || 0)))) >>> 0;
      sum = (sum - delta) >>> 0;
    }

    return this.uint32ToBytes([y, z]);
  }

  /**
   * Encrypt data of any length (must be 8-byte aligned or will be padded)
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

  /**
   * Decrypt data of any length (must be 8-byte aligned)
   */
  decryptData(data: Uint8Array): Uint8Array {
    if (data.length % 8 !== 0) {
      throw new Error('Data length must be 8-byte aligned');
    }

    const decrypted = new Uint8Array(data.length);
    
    for (let i = 0; i < data.length; i += 8) {
      const block = data.slice(i, i + 8);
      const decryptedBlock = this.decrypt(block);
      decrypted.set(decryptedBlock, i);
    }

    return decrypted;
  }
}

/**
 * Utility functions for working with encryption keys
 */
export class GentlyEncryption {
  // Default factory key from the protocol specification
  static readonly FACTORY_KEY = new Uint8Array([
    0x43, 0xEA, 0x5F, 0x35, 0x65, 0x98, 0x59, 0x87,
    0x4A, 0x6F, 0x18, 0x47, 0x42, 0xC3, 0x2B, 0x2B
  ]);

  /**
   * Create TEA encryption instance with factory key
   */
  static createFactoryEncryption(): TEAEncryption {
    return new TEAEncryption(this.FACTORY_KEY);
  }

  /**
   * Create TEA encryption instance with custom bracelet key
   */
  static createBraceletEncryption(braceletKey: Uint8Array): TEAEncryption {
    return new TEAEncryption(braceletKey);
  }

  /**
   * Generate a random 16-byte bracelet key
   */
  static generateBraceletKey(): Uint8Array {
    const key = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      key[i] = Math.floor(Math.random() * 256);
    }
    return key;
  }

  /**
   * Convert hex string to byte array
   */
  static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Convert byte array to hex string
   */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
