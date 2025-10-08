import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Disable all caching to avoid stale data issues
        staleTime: 0, // No caching - consider data stale immediately
        gcTime: 0, // No garbage collection time - data removed immediately
        refetchOnMount: "always", // Always refetch when component mounts
        refetchOnWindowFocus: true, // Refetch when window gains focus
        refetchOnReconnect: true, // Refetch when network reconnects
      },
      mutations: {
        gcTime: 0, // No garbage collection time for mutations
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
        shouldRedactErrors: () => {
          // We should not catch Next.js server errors
          // as that's how Next.js detects dynamic pages
          // so we cannot redact them.
          // Next.js also automatically redacts errors for us
          // with better digests.
          return false;
        },
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
