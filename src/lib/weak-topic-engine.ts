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

  // Known engineering, computer science, mathematics, and curriculum taxonomy
  const topicKeywords: Array<{ name: string; pattern: RegExp }> = [
    {
      name: "Data Engineering & ETL",
      pattern: /\b(etl|elt|data warehouse|data warehousing|olap|oltp|star schema|snowflake schema|lakehouse|data lake|cdc|ingestion|pipeline|data pipeline)\b/i,
    },
    {
      name: "Computer Architecture & OS",
      pattern: /\b(memory hierarchy|cache|cache memory|processor|cpu|locality|temporal locality|spatial locality|transistor|sram|dram|operating system|\bos\b|process|thread|mutex|semaphore|deadlock|mutual exclusion|scheduling|paging|virtual memory|context switch)\b/i,
    },
    {
      name: "Electrical & Power Systems",
      pattern: /\b(grid|gridstress|power system|power grid|voltage|current|transformer|circuit|impedance|resistance|frequency|motor|generator|transmission|phasor|ac resistive|inductor|capacitor)\b/i,
    },
    {
      name: "Control Systems & Signals",
      pattern: /\b(root locus|bode plot|transfer function|nyquist|stability analysis|feedback|pid|control system|poles|zeros)\b/i,
    },
    {
      name: "Digital Electronics & VLSI",
      pattern: /\b(semiconductor|transistor|diode|logic gate|cmos|amplifier|microcontroller|microprocessor|vlsi|flip flop|combinational|sequential)\b/i,
    },
    {
      name: "Computer Networks & Protocols",
      pattern: /\b(network|tcp|udp|ip|dns|http|https|routing|router|packet|socket|osi|ethernet|subnet|lan|wan|bandwidth)\b/i,
    },
    {
      name: "Software Engineering & Git",
      pattern: /\b(git|github|version control|staging|commit|branch|repository|merge conflict|agile|scrum|refactor|ci\/cd|deployment)\b/i,
    },
    {
      name: "Cybersecurity & Cryptography",
      pattern: /\b(security|cipher|encryption|decryption|crypto|hash|attack|firewall|vulnerability|auth|ssl|tls|malware|phishing)\b/i,
    },
    {
      name: "Artificial Intelligence & ML",
      pattern: /\b(neural|ai|machine learning|classification|regression|dataset|supervised|unsupervised|deep learning|clustering|perceptron|feature engineering)\b/i,
    },
    {
      name: "Database & SQL",
      pattern: /\b(sql|database|query|table|join|select|where|rdbms|normalization|primary key|foreign key|acid|indexing)\b/i,
    },
    {
      name: "Trees & Binary Trees",
      pattern: /\b(tree|bst|binary tree|trie|heap|traversal|inorder|preorder|postorder)\b/i,
    },
    {
      name: "Graphs & Traversal",
      pattern: /\b(graph|bfs|dfs|dijkstra|shortest path|adjacency|topological)\b/i,
    },
    {
      name: "Linked Lists",
      pattern: /\b(linked list|singly|doubly|pointer|head node|tail node)\b/i,
    },
    {
      name: "Arrays & Strings",
      pattern: /\b(array|string|substring|matrix|indexing|vector|prefix sum)\b/i,
    },
    {
      name: "Sorting & Searching",
      pattern: /\b(sort|binary search|bubble sort|quick sort|merge sort|linear search|insertion sort)\b/i,
    },
    {
      name: "Recursion & Dynamic Programming",
      pattern: /\b(recurse|recursion|dynamic programming|\bdp\b|memoization|fibonacci)\b/i,
    },
    {
      name: "Object Oriented Programming",
      pattern: /\b(oop|class|object|inheritance|polymorphism|encapsulation|constructor|method)\b/i,
    },
    {
      name: "Calculus & Differential Equations",
      pattern: /\b(pde|ode|derivative|integral|calculus|differential|differentiation|integration|total derivative)\b/i,
    },
    {
      name: "Physics & Mechanics",
      pattern: /\b(force|mass|velocity|acceleration|gravity|energy|work|momentum|friction|torque)\b/i,
    },
    {
      name: "Chemistry & Reactions",
      pattern: /\b(element|compound|reaction|atom|molecule|acid|base|ph|oxidation|reduction|titration)\b/i,
    },
  ];

  for (const item of topicKeywords) {
    if (item.pattern.test(cleanTitle)) {
      return item.name;
    }
  }

  // Detect keyboard mash strings (e.g. cvbnm,., asdfgh, etc.)
  if (/^[asdfghjklqwertyuiopzxcvbnm,./';\s\-]+$/i.test(cleanTitle) && !/\b(the|is|and|or|not|in|on|at|to)\b/i.test(cleanTitle)) {
    return "Interactive Classroom Concept";
  }

  // Fallback extraction: strip procedural question boilerplate
  const stripped = cleanTitle
    .replace(/^according to the document,?\s*/i, "")
    .replace(/^according to the,?\s*/i, "")
    .replace(/^what is the fundamental problem of\s+/i, "")
    .replace(/^what is the primary purpose of\s+/i, "")
    .replace(/^what is the primary reason for\s+/i, "")
    .replace(/^what single word best describes\s+/i, "")
    .replace(/^what role does\s+/i, "")
    .replace(/^what does\s+/i, "")
    .replace(/^how does\s+/i, "")
    .replace(/^which of the following best describes\s+/i, "")
    .replace(/^which of the following\s+/i, "")
    .replace(/^which aspect of\s+/i, "")
    .replace(/^describe\s+/i, "")
    .replace(/^how well do you understand\s+/i, "")
    .replace(/^what comes to mind when you think of\s+/i, "")
    .replace(/^if you move\s+/i, "")
    .trim();

  const words = stripped
    .replace(/[^\w\s]/gi, "")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        ![
          "what", "which", "how", "where", "when", "does", "is", "are",
          "the", "and", "for", "with", "from", "that", "this", "related",
          "concept", "document", "mentions", "find", "most", "describe",
          "fundamental", "primary", "purpose", "problem", "reason", "stand"
        ].includes(w.toLowerCase()),
    );

  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  } else if (words.length === 1) {
    return words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
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

    // Sample size sufficiency:
    // stats.attemptedCount === 0: unattempted (0 submissions)
    // 1 <= stats.attemptedCount < 5: insufficient (small sample)
    // 5 <= stats.attemptedCount < 15: preliminary
    // stats.attemptedCount >= 15: reliable
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
    } else if (stats.attemptedCount === 0) {
      sampleSufficiencyLabel = "Not Attempted (0 Submissions)";
    }

    let status: "good" | "moderate" | "weak" = "good";
    let statusBadge: "🟢" | "🟡" | "🔴" = "🟢";

    if (stats.attemptedCount === 0) {
      // If 0 students attempted this question, do NOT falsely alarm as a failed/weak topic
      status = "moderate";
      statusBadge = "🟡";
    } else if (stats.attemptedCount < 5) {
      // If sample is insufficient (< 5 attempts), flag as preliminary/gathering data, not failing
      status = "moderate";
      statusBadge = "🟡";
    } else if (accuracy < 60) {
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

  // Sort topics:
  // 1. Validated topics with >= 5 attempts (weakest accuracy first so genuine student struggles are highlighted)
  // 2. Preliminary topics with 1–4 attempts
  // 3. Unattempted topics (0 attempts) at the bottom
  topicsResult.sort((a, b) => {
    const aHasAttempts = a.attemptedCount > 0 ? 1 : 0;
    const bHasAttempts = b.attemptedCount > 0 ? 1 : 0;
    if (aHasAttempts !== bHasAttempts) return bHasAttempts - aHasAttempts;

    const aReliable = a.isReliable ? 1 : 0;
    const bReliable = b.isReliable ? 1 : 0;
    if (aReliable !== bReliable) return bReliable - aReliable;

    return a.accuracyPercentage - b.accuracyPercentage;
  });

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
