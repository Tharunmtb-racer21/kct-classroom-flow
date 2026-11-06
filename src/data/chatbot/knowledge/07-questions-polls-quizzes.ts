import type { KnowledgeItem } from "./types";

export const questionsPollsQuizzesKnowledge: KnowledgeItem[] = [
  {
    id: "kb-question-types",
    title: "Interactive Formats: Polls, Quizzes, and Word Clouds",
    category: "Questions",
    summary:
      "Detailed breakdown of the three supported interactive question types and when to use each.",
    content:
      "KCT PULSE supports three specialized interaction modes:\n" +
      "1. Interactive Polls ('poll'):\n" +
      "   - Purpose: Collect student opinions, pre-class sentiment, or pulse-check comprehension.\n" +
      "   - Format: 2 to 5 options with no single right answer.\n" +
      "   - Visualizer: Dynamic bar charts showing exact vote counts and percentage distributions in real time.\n" +
      "2. Graded Quizzes ('quiz'):\n" +
      "   - Purpose: Assess knowledge retention, run pop quizzes, or conduct formative tests.\n" +
      "   - Format: Multiple Choice Questions (MCQ) with one or more marked correct answers.\n" +
      "   - Scoring: Automatically grades submissions, calculates accuracy percentages, and powers the live leaderboard.\n" +
      "   - Integrity: Compatible with Exam Integrity Mode.\n" +
      "3. Animated Word Clouds ('wordcloud'):\n" +
      "   - Purpose: Open-ended reflections, brainstorming, or concept associations.\n" +
      "   - Format: Free-text inputs where students submit short words or phrases.\n" +
      "   - Visualizer: Animated cloud layout sizing keywords proportionally by submission frequency.",
    keywords: [
      "question types",
      "poll",
      "quiz",
      "word cloud",
      "wordcloud",
      "mcq",
      "graded",
      "leaderboard",
      "options",
      "correct answer",
      "interactive formats",
    ],
    suggestedQuestions: [
      "What is the difference between a Poll and a Quiz?",
      "How do Word Clouds work?",
      "Can a Quiz have multiple correct options?",
    ],
    relatedTopics: ["kb-pulse-features", "kb-responses-participation", "kb-ai-question-gen"],
  },
  {
    id: "kb-ai-question-gen",
    title: "AI-Powered Question Generation from Documents",
    category: "Questions",
    summary:
      "Upload course notes, slides, or syllabus files to automatically generate Bloom's taxonomy questions.",
    content:
      "Instructors can rapidly author question banks by uploading lecture materials:\n" +
      "• Supported Formats: PDF (.pdf), Microsoft Word (.docx), Excel spreadsheets (.xlsx), and plain text (.txt).\n" +
      "• Multi-Provider Backend: Executes through an authenticated server-side pipeline (supporting NVIDIA NIM Llama 3.1, Groq Llama 3.3, and Google Gemini) with automatic failover.\n" +
      "• Local Fallback Generator: If cloud providers are unavailable, the platform's local browser generator creates questions instantly without failing.\n" +
      "• Faculty Verification: Generated questions appear in an interactive preview modal where instructors can review, edit options, change correct answers, and adjust point values before saving.",
    keywords: [
      "ai questions",
      "generate questions",
      "upload pdf",
      "upload docx",
      "word document",
      "course materials",
      "bloom taxonomy",
      "automatic question generator",
    ],
    suggestedQuestions: [
      "What file formats can I upload to generate questions?",
      "Can I edit AI-generated questions before publishing?",
      "What happens if cloud AI services are down?",
    ],
    relatedTopics: ["kb-question-types", "kb-faculty-workflows"],
  },
];
