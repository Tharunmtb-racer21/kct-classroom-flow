/**
 * weak-topic-engine.ts
 * Rule-Based Engine for Question Concept Performance & Faculty Pedagogical Recommendations.
 * Analyzes authentic question performance, response coverage, and error patterns
 * to identify concepts where students struggle, generating actionable, explainable advice.
 */

import { isAnswerCorrect } from "@/lib/answer-evaluator";

export interface QuestionPerformanceData {
  questionId: string;
  title: string;
  type: "quiz" | "poll" | "wordcloud";
  correctAnswer: string | null;
  options?: string[] | null;
  responses: Array<{
    answer: string;
    responseTimeMs?: number;
  }>;
  totalParticipantsInSession: number;
}

export type SampleSufficiency = "insufficient" | "preliminary" | "reliable";

export interface TopicPerformanceResult {
  topicName: string;
  accuracyPercentage: number;
  status: "good" | "moderate" | "weak";
  statusBadge: "🟢" | "🟡" | "🔴";
  questionCount: number;
  attemptedCount: number;
  correctCount: number;
  avgResponseTimeMs: number;
  /**
   * Response Coverage: Percentage of eligible session participants who submitted an answer.
   * Qualified: Absence of a response is unobserved exposure, NOT confirmed active skip.
   */
  responseCoveragePercentage: number;
  /**
   * Qualified non-response rate: fraction of eligible participants without an observed response.
   */
  unobservedExposureRatePercentage: number;
  sampleSufficiency: SampleSufficiency;
  sampleSufficiencyLabel: string;
  isReliable: boolean;
}

export interface WeakTopicAnalysis {
  topics: TopicPerformanceResult[];
  weakTopics: TopicPerformanceResult[];
  recommendation: string | null;
  hasSufficientData: boolean;
  qualificationNote?: string;
}

/**
 * Extracts a topic name/concept from a question title.
 * Uses natural keyword grouping or fallback phrase extraction.
 * Note: Official curriculum tags do not exist in the schema, so this is a heuristic grouping.
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

  // Fallback topic extraction: take first 2 meaningful words
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
  // Only evaluate quiz questions for accuracy & concept performance
  const quizQuestions = questions.filter((q) => q.type === "quiz" && q.correctAnswer);
  const totalResponsesCount = quizQuestions.reduce((acc, q) => acc + q.responses.length, 0);

  // Cold Start Guard: Need at least 2 responses across quiz questions
  if (quizQuestions.length === 0 || totalResponsesCount < 2) {
    return {
      topics: [],
      weakTopics: [],
      recommendation: null,
      hasSufficientData: false,
      qualificationNote: "Insufficient response data to evaluate concept performance (N < 2).",
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
      totalEligibleParticipants: number;
    }
  >();

  for (const q of quizQuestions) {
    const topicName = extractTopicFromQuestion(q.title);
    const existing = topicMap.get(topicName) || {
      questionCount: 0,
      attemptedCount: 0,
      correctCount: 0,
      responseTimesMs: [],
      totalEligibleParticipants: 0,
    };

    existing.questionCount += 1;
    existing.attemptedCount += q.responses.length;
    existing.totalEligibleParticipants += Math.max(q.responses.length, q.totalParticipantsInSession);

    for (const resp of q.responses) {
      // Use robust answer evaluator supporting case, trimming, prefixes, and multiple-choice sets
      if (isAnswerCorrect(resp.answer, q.correctAnswer, q.options)) {
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

    // Response coverage among eligible participants
    const responseCoverage =
      stats.totalEligibleParticipants > 0
        ? Math.min(
            100,
            Math.round((stats.attemptedCount / stats.totalEligibleParticipants) * 100),
          )
        : 0;

    const unobservedExposureRate = Math.max(0, 100 - responseCoverage);

    const avgResponseTimeMs =
      stats.responseTimesMs.length > 0
        ? Math.round(
            stats.responseTimesMs.reduce((a, b) => a + b, 0) / stats.responseTimesMs.length,
          )
        : 0;

    // Sample size sufficiency: N < 5 is insufficient, 5 <= N < 15 is preliminary, N >= 15 is reliable
    let sampleSufficiency: SampleSufficiency = "insufficient";
    let sampleSufficiencyLabel = "Insufficient Sample (N < 5)";
    let isReliable = false;

    if (stats.attemptedCount >= 15) {
      sampleSufficiency = "reliable";
      sampleSufficiencyLabel = "Reliable Sample (N ≥ 15)";
      isReliable = true;
    } else if (stats.attemptedCount >= 5) {
      sampleSufficiency = "preliminary";
      sampleSufficiencyLabel = "Preliminary (N: 5–14)";
      isReliable = true;
    }

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
      responseCoveragePercentage: responseCoverage,
      unobservedExposureRatePercentage: unobservedExposureRate,
      sampleSufficiency,
      sampleSufficiencyLabel,
      isReliable,
    });
  });

  // Sort topics by accuracy ascending (weakest topics first)
  topicsResult.sort((a, b) => a.accuracyPercentage - b.accuracyPercentage);

  const weakTopics = topicsResult.filter((t) => t.status === "weak");

  // Generate Faculty Pedagogical Recommendation (Feature 3: Rule-based recommendation)
  let recommendation: string | null = null;

  // Filter topics with sufficient sample for confident recommendations
  const confidentWeak = weakTopics.filter((t) => t.sampleSufficiency !== "insufficient");
  const confidentTopics = topicsResult.filter((t) => t.sampleSufficiency !== "insufficient");

  if (confidentWeak.length > 0) {
    const primaryWeak = confidentWeak[0];
    const prefix =
      primaryWeak.sampleSufficiency === "preliminary" ? "Preliminary observation: " : "";
    recommendation = `${prefix}Students appear to encounter difficulty with ${primaryWeak.topicName} (Observed Accuracy: ${primaryWeak.accuracyPercentage}%, N=${primaryWeak.attemptedCount}). Consider spending 5–10 minutes reviewing foundational concepts and working through an illustrative example.`;
  } else if (weakTopics.length > 0) {
    const primaryWeak = weakTopics[0];
    recommendation = `Early response pattern for ${primaryWeak.topicName} shows ${primaryWeak.accuracyPercentage}% accuracy, but sample size is small (N=${primaryWeak.attemptedCount}). Gather additional responses before adjusting lesson pace.`;
  } else if (confidentTopics.some((t) => t.status === "moderate")) {
    const modTopic = confidentTopics.find((t) => t.status === "moderate")!;
    recommendation = `Class comprehension is steady, with ${modTopic.topicName} showing moderate observed accuracy (${modTopic.accuracyPercentage}%, N=${modTopic.attemptedCount}). A brief recap or follow-up question would reinforce key points.`;
  } else if (confidentTopics.length > 0) {
    const avgAcc = Math.round(
      confidentTopics.reduce((a, b) => a + b.accuracyPercentage, 0) / confidentTopics.length,
    );
    recommendation = `Observed student understanding is high across active topics (Average Accuracy: ${avgAcc}%). You can proceed to the next syllabus module.`;
  } else {
    recommendation = `Classroom data is preliminary across all topics (N < 5 per concept). Continued live participation will unlock reliable pedagogical guidance.`;
  }

  return {
    topics: topicsResult,
    weakTopics,
    recommendation,
    hasSufficientData: true,
  };
}
