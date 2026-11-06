/**
 * ai-service.ts
 * Browser-side entry points for AI features.
 *
 * Every AI request goes through an authenticated TanStack Start server function.
 * The browser never holds provider credentials and never calls provider APIs directly.
 * Provider keys are configured only as server environment variables
 * (see src/lib/ai-providers.server.ts).
 */

import { generateQuestionsLocally } from "./local-question-generator";
import { recordTokenUsage } from "./token-tracker";
import { queryKnowledgeBase } from "./chatbot/knowledge-engine";
import {
  AI_LIMITS,
  type AiKeyDiagnosticStatus,
  type AiKeyInventory,
  type AiKeyProvider,
  type ChatMessage,
  type GeneratedQuestion,
  type QType,
} from "./ai-schemas";
import {
  generateIntegritySummaryServerFn,
  generateQuestionsServerFn,
  getAiKeyInventoryServerFn,
  testAiKeyServerFn,
} from "./ai-server";

export type { ChatMessage, GeneratedQuestion, QType, AiKeyProvider } from "./ai-schemas";
export { queryKnowledgeBase } from "./chatbot/knowledge-engine";
export type { ChatbotAnswer } from "@/data/chatbot/knowledge";

export interface GenerateQuestionsOptions {
  text: string;
  count: number;
  types: QType[];
}

/**
 * Generate classroom questions from document text through the authenticated server.
 * Falls back to the local browser generator if the server request fails for any reason.
 */
export async function generateQuestionsFromText(
  opts: GenerateQuestionsOptions,
): Promise<GeneratedQuestion[]> {
  const text = opts.text.slice(0, AI_LIMITS.maxDocumentChars);
  const count = Math.min(
    Math.max(Math.round(opts.count), AI_LIMITS.minQuestions),
    AI_LIMITS.maxQuestions,
  );
  const types = Array.from(new Set(opts.types));

  if (text.trim().length >= AI_LIMITS.minDocumentChars && types.length > 0) {
    try {
      const result = await generateQuestionsServerFn({ data: { text, count, types } });
      if (result?.questions?.length) {
        recordTokenUsage({
          provider: result.provider,
          model: result.model,
          feature: "question_generation",
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          success: true,
        });
        return result.questions;
      }
    } catch (serverErr: unknown) {
      const message = serverErr instanceof Error ? serverErr.message : "unavailable";
      console.warn("Server-side AI question generation notice:", message);
    }
  }

  console.log("Generating questions using browser fallback generator...");
  try {
    return generateQuestionsLocally(opts.text, count, types);
  } catch (localErr: unknown) {
    const message = localErr instanceof Error ? localErr.message : "unknown error";
    throw new Error(`Failed to generate questions: ${message}`);
  }
}

/**
 * Chat reply from the dashboard assistant.
 * Powered 100% locally by the in-repository KCT PULSE Knowledge Engine.
 * ABSOLUTELY ZERO external AI API calls (no Gemini, Groq, or OpenAI).
 */
export async function generateChatResponse(messages: ChatMessage[]): Promise<string> {
  const lastUserTurn = [...messages].reverse().find((m) => m.role === "user");
  const query = lastUserTurn?.content || "";
  const history = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const result = queryKnowledgeBase(query, history);
  return result.answer;
}

/** AI proctoring summary of a student's integrity events, generated on the server. */
export async function generateIntegritySummary(
  events: Array<{ event_type?: unknown; timestamp?: unknown; duration_seconds?: unknown }>,
  participantName: string,
): Promise<string> {
  const safeEvents = events
    .filter((e) => typeof e.event_type === "string" && /^[A-Z][A-Z0-9_]*$/.test(e.event_type))
    .slice(-AI_LIMITS.maxIntegrityEvents)
    .map((e) => ({
      event_type: (e.event_type as string).slice(0, AI_LIMITS.maxEventTypeChars),
      timestamp: String(e.timestamp ?? "").slice(0, 64) || new Date(0).toISOString(),
      duration_seconds:
        typeof e.duration_seconds === "number" && Number.isFinite(e.duration_seconds)
          ? Math.min(Math.max(Math.round(e.duration_seconds), 0), 86_400)
          : null,
    }));

  const name = participantName.trim().slice(0, AI_LIMITS.maxParticipantNameChars) || "Student";

  try {
    const result = await generateIntegritySummaryServerFn({
      data: { participantName: name, events: safeEvents },
    });
    return result.summary;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "the AI service is not reachable";
    return `AI Proctoring Summary Unavailable: ${message}`;
  }
}

// ─── Developer key diagnostics (admin only, enforced on the server) ──────────

/** Non-secret label for a configured key slot. Contains no key material. */
export function getAiKeySlotLabel(provider: AiKeyProvider, index: number): string {
  return `${provider === "groq" ? "Groq" : "Gemini"} slot #${index + 1}`;
}

/** Number of key slots configured on the server for each provider. */
export async function getAiKeyInventory(): Promise<AiKeyInventory> {
  return getAiKeyInventoryServerFn();
}

/** Health check for one server-side key slot. */
export async function testAiKey(
  provider: AiKeyProvider,
  index: number,
): Promise<{ status: AiKeyDiagnosticStatus; errorMsg?: string }> {
  const label = getAiKeySlotLabel(provider, index);
  try {
    const res = await testAiKeyServerFn({ data: { provider, index } });
    recordTokenUsage({
      provider,
      model: "diagnostic",
      keySignature: label,
      feature: "diagnostic_test",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: res.latencyMs,
      success: res.success,
      errorMessage: res.errorMsg,
    });
    return { status: res.status, errorMsg: res.errorMsg };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    recordTokenUsage({
      provider,
      model: "diagnostic",
      keySignature: label,
      feature: "diagnostic_test",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      success: false,
      errorMessage: errorMsg,
    });
    return { status: "error", errorMsg };
  }
}

// ─── Local diagnostic telemetry (no secrets) ─────────────────────────────────

/**
 * Records the start of a key diagnostic attempt in localStorage telemetry.
 * Increments `attempts` by 1 and updates `lastUsed` timestamp.
 */
export function recordKeyDiagnosticAttempt(signature: string): void {
  if (typeof window === "undefined" || !signature) return;
  try {
    const data = JSON.parse(localStorage.getItem("kct_ai_key_usage") || "{}");
    if (!data[signature]) {
      data[signature] = { attempts: 0, successes: 0, failures: 0, lastUsed: "" };
    }
    data[signature].attempts = (data[signature].attempts || 0) + 1;
    data[signature].lastUsed = new Date().toISOString();
    localStorage.setItem("kct_ai_key_usage", JSON.stringify(data));
  } catch (e) {
    console.error("Failed to record key diagnostic attempt:", e);
  }
}

/**
 * Records the result of a key diagnostic attempt in localStorage telemetry.
 * Guarantees attempts >= successes + failures.
 */
export function recordKeyDiagnosticResult(signature: string, success: boolean): void {
  if (typeof window === "undefined" || !signature) return;
  try {
    const data = JSON.parse(localStorage.getItem("kct_ai_key_usage") || "{}");
    if (!data[signature]) {
      data[signature] = { attempts: 1, successes: 0, failures: 0, lastUsed: "" };
    }
    if (success) {
      data[signature].successes = (data[signature].successes || 0) + 1;
    } else {
      data[signature].failures = (data[signature].failures || 0) + 1;
    }
    const totalOutcomes = (data[signature].successes || 0) + (data[signature].failures || 0);
    if ((data[signature].attempts || 0) < totalOutcomes) {
      data[signature].attempts = totalOutcomes;
    }
    data[signature].lastUsed = new Date().toISOString();
    localStorage.setItem("kct_ai_key_usage", JSON.stringify(data));
  } catch (e) {
    console.error("Failed to record key diagnostic result:", e);
  }
}

/** Helper to track key usage in localStorage */
export function trackKeyUsage(signature: string, success: boolean): void {
  recordKeyDiagnosticAttempt(signature);
  recordKeyDiagnosticResult(signature, success);
}
