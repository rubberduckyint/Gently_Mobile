import * as SecureStore from "expo-secure-store";
import { expoClient } from "@better-auth/expo/client";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { createAuthClient } from "better-auth/react";

// Configure Google Sign-In
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
if (process.env.NODE_ENV === "development") {
  console.log("Google Sign-In Configuration:", {
    webClientId,
    hasClientId: !!webClientId,
    clientIdLength: webClientId?.length,
  });
}

if (!webClientId) {
  throw new Error(
    "Google Sign-In configuration error: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID environment variable is missing or empty. Please set this variable to your Google OAuth web client ID.",
  );
}
GoogleSignin.configure({
  webClientId,
});

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_BASE_URL,
  plugins: [
    expoClient({
      scheme: "gently",
      storagePrefix: "gently",
      storage: SecureStore,
    }),
  ],
});

export { GoogleSignin };
