/**
 * BLE utility helpers shared across the Expo app.
 */

import { PermissionsAndroid, Platform } from "react-native";

/**
 * Request the Bluetooth permissions required for scanning and connecting to Gently bracelets.
 */
export async function requestBluetoothPermissions(): Promise<boolean> {
  console.log("\uD83D\uDD10 Requesting Bluetooth permissions...");

  if (Platform.OS === "android") {
    try {
      const apiLevel =
        typeof Platform.Version === "number"
          ? Platform.Version
          : parseInt(String(Platform.Version), 10);

      if (!Number.isFinite(apiLevel)) {
        console.warn(
          "⚠️ Unable to determine Android API level. Assuming location permission is required.",
        );
      }

      if (Number(apiLevel) >= 31) {
        console.log(
          "🆕 Android 12+ detected, requesting BLUETOOTH_SCAN and BLUETOOTH_CONNECT",
        );

        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        const results = await PermissionsAndroid.requestMultiple(permissions);
        const allGranted = Object.values(results).every(
          (result) => result === PermissionsAndroid.RESULTS.GRANTED,
        );

        if (!allGranted) {
          console.warn("❌ Required Bluetooth permissions not granted");
        }

        return allGranted;
      }

      console.log(
        "📍 Pre-Android 12 detected, requesting ACCESS_FINE_LOCATION",
      );
      const locationPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );

      const granted = locationPermission === PermissionsAndroid.RESULTS.GRANTED;

      if (!granted) {
        console.warn("❌ Location permission denied");
      }

      return granted;
    } catch (error) {
      console.error("❌ Permission request failed:", error);
      return false;
    }
  }

  console.log(
    "🍎 iOS detected – Bluetooth permissions handled by the OS pairing dialog",
  );
  return true;
}
