// Command protocol registry for mapping command codes to handlers

import { CommandCode, ResponseStatus } from "../protocol-types";
import { DeviceInfoCommand } from "./DeviceInfoCommand";
import { GetDeviceStatusCommand } from "./GetDeviceStatusCommand";
import { GetNumberOfEventsCommand } from "./GetNumberOfEventsCommand";
import { GetTimeCommand } from "./GetTimeCommand";
// Import command classes
import { GetUptimeCommand } from "./GetUptimeCommand";

// More commands will be added here as they get the parseResponse/createRequest methods

/**
 * Interface for command protocol handlers
 */
export interface CommandProtocolHandler {
  createRequest?: (...args: unknown[]) => Uint8Array;
  parseResponse: (payload: Uint8Array, status: ResponseStatus) => unknown;
  logPayloadDetails?: (payload: Uint8Array) => void;
}

/**
 * Registry mapping command codes to their protocol handlers
 */
export const COMMAND_PROTOCOL_REGISTRY = new Map<
  CommandCode,
  CommandProtocolHandler
>([
  [
    CommandCode.GET_UPTIME,
    {
      createRequest: () => GetUptimeCommand.createRequest(),
      parseResponse: (payload, status) =>
        GetUptimeCommand.parseResponse(payload, status),
      logPayloadDetails: (payload) =>
        GetUptimeCommand.logPayloadDetails(payload),
    },
  ],
  [
    CommandCode.GET_DEVICE_INFO,
    {
      createRequest: () => DeviceInfoCommand.createRequest(),
      parseResponse: (payload, status) =>
        DeviceInfoCommand.parseResponse(payload, status),
      logPayloadDetails: (payload) =>
        DeviceInfoCommand.logPayloadDetails(payload),
    },
  ],
  [
    CommandCode.GET_TIME,
    {
      createRequest: () => GetTimeCommand.createRequest(),
      parseResponse: (payload, status) =>
        GetTimeCommand.parseResponse(payload, status),
      logPayloadDetails: (payload) => GetTimeCommand.logPayloadDetails(payload),
    },
  ],
  [
    CommandCode.GET_DEVICE_STATUS,
    {
      createRequest: () => GetDeviceStatusCommand.createRequest(),
      parseResponse: (payload, status) =>
        GetDeviceStatusCommand.parseResponse(payload, status),
      logPayloadDetails: (payload) =>
        GetDeviceStatusCommand.logPayloadDetails(payload),
    },
  ],
  [
    CommandCode.GET_NUMBER_OF_EVENTS,
    {
      createRequest: () => GetNumberOfEventsCommand.createRequest(),
      parseResponse: (payload, status) =>
        GetNumberOfEventsCommand.parseResponse(payload, status),
      logPayloadDetails: (payload) =>
        GetNumberOfEventsCommand.logPayloadDetails(payload),
    },
  ],
  // More commands will be added here
]);

/**
 * Get the protocol handler for a command code
 */
export function getCommandHandler(
  commandCode: CommandCode,
): CommandProtocolHandler | undefined {
  return COMMAND_PROTOCOL_REGISTRY.get(commandCode);
}

/**
 * Check if a command has a registered protocol handler
 */
export function hasCommandHandler(commandCode: CommandCode): boolean {
  return COMMAND_PROTOCOL_REGISTRY.has(commandCode);
}

/**
 * Get human-readable command name
 */
export function getCommandName(command: CommandCode): string {
  const commandNames: Partial<Record<CommandCode, string>> = {
    [CommandCode.GET_UPTIME]: "GET_UPTIME",
    [CommandCode.GET_DEVICE_INFO]: "GET_DEVICE_INFO",
    [CommandCode.GET_EVENT]: "GET_EVENT",
    [CommandCode.ADD_EVENT]: "ADD_EVENT",
    [CommandCode.SET_EVENT_ON_OFF]: "SET_EVENT_ON_OFF",
    [CommandCode.GET_ALL_EVENTS]: "GET_ALL_EVENTS",
    [CommandCode.REMOVE_EVENT]: "REMOVE_EVENT",
    [CommandCode.REMOVE_ALL_EVENTS]: "REMOVE_ALL_EVENTS",
    [CommandCode.GET_NUMBER_OF_EVENTS]: "GET_NUMBER_OF_EVENTS",
    [CommandCode.GET_TIME]: "GET_TIME",
    [CommandCode.SET_TIME]: "SET_TIME",
    [CommandCode.GET_DEVICE_STATUS]: "GET_DEVICE_STATUS",
    [CommandCode.ACKNOWLEDGE_EVENT]: "ACKNOWLEDGE_EVENT",
    [CommandCode.SET_BRACELET_KEY]: "SET_BRACELET_KEY",
    [CommandCode.GET_BRACELET_KEY]: "GET_BRACELET_KEY",
    [CommandCode.FIND_ME]: "FIND_ME",
    [CommandCode.ENTER_DFU_MODE]: "ENTER_DFU_MODE",
    [CommandCode.REBOOT_BRACELET]: "REBOOT_BRACELET",
    [CommandCode.BATTERY_STATUS_NOTIFY]: "BATTERY_STATUS_NOTIFY",
    [CommandCode.ACTIVE_EVENT_NOTIFY]: "ACTIVE_EVENT_NOTIFY",
    [CommandCode.TIME_NOTIFY]: "TIME_NOTIFY",
  };
  return commandNames[command] ?? `UNKNOWN_COMMAND_${command}`;
}

/**
 * Get human-readable status name
 */
export function getStatusName(status: ResponseStatus): string {
  const statusNames: Partial<Record<ResponseStatus, string>> = {
    [ResponseStatus.OK]: "OK",
    [ResponseStatus.ERROR]: "ERROR",
  };
  return statusNames[status] ?? `UNKNOWN_STATUS_${status}`;
}
