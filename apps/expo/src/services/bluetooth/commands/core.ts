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

  console.log(
    `🔧 sendSecureCommand: Starting command 0x${commandCode.toString(16).padStart(2, "0")}`,
  );

  // Create the command request
  const commandPayload = payload ?? new Uint8Array(0);
  console.log(
    `🔧 sendSecureCommand: Creating request with payload size ${commandPayload.length}`,
  );

  const request = protocol.createRequest(commandCode, commandPayload);
  console.log(
    `🔧 sendSecureCommand: Request created, size ${request.length} bytes`,
  );

  // Send the command
  console.log(`🔧 sendSecureCommand: Writing to characteristic...`);
  await device.writeCharacteristicWithResponseForService(
    GENTLY_SERVICE_UUID,
    REQUEST_CHARACTERISTIC_UUID,
    uint8ArrayToBase64(request),
  );
  console.log(`🔧 sendSecureCommand: ✅ Write completed, reading response...`);

  // Read the response with timeout
  console.log(`🔧 sendSecureCommand: Reading response characteristic...`);
  const response = await device.readCharacteristicForService(
    GENTLY_SERVICE_UUID,
    RESPONSE_CHARACTERISTIC_UUID,
  );
  console.log(`🔧 sendSecureCommand: ✅ Response read completed`);

  if (!response.value) {
    throw new Error("No response received");
  }

  console.log(`🔧 sendSecureCommand: Parsing response...`);
  // Parse and return the response payload
  const parsedResponse = protocol.parseResponse(
    base64ToUint8Array(response.value),
  );
  console.log(
    `🔧 sendSecureCommand: ✅ Response parsed, payload size ${parsedResponse.payload.length}`,
  );

  return parsedResponse.payload;
}
