import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCProxyClient, httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@acme/api";

import { authClient } from "./auth";
import { getBaseUrl } from "./base-url";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
    },
  },
});

/**
 * A vanilla tRPC client for Expo.
 */
export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    loggerLink({
      enabled: (opts) =>
        process.env.NODE_ENV === "development" ||
        (opts.direction === "down" && opts.result instanceof Error),
      colorMode: "ansi",
    }),
    httpBatchLink({
      transformer: superjson,
      url: `${process.env.EXPO_PUBLIC_BASE_URL}/api/trpc`,
      headers() {
        const headers = new Map<string, string>();
        headers.set("x-trpc-source", "expo-react");

        const cookies = authClient.getCookie();
        if (cookies) {
          headers.set("Cookie", cookies);
        }
        return headers;
      },
    }),
  ],
});

/**
 * Provider component to wrap the app with React Query.
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

export { type RouterInputs, type RouterOutputs } from "@acme/api";
