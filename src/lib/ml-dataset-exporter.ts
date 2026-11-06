/**
 * ml-dataset-exporter.ts
 * ML Training Dataset Extractor & Anonymization Engine for KCT PULSE.
 * Extracts, anonymizes, structures, and exports classroom interaction telemetry
 * into CSV / JSONL datasets optimized for Scikit-Learn, PyTorch, and Pandas ML models.
 */

import { supabase } from "@/integrations/supabase/client";
import { mlSupabase } from "@/integrations/supabase/ml-client";
import { calculateStudentEngagement, type StudentEngagementAnalysis } from "@/lib/ml-engine";
import { isAnswerCorrect } from "@/lib/answer-evaluator";

export interface MLTrainingRecord {
  student_id_hash: string;
  session_id: string;
  total_questions: number;
  attempted_questions: number;
  skipped_questions: number;
  quiz_accuracy_pct: number;
  poll_participation_count: number;
  wordcloud_participation_count: number;
  avg_response_time_ms: number;
  integrity_events_count: number;
  fullscreen_exits_count: number;
  total_blur_duration_seconds: number;
  target_engagement_score: number; // Target continuous variable (0 - 100)
  target_engagement_class: string; // Target categorical variable (highly_engaged, moderately_engaged, needs_attention)
}

/**
 * Anonymizes raw student IDs to SHA-256 hashes for DPDP/GDPR compliance.
 */
async function hashStudentId(rawId: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto || !window.crypto.subtle) {
    return `STUDENT_${rawId.slice(0, 8)}`;
  }
  const msgUint8 = new TextEncoder().encode(rawId);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `STD_${hashHex.slice(0, 12)}`;
}

/**
 * Extracts raw classroom telemetry and structures clean ML feature vectors.
 */
export async function extractMLTrainingDataset(): Promise<MLTrainingRecord[]> {
  try {
    // 1. Fetch participants, questions, responses, and integrity events
    const [
      { data: participants },
      { data: questions },
      { data: responses },
      { data: integrityEvents },
    ] = await Promise.all([
      supabase.from("participants").select("id, name, session_id, joined_at"),
      supabase.from("questions").select("id, session_id, type, title, correct_answer, options"),
      supabase.from("responses").select("id, question_id, participant_id, answer, created_at"),
      supabase
        .from("exam_integrity_events")
        .select("id, session_id, participant_id, event_type, duration_seconds"),
    ]);

    const safeParticipants = participants || [];
    const safeQuestions = questions || [];
    const safeResponses = responses || [];
    const safeEvents = integrityEvents || [];

    const trainingDataset: MLTrainingRecord[] = [];

    for (const p of safeParticipants) {
      const studentResponses = safeResponses.filter((r) => r.participant_id === p.id);
      const studentQuestions = safeQuestions.filter((q) => q.session_id === p.session_id);
      const studentEvents = safeEvents.filter((e) => e.participant_id === p.id);

      const attemptedQuestions = new Set(studentResponses.map((r) => r.question_id)).size;

      let correctCount = 0;
      let quizCount = 0;
      let pollCount = 0;
      let wordcloudCount = 0;

      for (const resp of studentResponses) {
        const matchedQ = studentQuestions.find((q) => q.id === resp.question_id);
        if (matchedQ) {
          if (matchedQ.type === "quiz") {
            quizCount++;
            if (isAnswerCorrect(resp.answer, matchedQ.correct_answer, matchedQ.options)) {
              correctCount++;
            }
          } else if (matchedQ.type === "poll") {
            pollCount++;
          } else if (matchedQ.type === "wordcloud") {
            wordcloudCount++;
          }
        }
      }

      // Compute engagement feature via core ML Engine
      const analysis: StudentEngagementAnalysis = calculateStudentEngagement({
        participantId: p.id,
        name: p.name,
        sessionId: p.session_id,
        joinedAt: p.joined_at,
        totalSessionQuestions: studentQuestions.length,
        attemptedQuestions,
        attemptedQuizQuestions: quizCount,
        unattemptedQuestions: Math.max(0, studentQuestions.length - attemptedQuestions),
        skippedQuestions: Math.max(0, studentQuestions.length - attemptedQuestions),
        correctAnswers: correctCount,
        totalQuizQuestions: studentQuestions.filter((q) => q.type === "quiz").length,
        pollParticipationCount: pollCount,
        wordcloudParticipationCount: wordcloudCount,
        responseTimingsMs: [],
      });

      // Integrity event aggregates
      const fullscreenExits = studentEvents.filter(
        (e) => e.event_type === "FULLSCREEN_EXITED",
      ).length;
      const totalBlurSeconds = studentEvents.reduce((acc, e) => acc + (e.duration_seconds || 0), 0);

      const hashedId = await hashStudentId(p.id);

      trainingDataset.push({
        student_id_hash: hashedId,
        session_id: p.session_id,
        total_questions: studentQuestions.length,
        attempted_questions: attemptedQuestions,
        skipped_questions: Math.max(0, studentQuestions.length - attemptedQuestions),
        quiz_accuracy_pct: analysis.accuracyPercentage,
        poll_participation_count: pollCount,
        wordcloud_participation_count: wordcloudCount,
        avg_response_time_ms: analysis.avgResponseTimeMs,
        integrity_events_count: studentEvents.length,
        fullscreen_exits_count: fullscreenExits,
        total_blur_duration_seconds: totalBlurSeconds,
        target_engagement_score: analysis.engagementScore,
        target_engagement_class: analysis.engagementLevel,
      });
    }

    return trainingDataset;
  } catch (err) {
    console.error("Failed to extract ML training dataset:", err);
    return [];
  }
}

/**
 * Exports ML training dataset as a downloadable CSV file for Pandas/Scikit-Learn.
 */
export async function downloadMLDatasetCSV(): Promise<void> {
  const records = await extractMLTrainingDataset();

  if (records.length === 0) {
    throw new Error("No student interaction records available for dataset export.");
  }

  const headers = [
    "student_id_hash",
    "session_id",
    "total_questions",
    "attempted_questions",
    "skipped_questions",
    "quiz_accuracy_pct",
    "poll_participation_count",
    "wordcloud_participation_count",
    "avg_response_time_ms",
    "integrity_events_count",
    "fullscreen_exits_count",
    "total_blur_duration_seconds",
    "target_engagement_score",
    "target_engagement_class",
  ];

  const rows = records.map((r) => [
    r.student_id_hash,
    r.session_id,
    r.total_questions,
    r.attempted_questions,
    r.skipped_questions,
    r.quiz_accuracy_pct,
    r.poll_participation_count,
    r.wordcloud_participation_count,
    r.avg_response_time_ms,
    r.integrity_events_count,
    r.fullscreen_exits_count,
    r.total_blur_duration_seconds,
    r.target_engagement_score,
    r.target_engagement_class,
  ]);

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `kct_pulse_ml_dataset_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export interface MLSyncResult {
  totalExtracted: number;
  synced: number;
  error?: string;
}

/**
 * Synchronizes the extracted and anonymized ML training records directly into the
 * secondary ML Supabase database (table: ml_training_records).
 */
export async function syncMLDatasetToDatabase(): Promise<MLSyncResult> {
  const records = await extractMLTrainingDataset();
  if (records.length === 0) {
    return {
      totalExtracted: 0,
      synced: 0,
      error: "No student interaction records available to sync.",
    };
  }

  const payload = records.map((r) => ({
    student_id_hash: r.student_id_hash,
    session_id: r.session_id,
    total_questions: r.total_questions,
    attempted_questions: r.attempted_questions,
    skipped_questions: r.skipped_questions,
    quiz_accuracy_pct: r.quiz_accuracy_pct,
    poll_participation_count: r.poll_participation_count,
    wordcloud_participation_count: r.wordcloud_participation_count,
    avg_response_time_ms: r.avg_response_time_ms,
    integrity_events_count: r.integrity_events_count,
    fullscreen_exits_count: r.fullscreen_exits_count,
    total_blur_duration_seconds: r.total_blur_duration_seconds,
    target_engagement_score: r.target_engagement_score,
    target_engagement_class: r.target_engagement_class,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await mlSupabase.from("ml_training_records").upsert(payload, {
    onConflict: "student_id_hash,session_id",
  });

  if (error) {
    console.error("Secondary ML Database sync error:", error);
    return {
      totalExtracted: records.length,
      synced: 0,
      error: error.message,
    };
  }

  return {
    totalExtracted: records.length,
    synced: records.length,
  };
}
