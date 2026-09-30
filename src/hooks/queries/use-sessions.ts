import { useQuery } from "@tanstack/react-query";
import { getFacultySessions, SessionListRow } from "@/services/sessions/session-service";

export const sessionsKeys = {
  all: ["sessions"] as const,
  list: (creatorId: string | null | undefined) => ["sessions", creatorId] as const,
};

/**
 * Hook to retrieve sessions created by the authenticated faculty member.
 * Caches results with a 2-minute staleTime.
 */
export function useSessions(creatorId: string | null | undefined) {
  return useQuery<SessionListRow[], Error>({
    queryKey: sessionsKeys.list(creatorId),
    queryFn: () => {
      if (!creatorId) return Promise.resolve([]);
      return getFacultySessions(creatorId);
    },
    enabled: Boolean(creatorId),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 15 * 60 * 1000,
  });
}
