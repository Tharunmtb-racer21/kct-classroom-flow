import type { KnowledgeItem } from "./types";

export const classroomIntelligenceKnowledge: KnowledgeItem[] = [
  {
    id: "kb-intelligence-overview",
    title: "Classroom Intelligence & Pedagogical Analytics (/dashboard/intelligence)",
    category: "Intelligence",
    summary:
      "Deterministic analytics suite calculating engagement scores, identifying weak topics, and offering pedagogical guidance.",
    content:
      "The Classroom Intelligence page (`/dashboard/intelligence`) provides automated learning diagnostics:\n" +
      "• Concept Accuracy & Response Coverage: Visualizes accuracy percentages for each topic taught alongside total attempt counts (N).\n" +
      "• Academic Concept Extraction: Automatically sanitizes question prompts, filters stop words, and groups common concept tags.\n" +
      "• Statistical Reliability Guards: Applies sample size thresholds to prevent premature classifications:\n" +
      "  - Reliable (N ≥ 15): Confident analytical indicator.\n" +
      "  - Preliminary (5 ≤ N < 15): Early trend indicator.\n" +
      "  - Insufficient Sample (N < 5): Neutral indicator preventing false negative flags.\n" +
      "• Faculty Pedagogical Recommendation: Rule-based advice highlighting topics requiring revision, suggesting interactive polls, or identifying well-grasped subject areas.\n" +
      "• Observed Question Performance: Empirical difficulty diagnostics detailing attempt counts, accuracy ratios, and observed error patterns.",
    keywords: [
      "intelligence",
      "classroom intelligence",
      "pedagogical recommendations",
      "weak topics",
      "concept accuracy",
      "sample sufficiency",
      "learning diagnostics",
      "ml engine",
      "analytics",
    ],
    suggestedQuestions: [
      "What is Classroom Intelligence?",
      "How are weak topics identified?",
      "What do the sample sufficiency badges mean?",
    ],
    relatedTopics: ["kb-engagement-scoring", "kb-faculty-workflows", "kb-reports-analytics"],
  },
];

