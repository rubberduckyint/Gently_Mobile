/**
 * BLE Notification Parsers
 * Handles asynchronous notifications from the Gently bracelet
 */

export interface BatteryStatusNotification {
  command: 0x80;
  batteryVoltage: number; // in mV
  isCharging: boolean;
  batteryLevel: number; // 0=CRITICAL, 1=LOW, 2=MEDIUM, 3=GOOD, 4=FULL
  batteryLevelText: string;
}

export interface ActiveEventNotification {
  command: 0x81;
  eventIndex: number;
  eventState: number;
  eventStateText: string;
}

export interface TimeNotification {
  command: 0x82;
  year: number;
  month: number;
  date: number;
  weekDay: number;
  weekDayText: string;
  hour: number;
  minute: number;
  seconds: number;
  dateTime: Date;
}

/**
 * Parse Battery Status Notify (Command 0x80)
 * Format: API | Command | Reserved | Voltage(2 bytes) | Charging+Level | Reserved(2 bytes)
 */
export function parseBatteryStatusNotification(
  payload: Uint8Array,
): BatteryStatusNotification {
  if (payload.length < 6) {
    throw new Error(
      `Battery notification payload too short: ${payload.length} < 6`,
    );
  }

  // Byte 0: API Version (already handled by packet parser)
  // Byte 1: Command (0x80) (already handled by packet parser)
  // Byte 2: Reserved
  // Bytes 3-4: Battery voltage in mV (little endian)
  const batteryVoltage = ((payload[4] ?? 0) << 8) | (payload[3] ?? 0);

  // Byte 5: Charging status (bit 0) + Battery level (bits 1-7)
  const chargingAndLevel = payload[5] ?? 0;
  const isCharging = (chargingAndLevel & 0x01) === 1;
  const batteryLevel = (chargingAndLevel >> 1) & 0x0f;

  const batteryLevelTexts = ["CRITICAL", "LOW", "MEDIUM", "GOOD", "FULL"];
  const batteryLevelText = batteryLevelTexts[batteryLevel] ?? "UNKNOWN";

  return {
    command: 0x80,
    batteryVoltage,
    isCharging,
    batteryLevel,
    batteryLevelText,
  };
}

/**
 * Parse Active Event Notify (Command 0x81)
 * Format: API | Command | Reserved | Event Index | Event State | Reserved(3 bytes)
 */
export function parseActiveEventNotification(
  payload: Uint8Array,
): ActiveEventNotification {
  if (payload.length < 5) {
    throw new Error(
      `Active event notification payload too short: ${payload.length} < 5`,
    );
  }

  // Byte 0: API Version (already handled by packet parser)
  // Byte 1: Command (0x81) (already handled by packet parser)
  // Byte 2: Reserved
  // Byte 3: Event Index
  const eventIndex = payload[3] ?? 0;

  // Byte 4: Event Current State
  const eventState = payload[4] ?? 0;

  const eventStateTexts = [
    "OFF",
    "ON (inactive)",
    "ON (vibrating)",
    "ON (retrigger delay)",
    "ON (snooze period)",
  ];
  const eventStateText =
    eventStateTexts[eventState] ?? `UNKNOWN (0x${eventState.toString(16)})`;

  return {
    command: 0x81,
    eventIndex,
    eventState,
    eventStateText,
  };
}

/**
 * Parse Time Notify (Command 0x82)
 * Format: API | Command | Reserved | Year(BCD) | Month(BCD) | Date(BCD) | WeekDay | Hour(BCD) | Minute(BCD) | Seconds(BCD) | Reserved(6 bytes)
 */
export function parseTimeNotification(payload: Uint8Array): TimeNotification {
  if (payload.length < 10) {
    throw new Error(
      `Time notification payload too short: ${payload.length} < 10`,
    );
  }

  // Helper function to convert BCD to decimal
  const bcdToDecimal = (bcd: number): number => {
    return (bcd >> 4) * 10 + (bcd & 0x0f);
  };

  // Byte 0: API Version (already handled by packet parser)
  // Byte 1: Command (0x82) (already handled by packet parser)
  // Byte 2: Reserved
  // Byte 3: Year in BCD (0x00-0x99 for 2000-2099)
  const year = 2000 + bcdToDecimal(payload[3] ?? 0);

  // Byte 4: Month in BCD (0x01-0x12)
  const month = bcdToDecimal(payload[4] ?? 0);

  // Byte 5: Date in BCD (0x01-0x31)
  const date = bcdToDecimal(payload[5] ?? 0);

  // Byte 6: Week day (0-6, Sunday=0)
  const weekDay = payload[6] ?? 0;

  // Byte 7: Hour in BCD (0x00-0x23)
  const hour = bcdToDecimal(payload[7] ?? 0);

  // Byte 8: Minute in BCD (0x00-0x59)
  const minute = bcdToDecimal(payload[8] ?? 0);

  // Byte 9: Seconds in BCD (0x00-0x59)
  const seconds = bcdToDecimal(payload[9] ?? 0);

  const weekDayTexts = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const weekDayText = weekDayTexts[weekDay] ?? "UNKNOWN";

  // Create JavaScript Date object
  const dateTime = new Date(year, month - 1, date, hour, minute, seconds);

  return {
    command: 0x82,
    year,
    month,
    date,
    weekDay,
    weekDayText,
    hour,
    minute,
    seconds,
    dateTime,
  };
}

/**
 * Parse any notification based on command code
 */
export function parseNotification(
  payload: Uint8Array,
):
  | BatteryStatusNotification
  | ActiveEventNotification
  | TimeNotification
  | null {
  if (payload.length < 2) {
    return null;
  }

  const command = payload[1]; // Command is at byte 1 after API version

  switch (command) {
    case 0x80:
      return parseBatteryStatusNotification(payload);
    case 0x81:
      return parseActiveEventNotification(payload);
    case 0x82:
      return parseTimeNotification(payload);
    default:
      return null;
  }
}
