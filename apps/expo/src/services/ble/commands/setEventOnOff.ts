/**
 * Set Event ON/OFF Command (0x05)
 * Sets an existing event to ON or OFF state
 */

import type { BLECommandRequest, EventResponse } from "../types";
import { CommandCode, ResponseStatus } from "../types";

export function createSetEventOnOffRequest(
  eventIndex: number,
  isEnabled: boolean,
): BLECommandRequest {
  if (eventIndex < 0 || eventIndex > 49) {
    throw new Error("Event index must be between 0 and 49");
  }

  console.log(
    `🔧 Creating SET_EVENT_ON_OFF: index ${eventIndex}, enabled: ${isEnabled} (byte value: ${isEnabled ? "0x01" : "0x00"})`,
  );

  const payload = new Uint8Array(8);
  payload[0] = eventIndex;
  payload[1] = isEnabled ? 0x01 : 0x00;

  return {
    command: CommandCode.SET_EVENT_ON_OFF,
    payload,
  };
}

export function parseSetEventOnOffResponse(
  payload: Uint8Array,
  status: ResponseStatus = ResponseStatus.OK,
): EventResponse {
  if (payload.length < 1) {
    throw new Error("Invalid response payload length for setEventOnOff");
  }

  return {
    eventIndex: payload[0] ?? 0,
    status,
  };
}
