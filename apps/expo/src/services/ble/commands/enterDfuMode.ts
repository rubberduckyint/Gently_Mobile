/**
 * Enter DFU Mode Command
 * Reboots the bracelet into Device Firmware Update (DFU) mode
 * 
 * The bracelet will:
 * 1. Reboot into DFU mode
 * 2. Re-initialize Bluetooth with GATT DFU SMP Service
 * 3. Advertise as "Gently-DFU"
 * 4. Wait 1 minute for connection, then reboot to normal mode if no connection
 * 
 * Use Nordic's "Device Manager" app to transfer firmware in DFU mode.
 */

import type { BLECommandRequest } from "../types";
import { CommandCode } from "../types";

export function createEnterDfuModeRequest(): BLECommandRequest {
  return {
    command: CommandCode.ENTER_DFU_MODE,
    apiVersion: 1,
    // No payload needed for this command
  };
}

export function parseEnterDfuModeResponse(_payload: Uint8Array): void {
  // ENTER_DFU_MODE responses do not include structured payload data.
  // The device will reboot into DFU mode if the response is OK.
}
