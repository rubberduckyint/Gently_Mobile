/**
 * BLE Commands Export Module
 * Provides clean exports for all individual command functions
 */

// Device Information Commands
export { getUptime } from "./getUptime";
export type { UptimeResponse } from "./getUptime";

export { getDeviceInfo } from "./getDeviceInfo";
export type { DeviceInfoResponse } from "./getDeviceInfo";

export { getDeviceStatus } from "./getDeviceStatus";
export type { DeviceStatusResponse } from "./getDeviceStatus";

// Time Commands
export { getTime } from "./getTime";
export type { TimeResponse } from "./getTime";

export { setTime } from "./setTime";

// Event Commands
export { getNumberOfEvents } from "./getNumberOfEvents";
export type { EventsCountResponse } from "./getNumberOfEvents";

export { removeAllEvents } from "./removeAllEvents";

export { addEvent } from "./addEvent";
export { setEventOnOff } from "./setEventOnOff";

// Device Control Commands
export { findMe, findMeWithPattern } from "./findMe";
export { rebootDevice } from "./rebootDevice";

// Re-export common types from the main types module
export type {
  BLECommandRequest,
  BLECommandResponse,
  CommandCode,
  ResponseStatus,
  EventData,
  EventResponse,
} from "../types";

// Re-export enums as values
export {
  VibrationIntensity,
  LedPattern,
  LedColor,
  SeverityLevel,
} from "../types";
