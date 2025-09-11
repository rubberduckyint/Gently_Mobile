// Core command infrastructure for Gently BLE protocol
import type { SecureConnectionResult } from "../connection";
import type { CommandCode } from "../protocol";
import { base64ToUint8Array, uint8ArrayToBase64 } from "../../../utils/base64";
import {
  GENTLY_SERVICE_UUID,
  REQUEST_CHARACTERISTIC_UUID,
  RESPONSE_CHARACTERISTIC_UUID,
} from "../protocol";

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

  // Read the response
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
}
