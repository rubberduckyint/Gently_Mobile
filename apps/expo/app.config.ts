import type { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? "Gently - DEV" : "Gently",
  slug: "gently",
  scheme: "gently",
  owner: "surferdave",
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
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      "com.apple.developer.applesignin": ["Default"],
    },
  },
  android: {
    package: IS_DEV ? "com.gentlyus.gently.dev" : "com.gentlyus.gently",
    googleServicesFile: "./google-services.json",
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
    ],
  },
  extra: {
    eas: {
      projectId: "5d361b77-11db-4d28-8097-972e1975c4c1",
    },
  },
  experiments: {
    tsconfigPaths: true,
    typedRoutes: true,
    autolinkingModuleResolution: true,
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-web-browser",
    "expo-apple-authentication",
    "@react-native-community/datetimepicker",
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
