/**
 * Remove All Events Command
 * Removes all stored events from the device
 */

import type { BLECommandRequest } from "../types";
import { CommandCode } from "../types";

export function createRemoveAllEventsRequest(): BLECommandRequest {
  return {
    command: CommandCode.REMOVE_ALL_EVENTS,
    apiVersion: 1,
  };
}

export function parseRemoveAllEventsResponse(_payload: Uint8Array): void {
  // REMOVE_ALL_EVENTS acknowledgements carry no payload semantics.
}
