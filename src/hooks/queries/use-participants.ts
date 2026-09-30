import { useQuery } from "@tanstack/react-query";
import { getParticipants, Participant } from "@/services/participants/participant-service";

export const participantKeys = {
  all: ["participants"] as const,
  session: (sessionId: string | null | undefined) => ["participants", sessionId] as const,
};

/**
 * Hook to retrieve participants for a specific session ordered by joined_at.
 * Caches results with a 30-second staleTime.
 */
export function useParticipants(sessionId: string | null | undefined) {
  return useQuery<Participant[], Error>({
    queryKey: participantKeys.session(sessionId),
    queryFn: () => {
      if (!sessionId) return Promise.resolve([]);
      return getParticipants(sessionId);
    },
    enabled: Boolean(sessionId),
    staleTime: 2 * 1000, // 2 seconds for responsive live sessions
    gcTime: 10 * 60 * 1000,
  });
}
