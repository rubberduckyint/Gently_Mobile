/**
 * Remove Event (Command 0x07)
 * Removes a single event from the bracelet by its index
 */

import type { BLECommandRequest } from "../types";
import { CommandCode, API_VERSION } from "../types";

/**
 * Create a Remove Event command request.
 * Removes a single alarm/event from the device at the specified index.
 *
 * @param eventIndex - The index of the event to remove (0-49)
 * @returns The BLE command request buffer
 */
export function createRemoveEventRequest(
  eventIndex: number,
): BLECommandRequest {
  if (eventIndex < 0 || eventIndex > 49) {
    throw new Error("Event index must be between 0 and 49");
  }

  return {
    command: CommandCode.REMOVE_EVENT,
    apiVersion: API_VERSION,
    payload: new Uint8Array([eventIndex]),
  };
}

/**
 * Response format:
 * - OK: Status = 0x00
 * - ERROR: Status = 0x01
 */
export interface RemoveEventResponse {
  status: "SUCCESS" | "ERROR";
  eventIndex: number;
}

/**
 * Parse the response from a Remove Event command.
 *
 * @param payload - The response payload from the device
 * @param bleStatus - The BLE status code (0x00 = OK, 0x01 = ERROR)
 * @param commandCode - The command code from the response
 * @returns Object indicating if the removal was successful
 */
export function parseRemoveEventResponse(
  payload: Uint8Array,
  bleStatus: number,
  commandCode: number,
): {
  status: "SUCCESS" | "ERROR";
  eventIndex?: number;
} {
  console.log(
    `📥 Parsing REMOVE_EVENT response: ${bleStatus === 0 ? "OK" : "ERROR"}`,
  );

  // Validate command code matches REMOVE_EVENT (0x07)
  if (commandCode !== 0x07) {
    console.warn(
      `⚠️ Command mismatch: got 0x${commandCode.toString(16)}, expected 0x07`,
    );
  }

  const status: "SUCCESS" | "ERROR" = bleStatus === 0x00 ? "SUCCESS" : "ERROR";

  // Parse event index from payload if available
  let eventIndex: number | undefined;
  if (payload.length >= 2) {
    const indexByte = payload[1];
    if (indexByte !== undefined) {
      eventIndex = indexByte;
    }
  }

  console.log(
    `  - Event ${status === "SUCCESS" ? "removed" : "removal failed"}${eventIndex !== undefined ? ` at index ${eventIndex}` : ""}`,
  );

  return { status, eventIndex };
}
