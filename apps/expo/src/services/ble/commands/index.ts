/**
 * BLE Commands Index
 * Exports all BLE command functions for the Gently Bracelet
 * Based on BLE Protocol Rev 0.6 [API 2]
 */

// Core commands
export * from "./addEvent";
export * from "./getAllEvents";
export * from "./removeEvent";
export * from "./removeAllEvents";
export * from "./setEventOnOff";
export * from "./getUptime";
export * from "./getDeviceInfo";
export * from "./getDeviceStatus";
export * from "./getNumberOfEvents";
export * from "./getTime";
export * from "./setTime";
export * from "./findMe";
export * from "./enterDfuMode";
export * from "./rebootDevice";

// New commands in Rev 0.6
export * from "./triggerLedPattern";
export * from "./triggerAudioPattern";
export * from "./triggerVibrationPattern";
