import type { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? "Gently - DEV" : "Gently",
  slug: "gently",
  scheme: "gently",
  version: "0.1.0",
  orientation: "portrait",
  icon: IS_DEV
    ? "./assets/gently-ios-blue-dev.png"
    : "./assets/gently-ios-blue.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/gently-splash-logo.png",
    resizeMode: "contain",
    backgroundColor: "#51b0d6",
  },
  updates: {
    fallbackToCacheTimeout: 0,
  },
  newArchEnabled: true,
  assetBundlePatterns: ["**/*"],
  ios: {
    bundleIdentifier: IS_DEV
      ? "com.gentlyus.mobile-dev"
      : "com.gentlyus.mobile",
    supportsTablet: true,
    icon: IS_DEV
      ? {
          light: "./assets/gently-ios-blue-dev.png",
          dark: "./assets/gently-ios-dark-dev.png",
        }
      : {
          light: "./assets/gently-ios-blue.png",
          dark: "./assets/gently-ios-dark.png",
        },
    infoPlist: {
      NSBluetoothAlwaysUsageDescription:
        "This app uses Bluetooth to connect to your Gently devices for monitoring and control.",
      NSBluetoothPeripheralUsageDescription:
        "This app uses Bluetooth to connect to your Gently devices for monitoring and control.",
      NSLocationWhenInUseUsageDescription:
        "This app needs location access to scan for Bluetooth devices.",
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      "com.apple.developer.applesignin": ["Default"],
    },
  },
  android: {
    package: IS_DEV ? "com.gentlyus.gently.dev" : "com.gentlyus.gently",
    adaptiveIcon: {
      foregroundImage: IS_DEV
        ? "./assets/gently-white-no-background-dev.png"
        : "./assets/gently-white-no-background.png",
      backgroundColor: "#51b0d6",
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
  },
  extra: {
    eas: {
      projectId: "e881c3b6-0d21-4cc4-8933-176c9d6eb00e",
    },
  },
  experiments: {
    tsconfigPaths: true,
    typedRoutes: true,
    autolinkingModuleResolution: true,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-web-browser",
    "expo-location",
    "expo-apple-authentication",
    [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme:
          "com.googleusercontent.apps.947334995233-esim0ufno1bhk7c72idlc3qoltlqqncb",
        iosClientId:
          "947334995233-6li09ju14r42u6fkgm4btib13pilk34n.apps.googleusercontent.com",
        androidClientId:
          "947334995233-dihv04slek371rgobnjc2855518aqtbr.apps.googleusercontent.com",
      },
    ],
  ],
});
