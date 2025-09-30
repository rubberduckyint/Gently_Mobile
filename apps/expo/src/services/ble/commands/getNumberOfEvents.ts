/**
 * Get Number of Events Command
 * Gets the count of stored events on the device
 */

import type { BLECommandRequest } from "../types";
import { CommandCode } from "../types";

export interface EventsCountResponse {
  count: number;
  maxEvents: number; // If available from device
  rawPayload: Uint8Array; // For debugging
}

export function createGetNumberOfEventsRequest(): BLECommandRequest {
  return {
    command: CommandCode.GET_NUMBER_OF_EVENTS,
    apiVersion: 1,
  };
}

export function parseGetNumberOfEventsResponse(
  payload: Uint8Array,
): EventsCountResponse {
  if (payload.length < 1) {
    throw new Error("Invalid events count response: payload too short");
  }

  const totalEvents = payload[0] ?? 0;
  const reservedBytes = payload.slice(1);

  let maxEvents = 50;
  const reservedHint = reservedBytes[0];
  if (reservedHint !== undefined && reservedHint !== 0) {
    maxEvents = reservedHint;
  }

  return {
    count: totalEvents,
    maxEvents,
    rawPayload: payload,
  };
}
