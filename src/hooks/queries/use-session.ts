import { useQuery } from "@tanstack/react-query";
import { getSessionById, SessionDetail } from "@/services/sessions/session-service";

export const sessionKeys = {
  all: ["session"] as const,
  detail: (sessionId: string | null | undefined) => ["session", sessionId] as const,
};

/**
 * Hook to retrieve a single session's details by ID.
 * Caches results with a 30-second staleTime.
 */
export function useSession(sessionId: string | null | undefined) {
  return useQuery<SessionDetail | null, Error>({
    queryKey: sessionKeys.detail(sessionId),
    queryFn: () => {
      if (!sessionId) return Promise.resolve(null);
      return getSessionById(sessionId);
    },
    enabled: Boolean(sessionId),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 10 * 60 * 1000,
  });
}
