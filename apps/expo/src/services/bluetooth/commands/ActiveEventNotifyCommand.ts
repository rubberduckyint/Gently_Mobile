/**
 * Active Event Notification Command
 *
 * This is an async notification sent by the device when an event becomes active or changes state.
 * It does not require a request from the app - it's automatically sent by the device.
 */

import type { BLECommandExecutionContext, BLECommandMetadata } from "./base";
import { EventState } from "../protocol-types";
import { BLECommand } from "./base";

export interface ActiveEventData {
  eventIndex: number; // Index of the event (0-49)
  eventState: EventState; // Current state of the event
  timestamp: Date; // When the notification was received
}

export class ActiveEventNotifyCommand extends BLECommand<ActiveEventData> {
  readonly metadata: BLECommandMetadata = {
    id: "active-event-notify",
    name: "Active Event Notification",
    description: "Async notification from device about event state changes",
    category: "notification",
    version: "1.0.0",
    requiresConnection: false, // This is a notification, not a request
    estimatedDuration: 0,
    tags: ["event", "notification", "async"],
  };

  /**
   * Parse the notification payload for active event data
   */
  static parseNotification(payload: Uint8Array): ActiveEventData {
    if (payload.length < 2) {
      throw new Error(
        `Invalid active event notification: payload too short (${payload.length} bytes, expected at least 2)`,
      );
    }

    const eventIndex = payload[0] ?? 0;
    const eventState = payload[1] ?? 0;

    // Validate event state
    if (!Object.values(EventState).includes(eventState as EventState)) {
      console.warn(
        `Unknown event state: 0x${eventState.toString(16).padStart(2, "0")}`,
      );
    }

    return {
      eventIndex,
      eventState: eventState as EventState,
      timestamp: new Date(),
    };
  }

  /**
   * Get human-readable event state name
   */
  static getEventStateName(state: EventState): string {
    const stateNames: Record<EventState, string> = {
      [EventState.OFF]: "OFF",
      [EventState.ON_INACTIVE]: "ON (Inactive)",
      [EventState.ON_ACTIVE_VIBRATION]: "ON (Active - Vibrating)",
      [EventState.ON_ACTIVE_RETRIGGER_DELAY]: "ON (Active - Retrigger Delay)",
      [EventState.ON_ACTIVE_SNOOZE_PERIOD]: "ON (Active - Snooze Period)",
    };
    return (
      stateNames[state] || `UNKNOWN(0x${state.toString(16).padStart(2, "0")})`
    );
  }

  /**
   * Log human-readable details about the active event notification
   */
  static logNotificationDetails(data: ActiveEventData): void {
    console.log("📅 ACTIVE EVENT NOTIFICATION:");
    console.log(`   • Event Index: ${data.eventIndex}`);
    console.log(
      `   • Event State: ${this.getEventStateName(data.eventState)} (0x${data.eventState.toString(16).padStart(2, "0")})`,
    );
    console.log(`   • Received: ${data.timestamp.toISOString()}`);

    // Add context based on state
    if (data.eventState === EventState.ON_ACTIVE_VIBRATION) {
      console.log("   🔔 Event is actively vibrating!");
    } else if (data.eventState === EventState.OFF) {
      console.log("   ⏹️  Event has been turned off");
    }
  }

  protected executeImpl(
    _context: BLECommandExecutionContext,
  ): Promise<ActiveEventData> {
    throw new Error(
      "ActiveEventNotifyCommand cannot be executed - it's a notification handler only",
    );
  }
}
