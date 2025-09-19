// Core command infrastructure for Gently BLE protocol
import type { SecureConnectionResult } from "../connection";
import type { CommandCode } from "../protocol-types";
import { base64ToUint8Array, uint8ArrayToBase64 } from "../../../utils/base64";
import {
  GENTLY_SERVICE_UUID,
  REQUEST_CHARACTERISTIC_UUID,
  RESPONSE_CHARACTERISTIC_UUID,
} from "../protocol-types";

/**
 * Send a command and get response using secure protocol
 * This is the core function used by all BLE commands
 */
export async function sendSecureCommand(
  connectionResult: SecureConnectionResult,
  commandCode: CommandCode,
  payload?: Uint8Array,
): Promise<Uint8Array> {
  const { device, protocol } = connectionResult;

  // Create the command request
  const commandPayload = payload ?? new Uint8Array(0);
  const request = protocol.createRequest(commandCode, commandPayload);

  // Send the command
  await device.writeCharacteristicWithResponseForService(
    GENTLY_SERVICE_UUID,
    REQUEST_CHARACTERISTIC_UUID,
    uint8ArrayToBase64(request),
  );

  // Read the response with timeout
  try {
    const response = await device.readCharacteristicForService(
      GENTLY_SERVICE_UUID,
      RESPONSE_CHARACTERISTIC_UUID,
    );

    if (!response.value) {
      throw new Error("No response received");
    }

    // Parse and return the response payload
    const parsedResponse = protocol.parseResponse(
      base64ToUint8Array(response.value),
    );

    return parsedResponse.payload;
  } catch {
    // Handle case where response was already delivered via notification
    // Note: This is expected behavior - the response characteristic (0xF024) is
    // notification-only according to the Gently BLE protocol specification.
    // Responses are delivered via notifications, not direct reads.

    // Return an empty response to indicate fallback mode
    // Commands should check length and skip processing if empty
    return new Uint8Array(0);
  }
}

/**
 * Send a command and get multiple response packets using secure protocol
 * This function handles commands that return multiple response packets (like GET_ALL_EVENTS)
 *
 * Uses the single-packet approach multiple times since multi-packet responses
 * appear to be delivered as separate command responses rather than continuous data.
 *
 * @param connectionResult - The secure BLE connection
 * @param commandCode - The command to send
 * @param payload - Optional payload data
 * @param packetNumberIndex - Index of packet number in response payload (default: 1)
 * @param totalPacketsIndex - Index of total packets in response payload (default: 2)
 * @param maxPackets - Maximum number of packets to read as safety limit (default: 50)
 * @returns Array of response payloads, one for each packet
 */
export async function sendSecureCommandMultiPacket(
  connectionResult: SecureConnectionResult,
  commandCode: CommandCode,
  payload?: Uint8Array,
  options: {
    packetNumberIndex?: number;
    totalPacketsIndex?: number;
    maxPackets?: number;
  } = {},
): Promise<Uint8Array[]> {
  const {
    packetNumberIndex = 1,
    totalPacketsIndex = 2,
    maxPackets = 50,
  } = options;

  // Send the initial command using the regular single-packet function
  const firstResponse = await sendSecureCommand(
    connectionResult,
    commandCode,
    payload,
  );

  // Validate first response has the required packet info
  if (firstResponse.length <= Math.max(packetNumberIndex, totalPacketsIndex)) {
    throw new Error(
      `First response payload too short to contain packet information (${firstResponse.length} bytes)`,
    );
  }

  const totalPackets = firstResponse[totalPacketsIndex] ?? 0;

  if (totalPackets === 0) {
    return [];
  }

  if (totalPackets > maxPackets) {
    throw new Error(
      `Total packets (${totalPackets}) exceeds safety limit (${maxPackets})`,
    );
  }

  const responses: Uint8Array[] = [firstResponse];
  let packetsReceived = 1;

  // If there are more packets, continue reading them
  while (packetsReceived < totalPackets) {
    try {
      // For subsequent packets, we might need to send an empty request or just read
      // Let's try reading the next response directly first
      const nextResponse = await sendSecureCommand(
        connectionResult,
        commandCode,
        new Uint8Array(0),
      );

      // Validate packet info
      if (
        nextResponse.length <= Math.max(packetNumberIndex, totalPacketsIndex)
      ) {
        break;
      }

      const packetNumber = nextResponse[packetNumberIndex] ?? 0;
      const totalPacketsFromResponse = nextResponse[totalPacketsIndex] ?? 0;

      if (totalPacketsFromResponse !== totalPackets) {
        console.warn(
          `Multi-packet total mismatch: expected ${totalPackets}, got ${totalPacketsFromResponse} in packet ${packetNumber}`,
        );
      }

      responses.push(nextResponse);
      packetsReceived++;
    } catch {
      break;
    }
  }

  if (packetsReceived < totalPackets) {
    console.warn(
      `Incomplete multi-packet response: received ${packetsReceived}/${totalPackets} packets`,
    );
  }

  return responses;
}
