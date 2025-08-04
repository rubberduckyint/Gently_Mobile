import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Gently",
  slug: "gently",
  owner: "gentlyus",
  scheme: "gently",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon-light.png",
  userInterfaceStyle: "automatic",
  updates: {
    fallbackToCacheTimeout: 0,
  },
  newArchEnabled: true,
  assetBundlePatterns: ["**/*"],
  // Add explicit URL schemes for deep linking
  web: {
    bundler: "metro",
  },
  ios: {
    bundleIdentifier: "com.gentlyus.gently",
    supportsTablet: true,
    icon: {
      light: "./assets/icon-light.png",
      dark: "./assets/icon-dark.png",
    },
    associatedDomains: ["applinks:gently.com"],
    infoPlist: {
      NSBluetoothAlwaysUsageDescription:
        "This app uses Bluetooth to connect to your Gently devices for monitoring and control.",
      NSBluetoothPeripheralUsageDescription:
        "This app uses Bluetooth to connect to your Gently devices for monitoring and control.",
      NSLocationWhenInUseUsageDescription:
        "This app needs location access to scan for Bluetooth devices.",
      CFBundleURLTypes: [
        {
          CFBundleURLName: "gently",
          CFBundleURLSchemes: ["gently"],
        },
      ],
    },
  },
  android: {
    package: "com.gentlyus.gently",
    adaptiveIcon: {
      foregroundImage: "./assets/icon-light.png",
      backgroundColor: "#1F104A",
    },
    edgeToEdgeEnabled: true,
    permissions: [
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
    ],
    intentFilters: [
      {
        action: "VIEW",
        data: [
          {
            scheme: "gently",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  extra: {
    eas: {
      projectId: "e881c3b6-0d21-4cc4-8933-176c9d6eb00e",
    },
  },
  experiments: {
    tsconfigPaths: true,
    typedRoutes: true,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-web-browser",
    "expo-location",
    [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme: "com.googleusercontent.apps.794576735787-72vm956ffsir74jfm8pc1laea1s16fcs",
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#E4E4E7",
        image: "./assets/icon-light.png",
        dark: {
          backgroundColor: "#18181B",
          image: "./assets/icon-dark.png",
        },
      },
    ],
  ],
});
