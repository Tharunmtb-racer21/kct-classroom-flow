/**
 * ai-schemas.ts
 * Shared request limits, schemas, and types for the AI server functions.
 *
 * This module is imported by both the browser and the server. It must never
 * contain provider credentials, provider URLs with keys, or secret values.
 */

import { z } from "zod";

export type QType = "quiz" | "poll" | "wordcloud";

export interface GeneratedQuestion {
  type: QType;
  title: string;
  options: string[];
  correct_answer: string | null;
}

/** Chat turns accepted from the browser. The system prompt is built on the server only. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AiKeyProvider = "groq" | "gemini";

export type AiKeyDiagnosticStatus = "active" | "rate_limited" | "invalid" | "error";

export interface AiKeyDiagnosticResult {
  success: boolean;
  status: AiKeyDiagnosticStatus;
  statusCode?: number;
  latencyMs?: number;
  errorCategory?:
    | "network_error"
    | "invalid_key"
    | "forbidden"
    | "rate_limited"
    | "server_error"
    | "client_error"
    | "not_configured"
    | "unknown";
  errorMsg?: string;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerateQuestionsResult {
  questions: GeneratedQuestion[];
  usage: AiUsage;
  provider: string;
  model: string;
}

export interface ChatResult {
  content: string;
  fallback: boolean;
  provider?: string;
  model?: string;
  usage?: AiUsage;
}

export interface IntegritySummaryResult {
  summary: string;
  fallback: boolean;
}

export interface AiKeyInventory {
  groq: number;
  gemini: number;
}

// ─── Limits ──────────────────────────────────────────────────────────────────

export const AI_LIMITS = {
  /** Maximum extracted document characters sent for question generation. */
  maxDocumentChars: 60_000,
  minDocumentChars: 20,
  minQuestions: 1,
  maxQuestions: 15,
  maxChatMessages: 12,
  maxChatMessageChars: 2_000,
  maxIntegrityEvents: 300,
  maxParticipantNameChars: 120,
  maxEventTypeChars: 64,
  /** Hard cap on the serialized size of any AI request payload. */
  maxPayloadBytes: 128 * 1024,
  /** Diagnostics can address at most this many configured key slots per provider. */
  maxKeySlots: 32,
} as const;

// ─── Schemas ─────────────────────────────────────────────────────────────────

const questionTypeSchema = z.enum(["quiz", "poll", "wordcloud"]);

export const generateQuestionsInputSchema = z
  .object({
    text: z.string().min(AI_LIMITS.minDocumentChars).max(AI_LIMITS.maxDocumentChars),
    count: z.number().int().min(AI_LIMITS.minQuestions).max(AI_LIMITS.maxQuestions),
    types: z
      .array(questionTypeSchema)
      .min(1)
      .max(3)
      .refine((types) => new Set(types).size === types.length, "Duplicate question types"),
  })
  .strict();

export const chatInputSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(AI_LIMITS.maxChatMessageChars),
          })
          .strict(),
      )
      .min(1)
      .max(AI_LIMITS.maxChatMessages)
      .refine(
        (messages) => messages[messages.length - 1]?.role === "user",
        "Last message must be from the user",
      ),
  })
  .strict();

export const integritySummaryInputSchema = z
  .object({
    participantName: z.string().min(1).max(AI_LIMITS.maxParticipantNameChars),
    events: z
      .array(
        z
          .object({
            event_type: z
              .string()
              .min(1)
              .max(AI_LIMITS.maxEventTypeChars)
              .regex(/^[A-Z][A-Z0-9_]*$/, "Invalid event type"),
            timestamp: z.string().min(1).max(64),
            duration_seconds: z.number().int().min(0).max(86_400).nullable().optional(),
          })
          .strict(),
      )
      .max(AI_LIMITS.maxIntegrityEvents),
  })
  .strict();

export const aiKeyTestInputSchema = z
  .object({
    provider: z.enum(["groq", "gemini"]),
    index: z
      .number()
      .int()
      .min(0)
      .max(AI_LIMITS.maxKeySlots - 1),
  })
  .strict();

export const emptyInputSchema = z.union([z.undefined(), z.null(), z.object({}).strict()]);

export type GenerateQuestionsInput = z.infer<typeof generateQuestionsInputSchema>;
export type ChatInput = z.infer<typeof chatInputSchema>;
export type IntegritySummaryInput = z.infer<typeof integritySummaryInputSchema>;
export type AiKeyTestInput = z.infer<typeof aiKeyTestInputSchema>;
