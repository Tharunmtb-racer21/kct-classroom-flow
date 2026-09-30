import { useQuery } from "@tanstack/react-query";
import { getQuestions, Question } from "@/services/questions/question-service";

export const questionKeys = {
  all: ["questions"] as const,
  session: (sessionId: string | null | undefined) => ["questions", sessionId] as const,
};

/**
 * Hook to retrieve questions for a specific session ordered by order_index.
 * Caches results with a 1-minute staleTime.
 */
export function useQuestions(sessionId: string | null | undefined) {
  return useQuery<Question[], Error>({
    queryKey: questionKeys.session(sessionId),
    queryFn: () => {
      if (!sessionId) return Promise.resolve([]);
      return getQuestions(sessionId);
    },
    enabled: Boolean(sessionId),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000,
  });
}
