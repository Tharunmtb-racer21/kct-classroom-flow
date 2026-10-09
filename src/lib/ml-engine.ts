/**
 * ml-engine.ts
 * Deterministic Classroom Analytics Engine for KCT PULSE.
 *
 * Computes explainable, deterministic student engagement metrics,
 * classroom-level cohort distributions, and participation indicators.
 *
 * NOTE:
 * - Current engagement scores are formula-derived heuristics, NOT supervised ML predictions.
 * - Weights are grounded in observable classroom actions:
 *   Attempt Rate: 35%, Quiz Accuracy on attempted questions: 35%,
 *   Multi-Format Interaction: 18%, Session Presence: 12%.
 */

export interface StudentRawData {
  participantId: string;
  name: string;
  sessionId: string;
  joinedAt: string;
  totalSessionQuestions: number;
  attemptedQuestions: number;
  attemptedQuizQuestions?: number;
  /**
   * Unattempted questions in session.
   * Qualified: In the database, missing response rows represent unobserved exposure,
   * not confirmed active skips.
   */
  unattemptedQuestions?: number;
  skippedQuestions?: number; // Maintained for backwards compatibility
  correctAnswers: number;
  totalQuizQuestions: number;
  pollParticipationCount: number;
  wordcloudParticipationCount: number;
  responseTimingsMs?: number[];
  historicalAccuracyPercentages?: number[];
}

export type EngagementLevel = "highly_engaged" | "moderately_engaged" | "needs_attention";
export type PerformanceTrend = "improving" | "stable" | "declining" | "insufficient_data";

export interface StudentEngagementAnalysis {
  participantId: string;
  name: string;
  engagementScore: number; // 0 - 100 deterministic formula score
  engagementLevel: EngagementLevel;
  engagementLabel: string;
  badgeColor: string;
  accuracyPercentage: number; // Observed quiz accuracy strictly on attempted quiz questions
  attemptRatePercentage: number; // Observed attempt rate across all session questions
  attemptedQuestions: number;
  totalSessionQuestions: number;
  attemptedQuizQuestions: number;
  correctAnswers: number;
  avgResponseTimeMs: number; // Currently 0 (unrecorded in schema)
  quizAccuracyPercentage: number;
  pollParticipationRate: number;
  wordcloudParticipationRate: number;
  performanceTrend: PerformanceTrend;
  trendLabel: string;
  trendIcon: string;
  hasSufficientData: boolean;
  scoreType: "formula_deterministic";
}

export interface ClassroomEngagementBreakdown {
  overallScore: number; // 0 - 100%
  participationRate: number; // 0 - 100%
  responseConsistencyRate: number; // 0 - 100%
  quizPerformanceRate: number; // 0 - 100%
  attendanceRate: number; // 0 - 100%
  interactionLevelRate: number; // 0 - 100%
  studentDistribution: {
    highlyEngaged: number;
    moderatelyEngaged: number;
    needsAttention: number;
  };
  hasSufficientData: boolean;
}

/**
 * Deterministic Feature Weighting Model for Student Engagement Score (0 - 100)
 *
 * Features and Weights:
 * - Attempt Rate (35%): Fraction of session questions attempted
 * - Quiz Accuracy (35%): Evaluated strictly over *attempted* quiz questions
 *   so unattempted questions are not penalized twice (attempt rate already accounts for them)
 * - Multi-Format Interaction (18%): Participation across quizzes, polls, and wordclouds
 * - Attendance & Session Presence (12%): Consistent participation throughout session
 */
export function calculateStudentEngagement(data: StudentRawData): StudentEngagementAnalysis {
  const {
    participantId,
    name,
    totalSessionQuestions,
    attemptedQuestions,
    attemptedQuizQuestions,
    correctAnswers,
    totalQuizQuestions,
    pollParticipationCount,
    wordcloudParticipationCount,
    responseTimingsMs = [],
    historicalAccuracyPercentages = [],
  } = data;

  // Cold start guard: participant must have joined a session with questions
  const hasSufficientData = totalSessionQuestions > 0 && attemptedQuestions > 0;

  if (!hasSufficientData) {
    return {
      participantId,
      name,
      engagementScore: 0,
      engagementLevel: "needs_attention",
      engagementLabel: "Insufficient Data",
      badgeColor: "gray",
      accuracyPercentage: 0,
      attemptRatePercentage: 0,
      attemptedQuestions: 0,
      totalSessionQuestions,
      attemptedQuizQuestions: 0,
      correctAnswers: 0,
      avgResponseTimeMs: 0,
      quizAccuracyPercentage: 0,
      pollParticipationRate: 0,
      wordcloudParticipationRate: 0,
      performanceTrend: "insufficient_data",
      trendLabel: "Insufficient response data",
      trendIcon: "—",
      hasSufficientData: false,
      scoreType: "formula_deterministic",
    };
  }

  // 1. Attempt Rate (0-100)
  const attemptRate = Math.min(100, Math.round((attemptedQuestions / totalSessionQuestions) * 100));

  // Determine attempted quiz questions
  const actualAttemptedQuizzes =
    typeof attemptedQuizQuestions === "number"
      ? attemptedQuizQuestions
      : Math.min(attemptedQuestions, totalQuizQuestions);

  // 2. Quiz Accuracy (0-100)
  // Measured on attempted quiz questions to avoid counting unanswered questions as incorrect responses.
  let quizAccuracy = 0;
  if (actualAttemptedQuizzes > 0) {
    quizAccuracy = Math.min(100, Math.round((correctAnswers / actualAttemptedQuizzes) * 100));
  } else if (totalQuizQuestions === 0) {
    // If the session contained only polls/wordclouds, fall back to attempt rate
    quizAccuracy = attemptRate;
  } else {
    // 0 attempted quiz questions in a session that contained quizzes
    quizAccuracy = 0;
  }

  // 3. Format Variety Score (Quizzes + Polls + Wordclouds)
  const pollRate = pollParticipationCount > 0 ? 100 : 0;
  const wcRate = wordcloudParticipationCount > 0 ? 100 : 0;
  const formatVarietyScore = Math.round(quizAccuracy * 0.5 + pollRate * 0.25 + wcRate * 0.25);

  // 4. Attendance & Presence Score
  const presenceScore = attemptRate >= 80 ? 100 : attemptRate >= 50 ? 75 : 40;

  // 5. Deterministic Weighted Score Computation (Authentic observables only)
  const weightedScore = Math.round(
    attemptRate * 0.35 +
      quizAccuracy * 0.35 +
      formatVarietyScore * 0.18 +
      presenceScore * 0.12,
  );

  const engagementScore = Math.max(0, Math.min(100, weightedScore));

  // Classification (Non-judgmental, privacy-conscious educational categories)
  let engagementLevel: EngagementLevel = "moderately_engaged";
  let engagementLabel = "Moderately Engaged";
  let badgeColor = "yellow";

  if (engagementScore >= 75) {
    engagementLevel = "highly_engaged";
    engagementLabel = "Highly Engaged";
    badgeColor = "green";
  } else if (engagementScore < 45) {
    engagementLevel = "needs_attention";
    engagementLabel = "Needs Attention";
    badgeColor = "red";
  }

  // Longitudinal Performance Trend (Requires genuine past session observations)
  // Since participants are session-scoped and do not have cross-session IDs,
  // historical accuracy is unobserved unless explicitly linked.
  let performanceTrend: PerformanceTrend = "insufficient_data";
  let trendLabel = "Session-scoped (no prior history)";
  let trendIcon = "—";

  if (historicalAccuracyPercentages && historicalAccuracyPercentages.length >= 1) {
    const prevAverage =
      historicalAccuracyPercentages.reduce((a, b) => a + b, 0) /
      historicalAccuracyPercentages.length;
    const diff = quizAccuracy - prevAverage;

    if (diff >= 5) {
      performanceTrend = "improving";
      trendLabel = "Improving";
      trendIcon = "📈";
    } else if (diff <= -5) {
      performanceTrend = "declining";
      trendLabel = "Declining";
      trendIcon = "📉";
    } else {
      performanceTrend = "stable";
      trendLabel = "Stable";
      trendIcon = "➡️";
    }
  }

  const avgResponseTime =
    responseTimingsMs && responseTimingsMs.length > 0
      ? Math.round(responseTimingsMs.reduce((a, b) => a + b, 0) / responseTimingsMs.length)
      : 0;

  return {
    participantId,
    name,
    engagementScore,
    engagementLevel,
    engagementLabel,
    badgeColor,
    accuracyPercentage: quizAccuracy,
    attemptRatePercentage: attemptRate,
    attemptedQuestions,
    totalSessionQuestions,
    attemptedQuizQuestions: actualAttemptedQuizzes,
    correctAnswers,
    avgResponseTimeMs: Math.round(avgResponseTime),
    quizAccuracyPercentage: quizAccuracy,
    pollParticipationRate: pollRate,
    wordcloudParticipationRate: wcRate,
    performanceTrend,
    trendLabel,
    trendIcon,
    hasSufficientData: true,
    scoreType: "formula_deterministic",
  };
}

/**
 * Aggregate Classroom Engagement Analysis
 */
export function calculateClassroomEngagement(
  students: StudentEngagementAnalysis[],
): ClassroomEngagementBreakdown {
  const activeStudents = students.filter((s) => s.hasSufficientData);

  if (activeStudents.length === 0) {
    return {
      overallScore: 0,
      participationRate: 0,
      responseConsistencyRate: 0,
      quizPerformanceRate: 0,
      attendanceRate: 0,
      interactionLevelRate: 0,
      studentDistribution: {
        highlyEngaged: 0,
        moderatelyEngaged: 0,
        needsAttention: 0,
      },
      hasSufficientData: false,
    };
  }

  const count = activeStudents.length;

  const totalScore = activeStudents.reduce((acc, s) => acc + s.engagementScore, 0);
  const totalAttempt = activeStudents.reduce((acc, s) => acc + s.attemptRatePercentage, 0);
  const totalAccuracy = activeStudents.reduce((acc, s) => acc + s.accuracyPercentage, 0);

  const overallScore = Math.round(totalScore / count);
  const participationRate = Math.round(totalAttempt / count);
  const quizPerformanceRate = Math.round(totalAccuracy / count);

  // Response Consistency: % of students with consistent participation (attempted >= 70% of available questions)
  const consistentStudents = activeStudents.filter((s) => s.attemptRatePercentage >= 70).length;
  const responseConsistencyRate = Math.round((consistentStudents / count) * 100);

  // Attendance & Interaction metrics
  const attendanceRate = Math.min(100, Math.round((count / Math.max(1, students.length)) * 100));
  const interactionLevelRate = Math.round((participationRate + responseConsistencyRate) / 2);

  const highlyEngaged = activeStudents.filter((s) => s.engagementLevel === "highly_engaged").length;
  const moderatelyEngaged = activeStudents.filter(
    (s) => s.engagementLevel === "moderately_engaged",
  ).length;
  const needsAttention = activeStudents.filter(
    (s) => s.engagementLevel === "needs_attention",
  ).length;

  return {
    overallScore,
    participationRate,
    responseConsistencyRate,
    quizPerformanceRate,
    attendanceRate,
    interactionLevelRate,
    studentDistribution: {
      highlyEngaged,
      moderatelyEngaged,
      needsAttention,
    },
    hasSufficientData: true,
  };
}
