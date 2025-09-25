/**
 * Set Event ON/OFF Command (0x05)
 * Sets an existing event to ON or OFF state
 */

import type { EventResponse } from "../types";
import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

/**
 * Set an existing event to ON or OFF state
 */
export async function setEventOnOff(
  serialNumber: string,
  eventIndex: number,
  isEnabled: boolean,
): Promise<EventResponse> {
  // Validate event index (0-49)
  if (eventIndex < 0 || eventIndex > 49) {
    throw new Error("Event index must be between 0 and 49");
  }

  // Create payload according to BLE protocol specification
  const payload = new Uint8Array(8); // 8 bytes total
  let offset = 0;

  // Byte #2: Event Index
  payload[offset++] = eventIndex;

  // Byte #3: State (OFF = 0x00, ON = 0x01)
  payload[offset++] = isEnabled ? 0x01 : 0x00;

  // Bytes #4-7: RESERVED (0 Padded) - already initialized to 0

  console.log(
    `\n🎯 Setting event ${eventIndex} to ${isEnabled ? "ON" : "OFF"}`,
  );

  const response = await executeBLECommand(
    {
      command: CommandCode.SET_EVENT_ON_OFF,
      payload: payload,
    },
    serialNumber,
  );

  if (response.status !== ResponseStatus.OK) {
    console.log(
      `❌ Failed to set event ${eventIndex} to ${isEnabled ? "ON" : "OFF"}`,
    );
    throw new Error(`Failed to set event state: status ${response.status}`);
  }

  if (response.payload.length < 1) {
    throw new Error("Invalid response payload length for setEventOnOff");
  }

  const responseEventIndex = response.payload[0] ?? eventIndex;
  const reservedBytes = response.payload.slice(1);
  const payloadHex = Array.from(response.payload)
    .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
    .join(" ");
  const reservedHex = Array.from(reservedBytes)
    .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
    .join(" ");

  const result: EventResponse = {
    eventIndex: responseEventIndex,
    status: response.status,
  };

  console.log(`   • Event Index : ${responseEventIndex}`);
  if (reservedBytes.length > 0) {
    console.log(`   • Reserved    : ${reservedHex || "0x00"}`);
  }
  console.log(`   • Raw Bytes   : ${payloadHex}`);
  console.log(
    `✅ Event ${eventIndex} set to ${isEnabled ? "ON" : "OFF"} successfully`,
  );

  return result;
}
