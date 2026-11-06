import type { KnowledgeItem } from "./types";

export const engagementAnalyticsKnowledge: KnowledgeItem[] = [
  {
    id: "kb-engagement-scoring",
    title: "Student Engagement Formula & Cohort Tiers",
    category: "Intelligence",
    summary:
      "Deterministic 0–100 scoring model evaluating attempt rate, quiz accuracy, presence, and format variety.",
    content:
      "KCT PULSE calculates student engagement using a deterministic pedagogical formula (0–100):\n" +
      "• Mathematical Weights:\n" +
      "  - Attempt Rate (35%): Ratio of session questions attempted by the student.\n" +
      "  - Quiz Accuracy on Attempted Questions (35%): Correctness ratio on scored quizzes.\n" +
      "  - Format Variety (18%): Engagement across multiple question modes (polls, quizzes, word clouds).\n" +
      "  - Presence / Attendance (12%): Continuity of participation across the duration of the lecture.\n" +
      "• Engagement Cohort Tiers:\n" +
      "  - 🟢 Highly Engaged (Score ≥ 75%): Active participants with consistent, high-accuracy responses.\n" +
      "  - 🟡 Moderately Engaged (Score 45%–74%): Consistent participants who benefit from interactive prompts.\n" +
      "  - 🔴 Needs Attention (Score < 45%): Low participation or comprehension; flagged for gentle mentoring.\n" +
      "• Non-Quiz Discussion Adjustments: In discussion-only sessions, the formula dynamically shifts to measure response volume (`Activity: X/Y Responses`) rather than penalizing students with 0% quiz grades.",
    keywords: [
      "engagement score",
      "engagement formula",
      "cohorts",
      "highly engaged",
      "moderately engaged",
      "needs attention",
      "scoring weights",
      "how is engagement calculated",
      "student analytics",
    ],
    suggestedQuestions: [
      "How is the Student Engagement Score calculated?",
      "What are the three engagement tiers?",
      "Are students penalized in discussion sessions without quizzes?",
    ],
    relatedTopics: ["kb-intelligence-overview", "kb-student-experience"],
  },
  {
    id: "kb-student-identity",
    title: "Participant Identity & Roll Number Badging",
    category: "Intelligence",
    summary:
      "Automatic parsing of institutional roll numbers and color-coded avatar initials chips.",
    content:
      "In the Intelligence and Developer portals, participant entries are enriched for faculty readability:\n" +
      "• Institutional Roll Number Parsing: Automatically detects alphanumeric roll numbers in student names (e.g. `25BIT057` from `Navneeth V 25BIT057`) and renders them in distinct blue badges.\n" +
      "• Deterministic Initials Avatars: Displays personalized 2-letter initials chips with deterministic theme colors.\n" +
      "• Clean Fallbacks: Anonymous or guest entries default to clean 'Guest Participant' badges without breaking data structures.",
    keywords: [
      "roll number",
      "roll number badging",
      "participant name",
      "initials",
      "avatar",
      "student identification",
    ],
    suggestedQuestions: [
      "How does the system display student roll numbers?",
      "Can students enter both their name and roll number?",
    ],
    relatedTopics: ["kb-student-experience", "kb-intelligence-overview"],
  },
];

