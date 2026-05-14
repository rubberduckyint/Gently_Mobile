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
    // Hardcoded to .dev variant until the package rename (see coordinator
    // memory project_srf_deferred_threads.md "Mobile package rename"). The
    // .dev Android OAuth client is registered in Google Cloud against this
    // exact package; the legacy `com.gentlyus.gently` package is owned by
    // the previous developer's GCP project and conflicts on (package, SHA-1).
    package: "com.gentlyus.gently.dev",
    googleServicesFile: "./google-services.json",
    adaptiveIcon: {
      foregroundImage: IS_DEV
        ? "./assets/gently-white-no-background-dev.png"
        : "./assets/gently-white-no-background.png",
      backgroundColor: "#51b0d6",
    },
    edgeToEdgeEnabled: true,
    // BLE permissions are added by the react-native-ble-manager config plugin
    // (see plugins[] below). The plugin sets `android:usesPermissionFlags=
    // "neverForLocation"` on BLUETOOTH_SCAN and caps ACCESS_FINE_LOCATION at
    // maxSdkVersion=30, so Android 12+ devices get no Location prompt at all.
    // Without that attribute, Samsung Android 14 devices silently drop scan
    // results with "permission : false" in logcat (see ScanController log).
    permissions: ["android.permission.BLUETOOTH", "android.permission.BLUETOOTH_ADMIN"],
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
      "react-native-ble-manager",
      {
        // neverForLocation: declares BLUETOOTH_SCAN as not location-deriving,
        // which both (a) drops the legacy ACCESS_FINE_LOCATION prompt on
        // Android 12+ and (b) tells Samsung's ScanController to actually
        // deliver scan results to our client instead of silently dropping
        // them with "permission : false" in logcat.
        // isBleRequired: declares <uses-feature bluetooth_le required="true">
        // so Play Store filters out devices without BLE hardware.
        neverForLocation: true,
        isBleRequired: true,
      },
    ],
    [
      "@react-native-google-signin/google-signin",
      {
        // iOS clientId + URL scheme are placeholders from the previous
        // developer's GCP project. iOS sign-in is out of scope until iOS
        // OAuth clients are created in the gently-cgm GCP project. Android
        // is the v1 target — only androidClientId is load-bearing for now.
        iosUrlScheme:
          "com.googleusercontent.apps.947334995233-esim0ufno1bhk7c72idlc3qoltlqqncb",
        iosClientId:
          "947334995233-6li09ju14r42u6fkgm4btib13pilk34n.apps.googleusercontent.com",
        androidClientId:
          "782842188008-i2k706in72p9q2jnr7tiqkbjo6e9aufj.apps.googleusercontent.com",
      },
    ],
  ],
});
