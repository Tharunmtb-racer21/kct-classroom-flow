/**
 * ai-handlers.server.ts
 * Framework-independent request handling for the AI server functions.
 *
 * Every handler:
 *   1. authenticates the caller with a verified Firebase ID token,
 *   2. requires a verified @kct.ac.in email (and the admin role for key diagnostics),
 *   3. applies a per-user rate limit,
 *   4. enforces a payload size cap and a strict schema,
 *   5. calls providers with server-only credentials and bounded timeouts.
 *
 * Errors thrown to callers are AiRequestError instances with safe, generic messages.
 */

import type { ZodTypeAny, z } from "zod";
import {
  AI_LIMITS,
  aiKeyTestInputSchema,
  chatInputSchema,
  emptyInputSchema,
  generateQuestionsInputSchema,
  integritySummaryInputSchema,
  type AiKeyDiagnosticResult,
  type AiKeyInventory,
  type ChatResult,
  type GenerateQuestionsResult,
  type IntegritySummaryResult,
} from "./ai-schemas";
import {
  AuthError,
  assertKctFaculty,
  createGoogleJwksProvider,
  extractBearerToken,
  resolveFirebaseProjectId,
  verifyFirebaseIdToken,
  type FirebaseIdentity,
} from "./firebase-token.server";
import {
  ProvidersUnavailableError,
  buildCandidates,
  buildChatSystemPrompt,
  buildIntegrityPrompt,
  buildQuestionPrompt,
  getProviderKeys,
  lastUserMessage,
  parseQuestionsResponse,
  runCompletionFailover,
  testProviderKeySlot,
  type EnvSource,
} from "./ai-providers.server";

export class AiRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AiRequestError";
    this.status = status;
  }
}

// ─── Rate limiting ───────────────────────────────────────────────────────────

export type RateBucket = "generate" | "chat" | "summary" | "diagnostics";

export const RATE_LIMITS: Record<RateBucket, { limit: number; windowMs: number }> = {
  generate: { limit: 10, windowMs: 10 * 60_000 },
  chat: { limit: 20, windowMs: 60_000 },
  summary: { limit: 30, windowMs: 10 * 60_000 },
  diagnostics: { limit: 60, windowMs: 10 * 60_000 },
};

/**
 * In-memory sliding-window limiter. On serverless platforms each instance keeps its
 * own window, so this bounds abuse per instance rather than globally.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly now: () => number = Date.now) {}

  check(bucket: RateBucket, uid: string): boolean {
    const { limit, windowMs } = RATE_LIMITS[bucket];
    const key = `${bucket}:${uid}`;
    const current = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => current - t < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(current);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.prune(current);
    return true;
  }

  private prune(current: number) {
    for (const [key, times] of this.hits) {
      const windowMs = RATE_LIMITS[key.split(":")[0] as RateBucket]?.windowMs ?? 600_000;
      if (times.every((t) => current - t >= windowMs)) this.hits.delete(key);
    }
  }
}

// ─── Dependencies ────────────────────────────────────────────────────────────

export interface AiHandlerDeps {
  env: EnvSource;
  verifyToken: (token: string) => Promise<FirebaseIdentity>;
  isAdmin: (token: string, identity: FirebaseIdentity) => Promise<boolean>;
  fetchImpl: typeof fetch;
  rateLimiter: RateLimiter;
  now: () => number;
  logger: (message: string) => void;
}

/**
 * Checks the admin role through Supabase using the caller's own Firebase token, so the
 * existing RLS policy on user_roles (public.auth_uid() = user_id) decides the answer.
 * Fails closed: any error, missing configuration, or non-200 response means "not admin".
 */
export async function checkAdminViaSupabase(
  env: EnvSource,
  token: string,
  identity: FirebaseIdentity,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const baseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const apiKey = (env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!baseUrl || !apiKey) return false;

  const url =
    `${baseUrl}/rest/v1/user_roles?select=role` +
    `&user_id=eq.${encodeURIComponent(identity.uid)}&role=eq.admin&limit=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetchImpl(url, {
      headers: { apikey: apiKey, Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) && rows.some((r) => (r as { role?: unknown })?.role === "admin");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let defaultDeps: AiHandlerDeps | null = null;

/** Production dependencies, built from server environment variables. */
export function getDefaultAiDeps(): AiHandlerDeps {
  if (defaultDeps) return defaultDeps;
  const env = process.env as EnvSource;
  const jwks = createGoogleJwksProvider(fetch);
  defaultDeps = {
    env,
    verifyToken: (token) =>
      verifyFirebaseIdToken(token, { projectId: resolveFirebaseProjectId(env), getKeys: jwks }),
    isAdmin: (token, identity) => checkAdminViaSupabase(env, token, identity, fetch),
    fetchImpl: fetch,
    rateLimiter: new RateLimiter(),
    now: Date.now,
    logger: (m) => console.warn(m),
  };
  return defaultDeps;
}

// ─── Shared steps ────────────────────────────────────────────────────────────

async function authenticate(
  authorization: string | null | undefined,
  deps: AiHandlerDeps,
  bucket: RateBucket,
  options: { requireAdmin?: boolean } = {},
): Promise<{ identity: FirebaseIdentity; token: string }> {
  let identity: FirebaseIdentity;
  let token: string;
  try {
    token = extractBearerToken(authorization);
    identity = await deps.verifyToken(token);
    assertKctFaculty(identity);
  } catch (err) {
    if (err instanceof AuthError) throw new AiRequestError(err.status, err.message);
    throw new AiRequestError(401, "Authentication required.");
  }

  if (options.requireAdmin && !(await deps.isAdmin(token, identity))) {
    throw new AiRequestError(403, "Administrator access is required.");
  }
  if (!deps.rateLimiter.check(bucket, identity.uid)) {
    throw new AiRequestError(429, "Too many AI requests. Please wait a moment and try again.");
  }
  return { identity, token };
}

function parseInput<S extends ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  let size = 0;
  try {
    size = JSON.stringify(raw ?? null).length;
  } catch {
    throw new AiRequestError(400, "Invalid request.");
  }
  if (size > AI_LIMITS.maxPayloadBytes) {
    throw new AiRequestError(413, "Request is too large.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AiRequestError(400, "Invalid request.");
  }
  return result.data;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function handleGenerateQuestions(
  authorization: string | null | undefined,
  rawInput: unknown,
  deps: AiHandlerDeps = getDefaultAiDeps(),
): Promise<GenerateQuestionsResult> {
  await authenticate(authorization, deps, "generate");
  const input = parseInput(generateQuestionsInputSchema, rawInput);
  const prompt = buildQuestionPrompt(input.text, input.count, input.types);

  try {
    const { questions, success } = await runCompletionFailover(
      buildCandidates(deps.env),
      { messages: [{ role: "user", content: prompt }], temperature: 0.4, maxTokens: 2048 },
      {
        fetchImpl: deps.fetchImpl,
        perAttemptTimeoutMs: 25_000,
        totalTimeoutMs: 50_000,
        maxAttempts: 6,
        now: deps.now,
        logger: deps.logger,
      },
      (success) => ({
        success,
        questions: parseQuestionsResponse(success.content, input.types, input.count),
      }),
    );
    return { questions, usage: success.usage, provider: success.provider, model: success.model };
  } catch (err) {
    if (err instanceof ProvidersUnavailableError) {
      throw new AiRequestError(503, "AI question generation is temporarily unavailable.");
    }
    throw new AiRequestError(502, "AI question generation failed.");
  }
}

export const CHAT_FALLBACK_MESSAGE =
  "KCT PULSE Intelligent Assistant is temporarily operating in local fallback mode.";

export async function handleChat(
  authorization: string | null | undefined,
  rawInput: unknown,
  deps: AiHandlerDeps = getDefaultAiDeps(),
): Promise<ChatResult> {
  await authenticate(authorization, deps, "chat");
  const input = parseInput(chatInputSchema, rawInput);
  const system = buildChatSystemPrompt(lastUserMessage(input.messages));

  try {
    const result = await runCompletionFailover(
      buildCandidates(deps.env),
      {
        messages: [{ role: "system", content: system }, ...input.messages],
        temperature: 0.7,
        maxTokens: 1024,
      },
      {
        fetchImpl: deps.fetchImpl,
        perAttemptTimeoutMs: 15_000,
        totalTimeoutMs: 25_000,
        maxAttempts: 4,
        now: deps.now,
        logger: deps.logger,
      },
    );
    return {
      content: result.content,
      fallback: false,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
    };
  } catch {
    return { content: CHAT_FALLBACK_MESSAGE, fallback: true };
  }
}

export const INTEGRITY_FALLBACK_MESSAGE =
  "AI Proctoring Summary Unavailable: the AI service is not reachable right now.";

export async function handleIntegritySummary(
  authorization: string | null | undefined,
  rawInput: unknown,
  deps: AiHandlerDeps = getDefaultAiDeps(),
): Promise<IntegritySummaryResult> {
  await authenticate(authorization, deps, "summary");
  const input = parseInput(integritySummaryInputSchema, rawInput);

  if (input.events.length === 0) {
    return {
      summary:
        "This student has no integrity alerts. They stayed in fullscreen and kept focus on the exam window throughout the entire session.",
      fallback: false,
    };
  }

  try {
    const result = await runCompletionFailover(
      buildCandidates(deps.env),
      {
        messages: [
          { role: "system", content: "You are a professional, concise exam proctoring auditor." },
          { role: "user", content: buildIntegrityPrompt(input.participantName, input.events) },
        ],
        temperature: 0.3,
        maxTokens: 200,
      },
      {
        fetchImpl: deps.fetchImpl,
        perAttemptTimeoutMs: 15_000,
        totalTimeoutMs: 25_000,
        maxAttempts: 4,
        now: deps.now,
        logger: deps.logger,
      },
    );
    return { summary: result.content.trim(), fallback: false };
  } catch {
    return { summary: INTEGRITY_FALLBACK_MESSAGE, fallback: true };
  }
}

export async function handleAiKeyInventory(
  authorization: string | null | undefined,
  rawInput: unknown,
  deps: AiHandlerDeps = getDefaultAiDeps(),
): Promise<AiKeyInventory> {
  await authenticate(authorization, deps, "diagnostics", { requireAdmin: true });
  parseInput(emptyInputSchema, rawInput);
  return {
    groq: Math.min(getProviderKeys(deps.env, "groq").length, AI_LIMITS.maxKeySlots),
    gemini: Math.min(getProviderKeys(deps.env, "gemini").length, AI_LIMITS.maxKeySlots),
  };
}

export async function handleAiKeyTest(
  authorization: string | null | undefined,
  rawInput: unknown,
  deps: AiHandlerDeps = getDefaultAiDeps(),
): Promise<AiKeyDiagnosticResult> {
  await authenticate(authorization, deps, "diagnostics", { requireAdmin: true });
  const input = parseInput(aiKeyTestInputSchema, rawInput);
  return testProviderKeySlot(deps.env, input.provider, input.index, deps.fetchImpl, deps.now);
}
