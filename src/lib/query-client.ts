import { QueryClient } from "@tanstack/react-query";

/**
 * Shared singleton QueryClient instance with domain-conscious defaults for KCT Pulse.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute default stale time
      gcTime: 10 * 60 * 1000, // 10 minutes cache retention
      retry: 1, // Maximum 1 retry on network error
      refetchOnWindowFocus: false, // Prevent disruptive refetches while faculty is lecturing
      refetchOnReconnect: true,
    },
  },
});
