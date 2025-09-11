// Gently BLE Protocol implementation
// Based on the specification in BLE_protocol.md

import { decryptData, generateDynamicKey, Tea } from "./encryption";

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

// Protocol constants from the BLE specification
export const GENTLY_SERVICE_UUID = "0000F021-0000-1000-8000-00805F9B34FB";
export const REQUEST_CHARACTERISTIC_UUID =
  "0000F023-0000-1000-8000-00805F9B34FB";
export const RESPONSE_CHARACTERISTIC_UUID =
  "0000F024-0000-1000-8000-00805F9B34FB";

export const API_VERSION = 0x01;
export const MOTSAI_COMPANY_ID = 0x0274;

// Command codes
export enum CommandCode {
  GET_UPTIME = 0x01,
  GET_DEVICE_INFO = 0x02,
  GET_EVENT = 0x03,
  ADD_EVENT = 0x04,
  SET_EVENT_ON_OFF = 0x05,
  GET_ALL_EVENTS = 0x06,
  REMOVE_EVENT = 0x07,
  REMOVE_ALL_EVENTS = 0x08,
  GET_NUMBER_OF_EVENTS = 0x09,
  GET_TIME = 0x0a,
  SET_TIME = 0x0b,
  GET_DEVICE_STATUS = 0x0c,
  ACKNOWLEDGE_EVENT = 0x0d,
  SET_BRACELET_KEY = 0x0e,
  GET_BRACELET_KEY = 0x0f,
  FIND_ME = 0x10,
  ENTER_DFU_MODE = 0x11,
  REBOOT_BRACELET = 0x12,
  // Notification commands
  BATTERY_STATUS_NOTIFY = 0x80,
  ACTIVE_EVENT_NOTIFY = 0x81,
  TIME_NOTIFY = 0x82,
}

// Response status codes
export enum ResponseStatus {
  OK = 0x00,
  ERROR = 0x01,
}

// Advertisement packet structure
export interface AdvertisementData {
  apiVersion: number;
  packetCounter: number;
  errorCode: number;
  serialNumber: Uint8Array;
  localTime: {
    hour: number;
    minute: number;
    seconds: number;
    year: number;
    month: number;
    date: number;
    weekDay: number;
  };
  batteryVoltage: number;
  flags: {
    charging: boolean;
    batteryLevel: number;
    braceletKeyType: number;
    anyEventActive: boolean;
  };
}

// Device information structure
export interface DeviceInformation {
  hardwareVersion: number;
  firmwareVersionMajor: number;
  firmwareVersionMinor: number;
  firmwareBuildNumber: number;
}

// Event state enumeration from BLE protocol
export enum EventState {
  OFF = 0x00,
  ON_INACTIVE = 0x01,
  ON_ACTIVE_VIBRATION = 0x02,
  ON_ACTIVE_RETRIGGER_DELAY = 0x03,
  ON_ACTIVE_SNOOZE_PERIOD = 0x04,
}

// Device event structure
export interface DeviceEvent {
  index: number; // 0-49
  state: EventState;
  name: string;
  cronExpression: string;
  // Additional fields from the BLE protocol would go here
  // vibrationPattern, ledPattern, priority, etc.
}

// Event synchronization result
export interface EventSyncResult {
  totalEvents: number;
  deviceEvents: DeviceEvent[];
  addedToDevice: number;
  removedFromDevice: number;
  updatedOnDevice: number;
  errors: string[];
}

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
   * Decrypt and parse a response packet
   */
  parseResponse(encryptedData: Uint8Array): {
    apiVersion: number;
    command: CommandCode;
    status: ResponseStatus;
    payload: Uint8Array;
  } {
    console.log("🔓 PROTOCOL: parseResponse called");
    console.log("🔓 PROTOCOL: Encrypted data length:", encryptedData.length);
    console.log(
      "🔓 PROTOCOL: Encrypted data hex:",
      Array.from(encryptedData)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );

    // Determine which encryption key to use based on current state
    const keyType = this.dynamicTea ? "Dynamic" : "Bracelet";
    const keyToUse = this.dynamicKey ?? this.braceletKey;
    console.log("🔓 PROTOCOL: Using", keyType, "key for decryption");

    try {
      // Decrypt
      const decrypted = decryptData(encryptedData, keyToUse);
      console.log("🔓 PROTOCOL: Decrypted data length:", decrypted.length);
      console.log(
        "🔓 PROTOCOL: Decrypted data hex:",
        Array.from(decrypted)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );

      if (decrypted.length < 3) {
        console.error(
          "🔓 PROTOCOL: Decrypted response too short:",
          decrypted.length,
        );
        throw new Error("Response too short");
      }

      const apiVersion = decrypted[0] ?? 0;
      const command = (decrypted[1] ?? 0) as CommandCode;
      const status = (decrypted[2] ?? 0) as ResponseStatus;
      const payload = decrypted.slice(3);

      console.log("🔓 PROTOCOL: Parsed decrypted response:");
      console.log("🔓 PROTOCOL:   - API Version:", apiVersion);
      console.log(
        "🔓 PROTOCOL:   - Command:",
        command,
        `(0x${command.toString(16).padStart(2, "0")})`,
      );
      console.log(
        "🔓 PROTOCOL:   - Status:",
        status,
        `(0x${status.toString(16).padStart(2, "0")})`,
      );
      console.log("🔓 PROTOCOL:   - Payload length:", payload.length);

      return { apiVersion, command, status, payload };
    } catch (error) {
      console.error("🔓 PROTOCOL: Decryption failed:", error);
      throw error;
    }
  }

  /**
   * Create uptime request (Command 0x01)
   */
  createUptimeRequest(): Uint8Array {
    const payload = new Uint8Array(6); // 6 bytes of padding
    return this.createRequest(CommandCode.GET_UPTIME, payload);
  }

  /**
   * Parse uptime response and establish dynamic key
   */
  parseUptimeResponse(
    encryptedResponse: Uint8Array,
    serialNumber: Uint8Array,
  ): Uint8Array {
    console.log("🔓 PROTOCOL: parseUptimeResponse called");
    console.log(
      "🔓 PROTOCOL: Encrypted response length:",
      encryptedResponse.length,
    );
    console.log(
      "🔓 PROTOCOL: Encrypted response hex:",
      Array.from(encryptedResponse)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
    console.log(
      "🔓 PROTOCOL: Serial number:",
      Array.from(serialNumber)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );

    try {
      const response = this.parseResponse(encryptedResponse);

      console.log("🔓 PROTOCOL: Parsed response:");
      console.log("🔓 PROTOCOL:   - API Version:", response.apiVersion);
      console.log("🔓 PROTOCOL:   - Command:", response.command);
      console.log("🔓 PROTOCOL:   - Status:", response.status);
      console.log("🔓 PROTOCOL:   - Payload length:", response.payload.length);
      console.log(
        "🔓 PROTOCOL:   - Payload hex:",
        Array.from(response.payload)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );

      console.log("🔓 PROTOCOL: Expected uptime response format per BLE spec:");
      console.log("🔓 PROTOCOL:   - Bytes 0: API Version (0x01)");
      console.log("🔓 PROTOCOL:   - Bytes 1: Command Code (0x01)");
      console.log("🔓 PROTOCOL:   - Bytes 2: Status (0x00 = OK)");
      console.log(
        "🔓 PROTOCOL:   - Bytes 3-10: Uptime Uint64 (8 bytes, little-endian)",
      );
      console.log("🔓 PROTOCOL:   - Bytes 11-15: Reserved (0 padded)");
      console.log(
        "🔓 PROTOCOL:   - Total expected: 16 bytes before encryption, variable after decryption",
      );

      if (response.status !== ResponseStatus.OK) {
        console.error(
          "🔓 PROTOCOL: Response status is not OK:",
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
      console.log("🔓 PROTOCOL: Generating dynamic key...");
      this.dynamicKey = generateDynamicKey(
        this.braceletKey,
        uptime,
        serialNumber,
      );
      this.dynamicTea = new Tea(this.dynamicKey);

      console.log("🔓 PROTOCOL: Dynamic key established successfully");

      return uptime;
    } catch (error) {
      console.error("🔓 PROTOCOL: Error in parseUptimeResponse:", error);
      throw error;
    }
  }

  /**
   * Create device info request (Command 0x02)
   */
  createDeviceInfoRequest(): Uint8Array {
    const payload = new Uint8Array(6); // 6 bytes of padding
    return this.createRequest(CommandCode.GET_DEVICE_INFO, payload);
  }

  /**
   * Parse device info response
   */
  parseDeviceInfoResponse(encryptedResponse: Uint8Array): DeviceInformation {
    const response = this.parseResponse(encryptedResponse);

    if (response.status !== ResponseStatus.OK) {
      throw new Error("Device info request failed");
    }

    if (response.payload.length < 4) {
      throw new Error("Invalid device info response");
    }

    return {
      hardwareVersion: response.payload[0] ?? 0,
      firmwareVersionMajor: response.payload[1] ?? 0,
      firmwareVersionMinor: response.payload[2] ?? 0,
      firmwareBuildNumber: response.payload[3] ?? 0,
    };
  }

  /**
   * Create set time request (Command 0x0B)
   */
  createSetTimeRequest(date: Date): Uint8Array {
    const payload = new Uint8Array(8);

    // Convert to BCD format
    payload[0] = this.toBCD(date.getHours());
    payload[1] = this.toBCD(date.getMinutes());
    payload[2] = this.toBCD(date.getSeconds());
    payload[3] = this.toBCD(date.getFullYear() - 2000);
    payload[4] = this.toBCD(date.getMonth() + 1); // Month is 0-indexed in JS
    payload[5] = this.toBCD(date.getDate());
    payload[6] = date.getDay(); // Week day (0 = Sunday)
    payload[7] = 0; // Reserved

    return this.createRequest(CommandCode.SET_TIME, payload);
  }

  /**
   * Create find me request (Command 0x10)
   */
  createFindMeRequest(): Uint8Array {
    const payload = new Uint8Array(6); // 6 bytes of padding
    return this.createRequest(CommandCode.FIND_ME, payload);
  }

  /**
   * Create battery status request (Command 0x0C)
   */
  createDeviceStatusRequest(): Uint8Array {
    const payload = new Uint8Array(6); // 6 bytes of padding
    return this.createRequest(CommandCode.GET_DEVICE_STATUS, payload);
  }

  /**
   * Create get time request (Command 0x0A)
   */
  createGetTimeRequest(): Uint8Array {
    const payload = new Uint8Array(6); // 6 bytes of padding
    return this.createRequest(CommandCode.GET_TIME, payload);
  }

  /**
   * Create get all events request (Command 0x06)
   */
  createGetAllEventsRequest(): Uint8Array {
    const payload = new Uint8Array(6); // 6 bytes of padding
    return this.createRequest(CommandCode.GET_ALL_EVENTS, payload);
  }

  /**
   * Create get number of events request (Command 0x09)
   */
  createGetNumberOfEventsRequest(): Uint8Array {
    const payload = new Uint8Array(6); // 6 bytes of padding
    return this.createRequest(CommandCode.GET_NUMBER_OF_EVENTS, payload);
  }

  /**
   * Create get specific event request (Command 0x03)
   */
  createGetEventRequest(eventIndex: number): Uint8Array {
    if (eventIndex < 0 || eventIndex > 49) {
      throw new Error("Event index must be between 0 and 49");
    }
    const payload = new Uint8Array(6);
    payload[0] = eventIndex; // Event index
    // Remaining bytes are reserved (already zeroed)
    return this.createRequest(CommandCode.GET_EVENT, payload);
  }

  /**
   * Create add event request (Command 0x04)
   * Note: This is a simplified version - the full implementation would need
   * to handle the complex event structure with cron expressions, etc.
   */
  createAddEventRequest(
    eventIndex: number,
    eventName: string,
    cronExpression: string,
    _isActive = true,
  ): Uint8Array {
    if (eventIndex < 0 || eventIndex > 49) {
      throw new Error("Event index must be between 0 and 49");
    }
    if (eventName.length > 10) {
      throw new Error("Event name cannot exceed 10 characters");
    }
    if (cronExpression.length > 42) {
      throw new Error("Cron expression cannot exceed 42 characters");
    }

    // This is a simplified implementation - the actual payload would be much more complex
    // according to the BLE protocol specification
    const payload = new Uint8Array(72); // Max size according to spec
    payload[0] = eventIndex;

    // For now, we'll create a basic payload structure
    // A full implementation would need to handle vibration patterns, LED settings, etc.

    return this.createRequest(CommandCode.ADD_EVENT, payload);
  }

  /**
   * Create set event on/off request (Command 0x05)
   */
  createSetEventOnOffRequest(eventIndex: number, isOn: boolean): Uint8Array {
    if (eventIndex < 0 || eventIndex > 49) {
      throw new Error("Event index must be between 0 and 49");
    }
    const payload = new Uint8Array(6);
    payload[0] = eventIndex; // Event index
    payload[1] = isOn ? 0x01 : 0x00; // State: ON (0x01) or OFF (0x00)
    // Remaining bytes are reserved (already zeroed)
    return this.createRequest(CommandCode.SET_EVENT_ON_OFF, payload);
  }

  /**
   * Create remove event request (Command 0x07)
   */
  createRemoveEventRequest(eventIndex: number): Uint8Array {
    if (eventIndex < 0 || eventIndex > 49) {
      throw new Error("Event index must be between 0 and 49");
    }
    const payload = new Uint8Array(6);
    payload[0] = eventIndex; // Event index
    // Remaining bytes are reserved (already zeroed)
    return this.createRequest(CommandCode.REMOVE_EVENT, payload);
  }

  /**
   * Create remove all events request (Command 0x08)
   */
  createRemoveAllEventsRequest(): Uint8Array {
    const payload = new Uint8Array(6); // 6 bytes of padding
    return this.createRequest(CommandCode.REMOVE_ALL_EVENTS, payload);
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
