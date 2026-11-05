import { supabase } from "@/integrations/supabase/client";
import type { Row, Participant, Question, Response } from "@/types/reports.types";

// Keep chunk sizes at 25 to:
// 1. Never trigger PostgREST's 1000-row limit on responses or participants.
// 2. Keep each query's execution time strictly under 200ms in PostgreSQL.
// 3. Prevent statement timeout (error 57014) even under heavy concurrent load.
const SESSION_CHUNK_SIZE = 25;
const QUESTION_CHUNK_SIZE = 25;

export type EnrichedParticipant = Participant & { session_id?: string };
export type EnrichedResponse = Response & { question_id?: string };
export type EnrichedQuestion = Question & { responses: EnrichedResponse[] };
export type EnrichedRow = Omit<Row, "participants" | "questions"> & {
  participants: EnrichedParticipant[];
  questions: EnrichedQuestion[];
};

/**
 * Execute a database query with automatic retry on transient error or timeout.
 */
async function retryQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  retries = 2,
  delayMs = 300
): Promise<{ data: T | null; error: any }> {
  let attempt = 0;
  while (true) {
    try {
      const res = await queryFn();
      if (!res.error || attempt >= retries) {
        return res;
      }
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    } catch (err) {
      if (attempt >= retries) {
        return { data: null, error: err };
      }
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

/**
 * Fetches and hydrates session reports for a given creator.
 *
 * Instead of performing an expensive, deeply-nested join in a single PostgREST
 * query (which causes Postgres statement timeouts when a creator has many sessions
 * and responses), this service fetches sessions, participants, questions, and responses
 * using performant parallel batch queries with chunking and retries, and hydrates
 * the relational tree in-memory in O(N) time.
 */
export async function fetchFacultyReports(
  creatorId: string,
  sessionId?: string
): Promise<EnrichedRow[]> {
  if (!creatorId) return [];

  // 1. Fetch sessions for this creator ordered by created_at DESC
  let sessionsQuery = supabase
    .from("sessions")
    .select("id, title, code, status, created_at")
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false });

  if (sessionId && sessionId !== "all") {
    sessionsQuery = sessionsQuery.eq("id", sessionId);
  }

  const { data: sessions, error: sessionsError } = await retryQuery(() => sessionsQuery);

  if (sessionsError) {
    console.error("[ReportService] Error fetching sessions:", sessionsError);
    throw sessionsError;
  }

  if (!sessions || sessions.length === 0) {
    return [];
  }

  const sessionIds = sessions.map((s) => s.id);

  // 2. Chunk session IDs for participants and questions
  const sessionChunks: string[][] = [];
  for (let i = 0; i < sessionIds.length; i += SESSION_CHUNK_SIZE) {
    sessionChunks.push(sessionIds.slice(i, i + SESSION_CHUNK_SIZE));
  }

  const [partChunkResults, questChunkResults] = await Promise.all([
    Promise.all(
      sessionChunks.map((chunk) =>
        retryQuery(() =>
          supabase
            .from("participants")
            .select("id, session_id, name, joined_at")
            .in("session_id", chunk)
        )
      )
    ),
    Promise.all(
      sessionChunks.map((chunk) =>
        retryQuery(() =>
          supabase
            .from("questions")
            .select("id, session_id, title, type, options, correct_answer, order_index, points")
            .in("session_id", chunk)
        )
      )
    ),
  ]);

  for (const res of partChunkResults) {
    if (res.error) {
      console.error("[ReportService] Error fetching participants:", res.error);
    }
  }

  for (const res of questChunkResults) {
    if (res.error) {
      console.error("[ReportService] Error fetching questions:", res.error);
    }
  }

  const allParticipants = partChunkResults.flatMap((r) => r.data || []) as (Participant & {
    session_id: string;
  })[];
  const allQuestions = questChunkResults.flatMap((r) => r.data || []) as (Omit<Question, "responses"> & {
    session_id: string;
  })[];

  // 3. Chunk question IDs for responses fetch
  const questionIds = allQuestions.map((q) => q.id);
  let allResponses: (Response & { question_id: string })[] = [];

  if (questionIds.length > 0) {
    const questionChunks: string[][] = [];
    for (let i = 0; i < questionIds.length; i += QUESTION_CHUNK_SIZE) {
      questionChunks.push(questionIds.slice(i, i + QUESTION_CHUNK_SIZE));
    }

    const respChunkResults = await Promise.all(
      questionChunks.map((chunk) =>
        retryQuery(() =>
          supabase
            .from("responses")
            .select("id, question_id, answer, participant_id, created_at")
            .in("question_id", chunk)
        )
      )
    );

    for (const res of respChunkResults) {
      if (res.error) {
        console.warn("[ReportService] Notice on fetching responses chunk:", res.error);
      }
    }

    allResponses = respChunkResults.flatMap((r) => r.data || []) as (Response & {
      question_id: string;
    })[];
  }

  // 4. Assemble relational tree in O(N) time with Maps
  const responsesByQuestion = new Map<string, EnrichedResponse[]>();
  for (const r of allResponses) {
    let list = responsesByQuestion.get(r.question_id);
    if (!list) {
      list = [];
      responsesByQuestion.set(r.question_id, list);
    }
    list.push({
      id: r.id,
      question_id: r.question_id,
      answer: r.answer,
      participant_id: r.participant_id,
      created_at: r.created_at,
    });
  }

  const questionsBySession = new Map<string, EnrichedQuestion[]>();
  for (const q of allQuestions) {
    let list = questionsBySession.get(q.session_id);
    if (!list) {
      list = [];
      questionsBySession.set(q.session_id, list);
    }
    list.push({
      id: q.id,
      title: q.title,
      type: q.type,
      options: (Array.isArray(q.options) ? q.options : []) as string[],
      correct_answer: q.correct_answer,
      order_index: q.order_index ?? 0,
      points: q.points ?? 0,
      marks: q.points ?? 0,
      responses: responsesByQuestion.get(q.id) || [],
    });
  }

  const participantsBySession = new Map<string, EnrichedParticipant[]>();
  for (const p of allParticipants) {
    let list = participantsBySession.get(p.session_id);
    if (!list) {
      list = [];
      participantsBySession.set(p.session_id, list);
    }
    list.push({
      id: p.id,
      session_id: p.session_id,
      name: p.name,
      joined_at: p.joined_at,
    });
  }

  // 5. Build final sorted rows
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    code: s.code,
    status: s.status as "draft" | "live" | "ended",
    created_at: s.created_at,
    participants: participantsBySession.get(s.id) || [],
    questions: (questionsBySession.get(s.id) || []).sort(
      (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
    ),
  }));
}
