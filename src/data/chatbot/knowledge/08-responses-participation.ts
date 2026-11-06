import type { KnowledgeItem } from "./types";

export const responsesParticipationKnowledge: KnowledgeItem[] = [
  {
    id: "kb-responses-participation",
    title: "Real-Time Response Collection & WebSocket Flow",
    category: "Responses",
    summary:
      "How student answers are transmitted, aggregated, and rendered with low-latency live synchronization using Supabase Realtime.",
    content:
      "KCT PULSE is engineered for high-concurrency classroom responsiveness:\n" +
      "• WebSocket State Engine: Uses Supabase Realtime WebSockets to broadcast question launches, option selections, and poll tallies.\n" +
      "• Live Synchronization: State updates arrive on connected projector screens and student devices with low latency (typically under 100ms on local networks).\n" +
      "• Optimistic Updates & De-duplication: The UI registers responses instantly with immediate confirmation while persisting records to PostgreSQL.\n" +
      "• Auto-Aggregation: For polls and quizzes, votes are aggregated dynamically without requiring page refreshes.\n" +
      "• Discussion Session vs. Quiz Session: When a session consists purely of polls and discussion prompts without correct answers, the platform tracks participation volume rather than displaying false 0% quiz grades.",
    keywords: [
      "responses",
      "participation",
      "realtime",
      "websockets",
      "latency",
      "speed",
      "voting",
      "submissions",
      "discussion session",
      "how fast are updates",
    ],
    suggestedQuestions: [
      "How fast do student votes appear on the screen?",
      "What technology powers real-time synchronization?",
      "How are discussion sessions scored differently from quizzes?",
    ],
    relatedTopics: ["kb-student-experience", "kb-intelligence-overview"],
  },
];

