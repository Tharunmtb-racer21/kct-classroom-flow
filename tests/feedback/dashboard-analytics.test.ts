/**
 * dashboard-analytics.test.ts
 * Tests for ml-engine.ts — zero-attempt metrics, accuracy calculation,
 * hasSufficientData guard, and division-by-zero safety.
 */

import { describe, expect, test } from "bun:test";
import { calculateStudentEngagement, calculateClassroomEngagement } from "../../src/lib/ml-engine";

const BASE = {
  participantId: "p1",
  name: "Navneeth V",
  sessionId: "s1",
  joinedAt: new Date().toISOString(),
  totalSessionQuestions: 5,
  attemptedQuestions: 0,
  correctAnswers: 0,
  totalQuizQuestions: 3,
  pollParticipationCount: 0,
  wordcloudParticipationCount: 0,
};

describe("calculateStudentEngagement — zero attempts", () => {
  test("0 attempted questions → hasSufficientData = false", () => {
    const r = calculateStudentEngagement({ ...BASE, attemptedQuestions: 0 });
    expect(r.hasSufficientData).toBe(false);
  });

  test("0 attempted questions → engagementScore = 0", () => {
    const r = calculateStudentEngagement({ ...BASE, attemptedQuestions: 0 });
    expect(r.engagementScore).toBe(0);
  });

  test("0 attempted questions → accuracyPercentage = 0 (no div/0)", () => {
    const r = calculateStudentEngagement({ ...BASE, attemptedQuestions: 0 });
    expect(Number.isFinite(r.accuracyPercentage)).toBe(true);
    expect(r.accuracyPercentage).toBe(0);
  });

  test("0 total questions → hasSufficientData = false", () => {
    const r = calculateStudentEngagement({ ...BASE, totalSessionQuestions: 0 });
    expect(r.hasSufficientData).toBe(false);
  });
});

describe("calculateStudentEngagement — accuracy calculation", () => {
  test("3/3 correct quiz attempts → quizAccuracyPercentage = 100", () => {
    const r = calculateStudentEngagement({
      ...BASE,
      attemptedQuestions: 3,
      attemptedQuizQuestions: 3,
      correctAnswers: 3,
      totalQuizQuestions: 3,
    });
    expect(r.quizAccuracyPercentage).toBe(100);
  });

  test("1/3 correct quiz attempts → quizAccuracyPercentage = 33", () => {
    const r = calculateStudentEngagement({
      ...BASE,
      attemptedQuestions: 3,
      attemptedQuizQuestions: 3,
      correctAnswers: 1,
      totalQuizQuestions: 3,
    });
    expect(r.quizAccuracyPercentage).toBe(33);
  });

  test("0 quiz questions in session (polls only) → quizAccuracy falls back to attemptRate", () => {
    const r = calculateStudentEngagement({
      ...BASE,
      totalSessionQuestions: 4,
      attemptedQuestions: 4,
      attemptedQuizQuestions: 0,
      correctAnswers: 0,
      totalQuizQuestions: 0,
      pollParticipationCount: 4,
    });
    expect(r.hasSufficientData).toBe(true);
    expect(r.quizAccuracyPercentage).toBe(100); // falls back to attemptRate
  });
});

describe("calculateStudentEngagement — engagement score bounds", () => {
  test("score is always 0-100", () => {
    const r = calculateStudentEngagement({
      ...BASE,
      attemptedQuestions: 5,
      attemptedQuizQuestions: 5,
      correctAnswers: 5,
      totalQuizQuestions: 5,
      pollParticipationCount: 5,
      wordcloudParticipationCount: 5,
    });
    expect(r.engagementScore).toBeGreaterThanOrEqual(0);
    expect(r.engagementScore).toBeLessThanOrEqual(100);
  });
});

describe("calculateClassroomEngagement — empty cohort", () => {
  test("empty array → hasSufficientData = false", () => {
    const r = calculateClassroomEngagement([]);
    expect(r.hasSufficientData).toBe(false);
  });

  test("empty array → overallScore = 0, no errors", () => {
    const r = calculateClassroomEngagement([]);
    expect(r.overallScore).toBe(0);
  });
});

describe("calculateClassroomEngagement — distribution", () => {
  test("one highly-engaged student counted correctly", () => {
    const s = calculateStudentEngagement({
      ...BASE,
      attemptedQuestions: 5,
      attemptedQuizQuestions: 5,
      correctAnswers: 5,
      totalQuizQuestions: 5,
    });
    const r = calculateClassroomEngagement([s]);
    expect(r.studentDistribution.highlyEngaged).toBe(1);
    expect(r.studentDistribution.moderatelyEngaged).toBe(0);
    expect(r.studentDistribution.needsAttention).toBe(0);
  });

  test("insufficient data student is excluded from activeStudents (hasSufficientData=false)", () => {
    const s = calculateStudentEngagement({ ...BASE, attemptedQuestions: 0 });
    expect(s.hasSufficientData).toBe(false);
    // calculateClassroomEngagement filters to activeStudents (hasSufficientData=true only).
    // An all-insufficient cohort returns needsAttention=0 and hasSufficientData=false.
    const r = calculateClassroomEngagement([s]);
    expect(r.hasSufficientData).toBe(false);
    expect(r.studentDistribution.needsAttention).toBe(0);
  });
});
