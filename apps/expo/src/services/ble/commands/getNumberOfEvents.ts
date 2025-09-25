/**
 * Get Number of Events Command
 * Gets the count of stored events on the device
 */

import { executeBLECommand } from "../connection";
import { CommandCode, ResponseStatus } from "../types";

export interface EventsCountResponse {
  count: number;
  maxEvents: number; // If available from device
  rawPayload: Uint8Array; // For debugging
}

/**
 * Get number of stored events on device
 */
export async function getNumberOfEvents(
  serialNumber: string,
): Promise<EventsCountResponse> {
  try {
    console.log("\n📊 Requesting number of events...");

    const response = await executeBLECommand(
      {
        command: CommandCode.GET_NUMBER_OF_EVENTS,
        apiVersion: 1,
      },
      serialNumber,
    );

    if (response.status !== ResponseStatus.OK) {
      throw new Error(`Command failed with status: ${response.status}`);
    }

    if (response.payload.length < 1) {
      throw new Error("Invalid events count response: payload too short");
    }

    const payload = response.payload;
    const totalEvents = payload[0] ?? 0;
    const reservedBytes = payload.slice(1);

    let maxEvents = 50; // Protocol supports up to 50 events
    const reservedHint = reservedBytes[0];
    if (reservedHint !== undefined && reservedHint !== 0) {
      maxEvents = reservedHint;
    }

    const eventsInfo: EventsCountResponse = {
      count: totalEvents,
      maxEvents,
      rawPayload: payload,
    };

    const payloadHex = Array.from(payload)
      .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
      .join(" ");
    const capacityLabel = maxEvents
      ? `${totalEvents}/${maxEvents}`
      : `${totalEvents} (capacity unknown)`;
    const percentFull =
      maxEvents > 0
        ? Math.min(100, Math.round((totalEvents / maxEvents) * 100))
        : undefined;

    console.log(`   • Stored Events: ${totalEvents}`);
    console.log(
      `   • Capacity     : ${capacityLabel}${percentFull !== undefined ? ` (${percentFull}%)` : ""}`,
    );
    if (reservedBytes.length > 0) {
      const reservedHex = Array.from(reservedBytes)
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(" ");
      console.log(`   • Reserved     : ${reservedHex}`);
    }
    console.log(`   • Raw Bytes    : ${payloadHex}`);

    return eventsInfo;
  } catch (error) {
    console.error("❌ Failed to get number of events:", error);
    throw new Error(
      `Failed to get number of events: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
