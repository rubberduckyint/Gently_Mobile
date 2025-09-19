// Gently BLE Protocol implementation
// Based on the specification in BLE_protocol.md

import type { AdvertisementData } from "./protocol-types";
import {
  getCommandHandler,
  getCommandName,
  getStatusName,
} from "./commands/protocol-registry";
import { decryptData, generateDynamicKey, Tea } from "./encryption";
import {
  API_VERSION,
  CommandCode,
  MOTSAI_COMPANY_ID,
  ResponseStatus,
} from "./protocol-types";

// Default factory bracelet key as specified in the protocol
// Key: 0x43EA5F35659859874A6F184742C32B2B
export const DEFAULT_FACTORY_KEY = new Uint8Array([
  0x43, 0xea, 0x5f, 0x35, 0x65, 0x98, 0x59, 0x87, 0x4a, 0x6f, 0x18, 0x47, 0x42,
  0xc3, 0x2b, 0x2b,
]);

// Verify factory key is correct format
console.log(
  "🔑 Factory key verification:",
  Array.from(DEFAULT_FACTORY_KEY)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase(),
);

/**
 * Gently BLE Protocol handler
 * Manages encryption, command formatting, and secure communication
 */
export class GentlyBLEProtocol {
  private braceletKey: Uint8Array;
  private dynamicKey: Uint8Array | null = null;
  private braceletTea: Tea;
  private dynamicTea: Tea | null = null;

  constructor(braceletKey: Uint8Array = DEFAULT_FACTORY_KEY) {
    this.braceletKey = new Uint8Array(braceletKey);
    this.braceletTea = new Tea(this.braceletKey);
  }

  /**
   * Parse manufacturer data from advertisement packet
   */
  parseAdvertisementData(
    manufacturerData: Uint8Array,
  ): AdvertisementData | null {
    try {
      if (manufacturerData.length < 26) {
        console.warn("Advertisement data too short");
        return null;
      }

      // Check company ID (first 2 bytes)
      const companyId =
        (manufacturerData[0] ?? 0) | ((manufacturerData[1] ?? 0) << 8);
      if (companyId !== MOTSAI_COMPANY_ID) {
        console.warn("Not a Motsai device");
        return null;
      }

      // Extract encrypted payload (24 bytes after company ID)
      const encryptedPayload = manufacturerData.slice(2, 26);

      // Decrypt using static factory key (for advertisement)
      const factoryTea = new Tea(DEFAULT_FACTORY_KEY);

      // Decrypt in 8-byte blocks
      const decryptedPayload = new Uint8Array(24);
      for (let i = 0; i < 24; i += 8) {
        const block = encryptedPayload.slice(i, i + 8);
        const decryptedBlock = factoryTea.decrypt(block);
        decryptedPayload.set(decryptedBlock, i);
      }

      // Parse the decrypted payload
      const apiVersion = decryptedPayload[0] ?? 0;
      const packetCounter =
        (decryptedPayload[1] ?? 0) | ((decryptedPayload[2] ?? 0) << 8);
      const errorCode =
        (decryptedPayload[3] ?? 0) | ((decryptedPayload[4] ?? 0) << 8);
      const serialNumber = decryptedPayload.slice(5, 13);

      // Parse time fields
      const hour = this.fromBCD(decryptedPayload[13] ?? 0);
      const minute = this.fromBCD(decryptedPayload[14] ?? 0);
      const seconds = this.fromBCD(decryptedPayload[15] ?? 0);
      const year = this.fromBCD(decryptedPayload[16] ?? 0) + 2000;
      const month = this.fromBCD(decryptedPayload[17] ?? 0);
      const date = this.fromBCD(decryptedPayload[18] ?? 0);
      const weekDay = decryptedPayload[19] ?? 0;

      // Parse battery and flags
      const batteryVoltage =
        (decryptedPayload[20] ?? 0) | ((decryptedPayload[21] ?? 0) << 8);
      const flagsByte = decryptedPayload[22] ?? 0;

      const flags = {
        charging: !!(flagsByte & 0x04),
        batteryLevel: (flagsByte >> 3) & 0x07,
        braceletKeyType: (flagsByte >> 6) & 0x01,
        anyEventActive: !!(flagsByte & 0x80),
      };

      return {
        apiVersion,
        packetCounter,
        errorCode,
        serialNumber,
        localTime: { hour, minute, seconds, year, month, date, weekDay },
        batteryVoltage,
        flags,
      };
    } catch (error) {
      console.error("Failed to parse advertisement data:", error);
      return null;
    }
  }

  /**
   * Create and encrypt a request packet
   */
  createRequest(
    command: CommandCode,
    payload: Uint8Array = new Uint8Array(0),
  ): Uint8Array {
    // Determine which encryption key to use
    const useStaticKey = command === CommandCode.GET_UPTIME;
    const tea = useStaticKey ? this.braceletTea : this.dynamicTea;

    if (!tea) {
      throw new Error("Dynamic key not established");
    }

    // Create packet: API Version + Command + Payload
    const packet = new Uint8Array(2 + payload.length);
    packet[0] = API_VERSION;
    packet[1] = command;
    packet.set(payload, 2);

    // Pad to 8-byte alignment if needed
    const paddedLength = Math.ceil(packet.length / 8) * 8;
    const paddedPacket = new Uint8Array(paddedLength);
    paddedPacket.set(packet);

    // Encrypt
    return tea.encryptData(paddedPacket);
  }

  /**
   * Get human-readable command name
   */
  private getCommandName(command: CommandCode): string {
    return getCommandName(command);
  }

  /**
   * Get human-readable status name
   */
  private getStatusName(status: ResponseStatus): string {
    return getStatusName(status);
  }

  /**
   * Decrypt and parse a response packet
   */
  parseResponse(encryptedData: Uint8Array): {
    apiVersion: number;
    command: CommandCode;
    status: ResponseStatus;
    payload: Uint8Array;
  } {
    // Determine which encryption key to use based on current state
    const keyToUse = this.dynamicKey ?? this.braceletKey;

    try {
      // Decrypt
      const decrypted = decryptData(encryptedData, keyToUse);

      if (decrypted.length < 3) {
        throw new Error("Response too short");
      }

      const apiVersion = decrypted[0] ?? 0;
      const command = (decrypted[1] ?? 0) as CommandCode;
      const status = (decrypted[2] ?? 0) as ResponseStatus;
      const payload = decrypted.slice(3);

      return { apiVersion, command, status, payload };
    } catch (error) {
      console.error("🔓 PROTOCOL: Decryption failed:", error);
      throw error;
    }
  }

  /**
   * Execute a command using the command registry
   */
  executeCommand(commandCode: CommandCode, payload?: Uint8Array): Uint8Array {
    const handler = getCommandHandler(commandCode);
    if (handler?.createRequest) {
      return handler.createRequest(payload);
    }

    // Fallback for commands not in registry yet
    const finalPayload = payload ?? new Uint8Array(6);
    return this.createRequest(commandCode, finalPayload);
  }

  /**
   * Parse a command response using the command registry
   */
  parseCommandResponse<T>(
    commandCode: CommandCode,
    encryptedResponse: Uint8Array,
  ): T | null {
    const response = this.parseResponse(encryptedResponse);

    const handler = getCommandHandler(commandCode);
    if (handler?.parseResponse) {
      return handler.parseResponse(response.payload, response.status) as T;
    }

    if (response.status !== ResponseStatus.OK) {
      throw new Error(
        `Command ${this.getCommandName(commandCode)} failed with status ${response.status}`,
      );
    }

    // Return null for commands without registry handlers
    return null;
  }

  /**
   * Parse uptime response and establish dynamic key
   */
  parseUptimeResponse(
    encryptedResponse: Uint8Array,
    serialNumber: Uint8Array,
  ): Uint8Array {
    try {
      const response = this.parseResponse(encryptedResponse);

      if (response.status !== ResponseStatus.OK) {
        console.error(
          "Protocol error - uptime request failed with status:",
          response.status,
        );
        throw new Error(
          `Uptime request failed with status: ${response.status}`,
        );
      }

      if (response.command !== CommandCode.GET_UPTIME) {
        console.error(
          "🔓 PROTOCOL: Unexpected command in response:",
          response.command,
          "expected:",
          CommandCode.GET_UPTIME,
        );
        console.warn("🔓 PROTOCOL: Command mismatch - proceeding anyway");
      }

      if (response.payload.length < 8) {
        console.error(
          "🔓 PROTOCOL: Payload too short for uptime response:",
          response.payload.length,
        );
        console.error(
          "🔓 PROTOCOL: Expected at least 8 bytes for uptime, got:",
          response.payload.length,
        );
        console.error(
          "🔓 PROTOCOL: Available payload bytes:",
          Array.from(response.payload)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        );
        console.error("🔓 PROTOCOL: This suggests either:");
        console.error(
          "🔓 PROTOCOL:   1. Incorrect factory key (decryption failed)",
        );
        console.error(
          "🔓 PROTOCOL:   2. Device sending shorter response than spec",
        );
        console.error(
          "🔓 PROTOCOL:   3. TEA decryption removing too much padding",
        );
        throw new Error(
          `Invalid uptime response: payload too short (${response.payload.length} bytes, expected at least 8)`,
        );
      }

      // Extract 8-byte uptime (little-endian Uint64)
      const uptime = response.payload.slice(0, 8);
      console.log(
        "🔓 PROTOCOL: Extracted uptime (8 bytes):",
        Array.from(uptime)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );

      // Convert little-endian bytes to decimal for human readability
      let uptimeValue = 0n;
      for (let i = 0; i < 8; i++) {
        uptimeValue += BigInt(uptime[i] ?? 0) << BigInt(i * 8);
      }
      console.log(
        "🔓 PROTOCOL: Uptime as Uint64 decimal:",
        uptimeValue.toString(),
      );
      console.log(
        "🔓 PROTOCOL: Uptime as seconds:",
        (Number(uptimeValue) / 1000000).toFixed(3),
        "seconds",
      );

      // Show remaining payload (should be reserved bytes)
      if (response.payload.length > 8) {
        const reservedBytes = response.payload.slice(8);
        console.log(
          "🔓 PROTOCOL: Reserved bytes:",
          Array.from(reservedBytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        );
      }

      // Generate dynamic key
      this.dynamicKey = generateDynamicKey(
        this.braceletKey,
        uptime,
        serialNumber,
      );
      this.dynamicTea = new Tea(this.dynamicKey);

      return uptime;
    } catch (error) {
      console.error("Protocol error in parseUptimeResponse:", error);
      throw error;
    }
  }

  /**
   * Check if dynamic key is established
   */
  isDynamicKeyEstablished(): boolean {
    return this.dynamicKey !== null && this.dynamicTea !== null;
  }

  /**
   * Get current dynamic key (for debugging/logging purposes)
   */
  getDynamicKey(): Uint8Array | null {
    return this.dynamicKey ? new Uint8Array(this.dynamicKey) : null;
  }

  /**
   * Get current bracelet key
   */
  getBraceletKey(): Uint8Array {
    return new Uint8Array(this.braceletKey);
  }

  /**
   * Set new bracelet key
   */
  setBraceletKey(newKey: Uint8Array): void {
    if (newKey.length !== 16) {
      throw new Error("Bracelet key must be 16 bytes");
    }
    this.braceletKey = new Uint8Array(newKey);
    this.braceletTea = new Tea(this.braceletKey);

    // Reset dynamic key as it depends on bracelet key
    this.dynamicKey = null;
    this.dynamicTea = null;
  }

  /**
   * Reset dynamic key (for new connection)
   */
  resetDynamicKey(): void {
    this.dynamicKey = null;
    this.dynamicTea = null;
  }

  // Helper methods for BCD conversion
  private toBCD(value: number): number {
    return ((Math.floor(value / 10) & 0x0f) << 4) | value % 10;
  }

  private fromBCD(bcd: number): number {
    return ((bcd >> 4) & 0x0f) * 10 + (bcd & 0x0f);
  }
}

/**
 * Utility function to check if device is a Gently device by checking advertisement
 */
export function isGentlyDeviceFromAdvertisement(
  manufacturerData: Uint8Array,
): boolean {
  if (manufacturerData.length < 2) {
    return false;
  }

  const companyId =
    (manufacturerData[0] ?? 0) | ((manufacturerData[1] ?? 0) << 8);
  return companyId === MOTSAI_COMPANY_ID;
}

/**
 * Utility function to extract serial number from parsed advertisement
 */
export function getSerialNumberFromAdvertisement(
  advertisementData: AdvertisementData,
): Uint8Array {
  return new Uint8Array(advertisementData.serialNumber);
}

// Re-export types and enums for backward compatibility
export {
  CommandCode,
  ResponseStatus,
  EventState,
  GENTLY_SERVICE_UUID,
  REQUEST_CHARACTERISTIC_UUID,
  RESPONSE_CHARACTERISTIC_UUID,
  API_VERSION,
  MOTSAI_COMPANY_ID,
} from "./protocol-types";
export type {
  AdvertisementData,
  DeviceInformation,
  DeviceEvent,
  EventSyncResult,
} from "./protocol-types";
