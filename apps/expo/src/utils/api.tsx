import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCProxyClient, httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@gently/api";

import { authClient } from "./auth";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // No caching - consider data stale immediately
      gcTime: 0, // No garbage collection time - data removed immediately
      refetchOnMount: "always", // Always refetch when component mounts
      refetchOnWindowFocus: true, // Refetch when app comes to foreground
      refetchOnReconnect: true, // Refetch when network reconnects
    },
    mutations: {
      gcTime: 0, // No garbage collection time for mutations
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
      logger: (opts) => {
        // Log all errors with more detail
        if (opts.direction === "down" && opts.result instanceof Error) {
          console.error(`❌ [tRPC Error] ${opts.path}:`, opts.result);
        } else if (process.env.NODE_ENV === "development") {
          console.log(`[tRPC ${opts.direction}] ${opts.path}`);
        }
      },
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
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

export { type RouterInputs, type RouterOutputs } from "@gently/api";
