/**
 * weak-topic-engine.ts
 * Rule-Based Engine for Question Concept Performance & Faculty Pedagogical Recommendations.
 * Analyzes question performance, skip rates, and error patterns
 * to identify concepts where students struggle, generating actionable faculty advice.
 */

export interface QuestionPerformanceData {
  questionId: string;
  title: string;
  type: "quiz" | "poll" | "wordcloud";
  correctAnswer: string | null;
  responses: Array<{
    answer: string;
    responseTimeMs?: number;
  }>;
  totalParticipantsInSession: number;
}

export interface TopicPerformanceResult {
  topicName: string;
  accuracyPercentage: number;
  status: "good" | "moderate" | "weak";
  statusBadge: "🟢" | "🟡" | "🔴";
  questionCount: number;
  attemptedCount: number;
  correctCount: number;
  avgResponseTimeMs: number;
  skipRatePercentage: number;
}

export interface WeakTopicAnalysis {
  topics: TopicPerformanceResult[];
  weakTopics: TopicPerformanceResult[];
  recommendation: string | null;
  hasSufficientData: boolean;
}

/**
 * Extracts a topic name/concept from a question title.
 * Uses natural keyword grouping or fallback phrase extraction.
 */
function extractTopicFromQuestion(title: string): string {
  const cleanTitle = title.trim();

  // Known computer science / generic domain topic mapping rules
  const topicKeywords: Array<{ name: string; pattern: RegExp }> = [
    { name: "Trees & Binary Trees", pattern: /tree|bst|binary tree|trie|heap/i },
    { name: "Graphs & Traversal", pattern: /graph|bfs|dfs|dijkstra|shortest path|adjacency/i },
    { name: "Linked Lists", pattern: /linked list|singly|doubly|pointer|head|tail/i },
    { name: "Arrays & Strings", pattern: /array|string|substring|matrix|indexing/i },
    { name: "Sorting & Searching", pattern: /sort|search|binary search|bubble|quick|merge/i },
    {
      name: "Recursion & Dynamic Programming",
      pattern: /recurse|recursion|dp|memoization|fibonacci/i,
    },
    { name: "Database & SQL", pattern: /sql|database|query|table|join|select|where/i },
    {
      name: "Object Oriented Programming",
      pattern: /oop|class|object|inheritance|polymorphism|encapsulation/i,
    },
    {
      name: "Calculus & Differential Equations",
      pattern: /pde|derivative|integral|calculus|equation|differential/i,
    },
    {
      name: "Chemistry & Reactions",
      pattern: /element|compound|reaction|atom|molecule|acid|base|pH/i,
    },
    {
      name: "Physics & Mechanics",
      pattern: /force|mass|velocity|acceleration|gravity|energy|work/i,
    },
  ];

  for (const item of topicKeywords) {
    if (item.pattern.test(cleanTitle)) {
      return item.name;
    }
  }

  // Fallback topic extraction: take first 3 words or question prompt prefix
  const words = cleanTitle
    .replace(/[^\w\s]/gi, "")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !["what", "which", "how", "where", "when", "does", "is", "are", "the"].includes(
          w.toLowerCase(),
        ),
    );

  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  return cleanTitle.length > 25 ? cleanTitle.substring(0, 25) + "..." : cleanTitle;
}

/**
 * Analyzes performance across session questions to produce topic breakdown and recommendations.
 */
export function analyzeWeakTopics(questions: QuestionPerformanceData[]): WeakTopicAnalysis {
  // Only evaluate quiz questions for accuracy & weak topics
  const quizQuestions = questions.filter((q) => q.type === "quiz" && q.correctAnswer);

  const totalResponsesCount = quizQuestions.reduce((acc, q) => acc + q.responses.length, 0);

  // Cold Start Check: Need at least 2 responses across quiz questions
  if (quizQuestions.length === 0 || totalResponsesCount < 2) {
    return {
      topics: [],
      weakTopics: [],
      recommendation: null,
      hasSufficientData: false,
    };
  }

  // Group questions by extracted topic
  const topicMap = new Map<
    string,
    {
      questionCount: number;
      attemptedCount: number;
      correctCount: number;
      responseTimesMs: number[];
      totalPossibleAttempts: number;
    }
  >();

  for (const q of quizQuestions) {
    const topicName = extractTopicFromQuestion(q.title);
    const existing = topicMap.get(topicName) || {
      questionCount: 0,
      attemptedCount: 0,
      correctCount: 0,
      responseTimesMs: [],
      totalPossibleAttempts: 0,
    };

    existing.questionCount += 1;
    existing.attemptedCount += q.responses.length;
    existing.totalPossibleAttempts += Math.max(q.responses.length, q.totalParticipantsInSession);

    for (const resp of q.responses) {
      if (resp.answer.trim().toLowerCase() === q.correctAnswer?.trim().toLowerCase()) {
        existing.correctCount += 1;
      }
      if (resp.responseTimeMs) {
        existing.responseTimesMs.push(resp.responseTimeMs);
      }
    }

    topicMap.set(topicName, existing);
  }

  const topicsResult: TopicPerformanceResult[] = [];

  topicMap.forEach((stats, topicName) => {
    const accuracy =
      stats.attemptedCount > 0 ? Math.round((stats.correctCount / stats.attemptedCount) * 100) : 0;

    const skipRate =
      stats.totalPossibleAttempts > 0
        ? Math.round(
            ((stats.totalPossibleAttempts - stats.attemptedCount) / stats.totalPossibleAttempts) *
              100,
          )
        : 0;

    const avgResponseTimeMs =
      stats.responseTimesMs.length > 0
        ? Math.round(
            stats.responseTimesMs.reduce((a, b) => a + b, 0) / stats.responseTimesMs.length,
          )
        : 0;

    let status: "good" | "moderate" | "weak" = "good";
    let statusBadge: "🟢" | "🟡" | "🔴" = "🟢";

    if (accuracy < 60) {
      status = "weak";
      statusBadge = "🔴";
    } else if (accuracy < 80) {
      status = "moderate";
      statusBadge = "🟡";
    }

    topicsResult.push({
      topicName,
      accuracyPercentage: accuracy,
      status,
      statusBadge,
      questionCount: stats.questionCount,
      attemptedCount: stats.attemptedCount,
      correctCount: stats.correctCount,
      avgResponseTimeMs,
      skipRatePercentage: Math.max(0, skipRate),
    });
  });

  // Sort topics by accuracy ascending (weakest topics first)
  topicsResult.sort((a, b) => a.accuracyPercentage - b.accuracyPercentage);

  const weakTopics = topicsResult.filter((t) => t.status === "weak");

  // Generate Faculty Pedagogical Recommendation (Feature 3)
  let recommendation: string | null = null;

  if (weakTopics.length > 0) {
    const primaryWeak = weakTopics[0];
    recommendation = `Students appear to be struggling with ${primaryWeak.topicName} (Accuracy: ${primaryWeak.accuracyPercentage}%). Consider spending 5–10 additional minutes reviewing core concepts and working through example problems before moving to the next topic.`;
  } else if (topicsResult.some((t) => t.status === "moderate")) {
    const modTopic = topicsResult.find((t) => t.status === "moderate")!;
    recommendation = `Overall class understanding is strong, but ${modTopic.topicName} shows moderate accuracy (${modTopic.accuracyPercentage}%). A quick 3-minute recap or summary quiz would solidify key takeaways.`;
  } else {
    recommendation = `Great work! Students are demonstrating high mastery across all active lecture topics (Average accuracy: ${Math.round(
      topicsResult.reduce((a, b) => a + b.accuracyPercentage, 0) / topicsResult.length,
    )}%). You can safely proceed to the next module.`;
  }

  return {
    topics: topicsResult,
    weakTopics,
    recommendation,
    hasSufficientData: true,
  };
}
