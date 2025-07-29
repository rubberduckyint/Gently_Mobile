import * as SecureStore from "expo-secure-store";
import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";

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
