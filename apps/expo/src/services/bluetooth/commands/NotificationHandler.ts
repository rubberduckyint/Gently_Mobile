/**
 * Centralized Notification Handler
 *
 * Handles async notifications from the Gently device including battery status,
 * active events, and time notifications.
 */

import type { ActiveEventData } from "./ActiveEventNotifyCommand";
import type { BatteryStatusData } from "./BatteryStatusNotifyCommand";
import type { TimeData } from "./TimeNotifyCommand";
import { CommandCode } from "../protocol-types";
import { ActiveEventNotifyCommand } from "./ActiveEventNotifyCommand";
import { BatteryStatusNotifyCommand } from "./BatteryStatusNotifyCommand";
import { TimeNotifyCommand } from "./TimeNotifyCommand";

export interface NotificationHandler {
  onBatteryStatus?: (data: BatteryStatusData) => void;
  onActiveEvent?: (data: ActiveEventData) => void;
  onTime?: (data: TimeData) => void;
}

/**
 * Process an async notification from the device
 */
export function processAsyncNotification(
  command: CommandCode,
  payload: Uint8Array,
  handler?: NotificationHandler,
  logPrefix = "🔔 NOTIFICATION",
): void {
  try {
    switch (command) {
      case CommandCode.BATTERY_STATUS_NOTIFY: {
        const batteryData =
          BatteryStatusNotifyCommand.parseNotification(payload);
        console.log(`${logPrefix}: Battery status notification received`);
        BatteryStatusNotifyCommand.logNotificationDetails(batteryData);
        handler?.onBatteryStatus?.(batteryData);
        break;
      }

      case CommandCode.ACTIVE_EVENT_NOTIFY: {
        const eventData = ActiveEventNotifyCommand.parseNotification(payload);
        console.log(`${logPrefix}: Active event notification received`);
        ActiveEventNotifyCommand.logNotificationDetails(eventData);
        handler?.onActiveEvent?.(eventData);
        break;
      }

      case CommandCode.TIME_NOTIFY: {
        const timeData = TimeNotifyCommand.parseNotification(payload);
        console.log(`${logPrefix}: Time notification received`);
        TimeNotifyCommand.logNotificationDetails(timeData);
        handler?.onTime?.(timeData);
        break;
      }

      default:
        console.log(
          `${logPrefix}: Unknown notification command: 0x${command.toString(16).padStart(2, "0")}`,
        );
        break;
    }
  } catch (error) {
    console.error(
      `${logPrefix}: Failed to process notification for command 0x${command.toString(16).padStart(2, "0")}:`,
      error,
    );
  }
}

/**
 * Check if a command code is an async notification
 */
export function isAsyncNotification(command: CommandCode): boolean {
  return (
    command === CommandCode.BATTERY_STATUS_NOTIFY ||
    command === CommandCode.ACTIVE_EVENT_NOTIFY ||
    command === CommandCode.TIME_NOTIFY
  );
}

export type { BatteryStatusData, ActiveEventData, TimeData };
