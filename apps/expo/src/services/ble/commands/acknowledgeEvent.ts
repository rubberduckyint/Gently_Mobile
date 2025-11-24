/**
 * Acknowledge Event Command (0x0D)
 * Acknowledges/stops an active event - equivalent to double-pressing the button
 */

import type { BLECommandRequest, EventResponse } from "../types";
import { CommandCode, ResponseStatus } from "../types";

/**
 * Create a request to acknowledge/stop an active event
 *
 * @param eventIndex - The index of the event to acknowledge (0-49)
 * @returns BLE command request
 */
export function createAcknowledgeEventRequest(
  eventIndex: number,
): BLECommandRequest {
  if (eventIndex < 0 || eventIndex > 49) {
    throw new Error(`Event index must be between 0 and 49, got ${eventIndex}`);
  }

  console.log(`🔕 Creating ACKNOWLEDGE_EVENT: index ${eventIndex}`);

  const payload = new Uint8Array(8);
  payload[0] = eventIndex;
  // Bytes 1-7: Reserved (0 padded, already default for Uint8Array)

  return {
    command: CommandCode.ACKNOWLEDGE_EVENT,
    payload,
  };
}

/**
 * Parse the response from an acknowledge event request
 *
 * @param response - The decrypted response payload
 * @returns Event response with status and acknowledged event index
 */
export function parseAcknowledgeEventResponse(
  response: Uint8Array,
): EventResponse {
  const status = response[0];
  const eventIndex = response[1];

  console.log(
    `🔕 ACKNOWLEDGE_EVENT Response: status=${status === ResponseStatus.OK ? "OK" : "ERROR"}, eventIndex=${eventIndex}`,
  );

  return {
    eventIndex,
    status: status === ResponseStatus.OK ? ResponseStatus.OK : ResponseStatus.ERROR,
  };
}
