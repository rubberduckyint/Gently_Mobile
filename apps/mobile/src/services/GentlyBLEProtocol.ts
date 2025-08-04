/**
 * BLE packet parser and protocol implementation for Gently devices
 * Based on Gently_BLE_Protocol_Full.md specification
 */

import { TEAEncryption, GentlyEncryption } from './GentlyEncryption';
import {
  GentlyAdvertisementData,
  GentlyStatusBits,
  GentlyCommand,
  GentlyPacket,
  GentlyResponseStatus,
  GENTLY_API_VERSION,
  BLEPacketParser,
  GentlyDeviceInfo,
  GentlyDeviceStatus,
  GentlyEvent,
  GentlyEventType,
} from './GentlyTypes';

export class GentlyBLEProtocol implements BLEPacketParser {
  /**
   * Parse advertisement manufacturer data to extract Gently device information
   */
  parseAdvertisementData(manufacturerData: Uint8Array): GentlyAdvertisementData | null {
    try {
      // Check if this is Motsai Research manufacturer data (0x0274)
      if (manufacturerData.length < 26) return null;
      
      const companyId = (manufacturerData[1]! << 8) | manufacturerData[0]!;
      if (companyId !== 0x0274) return null; // Not Motsai Research

      // Extract encrypted payload (24 bytes after company ID)
      const encryptedPayload = manufacturerData.slice(2, 26);
      
      // Decrypt using factory key
      const factoryEncryption = GentlyEncryption.createFactoryEncryption();
      const decryptedPayload = factoryEncryption.decryptData(encryptedPayload);

      // Parse decrypted data
      const data: GentlyAdvertisementData = {
        apiVersion: decryptedPayload[0]!,
        packetCounter: (decryptedPayload[2]! << 8) | decryptedPayload[1]!,
        errorCode: (decryptedPayload[4]! << 8) | decryptedPayload[3]!,
        uniqueId: decryptedPayload.slice(5, 13),
        localTimeHour: this.bcdToNumber(decryptedPayload[13]!),
        localTimeMinute: this.bcdToNumber(decryptedPayload[14]!),
        localTimeSeconds: this.bcdToNumber(decryptedPayload[15]!),
        year: this.bcdToNumber(decryptedPayload[16]!) + 2000,
        month: this.bcdToNumber(decryptedPayload[17]!),
        date: this.bcdToNumber(decryptedPayload[18]!),
        weekDay: decryptedPayload[19]!,
        batteryVoltage: (decryptedPayload[21]! << 8) | decryptedPayload[20]!,
        statusByte: decryptedPayload[22]!,
      };

      return data;
    } catch (error) {
      console.error('Failed to parse advertisement data:', error);
      return null;
    }
  }

  /**
   * Parse status byte into individual flags
   */
  parseStatusBits(statusByte: number): GentlyStatusBits {
    return {
      charging: (statusByte & 0x04) !== 0, // Bit 2
      batteryLevel: (statusByte >> 3) & 0x07, // Bits 3-5
      isFactoryMode: (statusByte & 0x40) === 0, // Bit 6 = 0 means factory mode
      hasActiveEvent: (statusByte & 0x80) !== 0, // Bit 7
    };
  }

  /**
   * Create a command packet for sending to the device
   */
  createCommandPacket(command: GentlyCommand, payload?: Uint8Array): Uint8Array {
    const payloadLength = payload ? payload.length : 0;
    const totalLength = 2 + payloadLength; // API version + command + payload
    
    // Ensure packet is 8-byte aligned for encryption
    const alignedLength = Math.ceil(totalLength / 8) * 8;
    const packet = new Uint8Array(alignedLength);
    
    packet[0] = GENTLY_API_VERSION;
    packet[1] = command;
    
    if (payload) {
      packet.set(payload, 2);
    }
    
    // Remaining bytes are already 0 (padding)
    return packet;
  }

  /**
   * Parse response packet from device
   */
  parseResponsePacket(data: Uint8Array): { 
    command: GentlyCommand; 
    status: GentlyResponseStatus; 
    payload: Uint8Array 
  } {
    if (data.length < 3) {
      throw new Error('Response packet too short');
    }

    const apiVersion = data[0];
    const command = data[1] as GentlyCommand;
    const status = data[2] as GentlyResponseStatus;
    const payload = data.slice(3);

    if (apiVersion !== GENTLY_API_VERSION) {
      console.warn(`API version mismatch: expected ${GENTLY_API_VERSION}, got ${apiVersion}`);
    }

    return { command, status, payload };
  }

  /**
   * Parse device info response
   */
  parseDeviceInfoResponse(payload: Uint8Array): GentlyDeviceInfo {
    // This would depend on the exact format returned by the device
    // For now, we'll create a mock implementation
    return {
      apiVersion: GENTLY_API_VERSION,
      firmwareVersion: '1.0.0',
      hardwareVersion: '1.0',
      serialNumber: this.bytesToHex(payload.slice(0, 8)),
      deviceName: 'Gently',
      manufacturerName: 'Motsai',
    };
  }

  /**
   * Parse device status response
   */
  parseDeviceStatusResponse(payload: Uint8Array): GentlyDeviceStatus {
    if (payload.length < 8) {
      throw new Error('Device status payload too short');
    }

    return {
      batteryLevel: payload[0]!,
      batteryVoltage: (payload[2]! << 8) | payload[1]!,
      isCharging: (payload[3]! & 0x01) !== 0,
      uptimeSeconds: (payload[7]! << 24) | (payload[6]! << 16) | (payload[5]! << 8) | payload[4]!,
      hasActiveEvents: (payload[3]! & 0x02) !== 0,
      errorCode: (payload[9]! << 8) | payload[8]!,
    };
  }

  /**
   * Create set time command payload
   */
  createSetTimePayload(date: Date): Uint8Array {
    const payload = new Uint8Array(8);
    
    // Unix timestamp (4 bytes, little endian)
    const timestamp = Math.floor(date.getTime() / 1000);
    payload[0] = timestamp & 0xff;
    payload[1] = (timestamp >> 8) & 0xff;
    payload[2] = (timestamp >> 16) & 0xff;
    payload[3] = (timestamp >> 24) & 0xff;
    
    // Time zone offset in minutes (2 bytes, little endian)
    const timezoneOffset = -date.getTimezoneOffset();
    payload[4] = timezoneOffset & 0xff;
    payload[5] = (timezoneOffset >> 8) & 0xff;
    
    // Reserved bytes (already 0)
    
    return payload;
  }

  /**
   * Create add event command payload
   */
  createAddEventPayload(event: Partial<GentlyEvent>): Uint8Array {
    const payload = new Uint8Array(24); // Aligned to 8 bytes
    
    payload[0] = event.eventType || GentlyEventType.SINGLE_VIBRATION;
    
    // Trigger time (Unix timestamp, 4 bytes little endian)
    if (event.triggerTime) {
      const timestamp = Math.floor(event.triggerTime.getTime() / 1000);
      payload[1] = timestamp & 0xff;
      payload[2] = (timestamp >> 8) & 0xff;
      payload[3] = (timestamp >> 16) & 0xff;
      payload[4] = (timestamp >> 24) & 0xff;
    }
    
    payload[5] = event.repeatDays || 0; // Days of week bitmask
    
    // Duration in seconds (2 bytes little endian)
    const duration = event.duration || 5;
    payload[6] = duration & 0xff;
    payload[7] = (duration >> 8) & 0xff;
    
    // Retrigger delay in seconds (2 bytes little endian)
    const retriggerDelay = event.retriggerDelay || 60;
    payload[8] = retriggerDelay & 0xff;
    payload[9] = (retriggerDelay >> 8) & 0xff;
    
    payload[10] = event.intensity || 50; // Intensity 0-100%
    
    // Remaining bytes are reserved/padding (already 0)
    
    return payload;
  }

  /**
   * Create set bracelet key command payload
   */
  createSetBraceletKeyPayload(braceletKey: Uint8Array): Uint8Array {
    if (braceletKey.length !== 16) {
      throw new Error('Bracelet key must be 16 bytes');
    }
    
    const payload = new Uint8Array(24); // 16 bytes key + 8 bytes padding
    payload.set(braceletKey, 0);
    // Remaining bytes are reserved/padding (already 0)
    
    return payload;
  }

  /**
   * Generate dynamic key from bracelet key, unique ID, and uptime
   * According to Gently BLE Protocol specification:
   * DynamicKey[0:15] = ( BraceletKey[0:15] ) XOR { Uptime[0:7], ( Uptime[0:7] XOR SerialNumber[0:7] ) }
   */
  generateDynamicKey(braceletKey: Uint8Array, uniqueId: Uint8Array, uptime: number): Uint8Array {
    // Convert uptime to 8-byte array (little endian)
    const uptimeBytes = new Uint8Array(8);
    uptimeBytes[0] = uptime & 0xff;
    uptimeBytes[1] = (uptime >> 8) & 0xff;
    uptimeBytes[2] = (uptime >> 16) & 0xff;
    uptimeBytes[3] = (uptime >> 24) & 0xff;
    uptimeBytes[4] = (uptime >> 32) & 0xff;
    uptimeBytes[5] = (uptime >> 40) & 0xff;
    uptimeBytes[6] = (uptime >> 48) & 0xff;
    uptimeBytes[7] = (uptime >> 56) & 0xff;
    
    // Create XOR of uptime and serial number (unique ID)
    const uptimeXorSerial = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      uptimeXorSerial[i] = uptimeBytes[i]! ^ uniqueId[i]!;
    }
    
    // Create 16-byte array: { Uptime[0:7], ( Uptime[0:7] XOR SerialNumber[0:7] ) }
    const combined16 = new Uint8Array(16);
    combined16.set(uptimeBytes, 0);           // First 8 bytes: uptime
    combined16.set(uptimeXorSerial, 8);       // Last 8 bytes: uptime XOR serial
    
    // DynamicKey = BraceletKey XOR combined16
    const dynamicKey = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      dynamicKey[i] = braceletKey[i]! ^ combined16[i]!;
    }
    
    return dynamicKey;
  }

  /**
   * Convert BCD (Binary Coded Decimal) to regular number
   */
  private bcdToNumber(bcd: number): number {
    return ((bcd >> 4) * 10) + (bcd & 0x0f);
  }

  /**
   * Convert number to BCD format
   */
  private numberToBcd(num: number): number {
    return ((Math.floor(num / 10) & 0x0f) << 4) | (num % 10);
  }

  /**
   * Convert byte array to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Calculate battery level percentage from voltage
   */
  calculateBatteryPercentage(voltageMillivolts: number): number {
    // Typical Li-ion battery voltage range: 3000mV (0%) to 4200mV (100%)
    const minVoltage = 3000;
    const maxVoltage = 4200;
    
    if (voltageMillivolts <= minVoltage) return 0;
    if (voltageMillivolts >= maxVoltage) return 100;
    
    return Math.round(((voltageMillivolts - minVoltage) / (maxVoltage - minVoltage)) * 100);
  }
}
