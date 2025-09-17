// Commands module exports - re-export all command functions for easy importing

// Core command infrastructure
export { sendSecureCommand } from "./core";

// Base command architecture
export * from "./base";
export * from "./registry";

// Individual BLE Command Classes
export { CreateEventCommand } from "./CreateEventCommand";
export { DeviceInfoCommand } from "./DeviceInfoCommand";
export { FindMeCommand } from "./FindMeCommand";
export { GetUptimeCommand } from "./GetUptimeCommand";
export { GetDeviceStatusCommand } from "./GetDeviceStatusCommand";
export { GetTimeCommand } from "./GetTimeCommand";
export { SetTimeCommand } from "./SetTimeCommand";
export { RebootDeviceCommand } from "./RebootDeviceCommand";
export { EnterDFUModeCommand } from "./EnterDFUModeCommand";
export { GetNumberOfEventsCommand } from "./GetNumberOfEventsCommand";
export { RemoveAllEventsCommand } from "./RemoveAllEventsCommand";

// Notification Commands (async from device)
export { BatteryStatusNotifyCommand } from "./BatteryStatusNotifyCommand";
export { ActiveEventNotifyCommand } from "./ActiveEventNotifyCommand";
export { TimeNotifyCommand } from "./TimeNotifyCommand";

// Notification handling utilities
export {
  processAsyncNotification,
  isAsyncNotification,
  type NotificationHandler,
  type BatteryStatusData,
  type ActiveEventData,
  type TimeData,
} from "./NotificationHandler";

// Advertisement parsing
export {
  decryptAdvertisementPayload,
  parseManufacturerData,
  parseGentlyAdvertisementPayload,
} from "./advertisement";
