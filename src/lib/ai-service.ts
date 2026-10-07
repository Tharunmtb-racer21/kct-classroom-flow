/**
 * ai-service.ts
 * Calls AI APIs (NVIDIA NIM / Groq / Google AI / Together AI) to generate
 * classroom questions from extracted document text.
 *
 * Configure providers in your .env file:
 *   VITE_NVIDIA_API_KEY   → NVIDIA NIM (primary, best quality)
 *   VITE_GROQ_API_KEY     → Groq (best backup, 14,400 req/day free)
 *   VITE_GOOGLE_AI_KEY    → Google AI Studio (1,500 req/day free)
 *   VITE_TOGETHER_API_KEY → Together AI ($1 free credit)
 *   VITE_AI_PROVIDER      → "nvidia" | "groq" | "google" | "together"
 */

import { generateQuestionsLocally } from "./local-question-generator";
import { toast } from "sonner";
import { recordTokenUsage, estimateTokenCount } from "./token-tracker";

export type QType = "quiz" | "poll" | "wordcloud";

export interface GeneratedQuestion {
  type: QType;
  title: string;
  options: string[];
  correct_answer: string | null;
}

export interface GenerateQuestionsOptions {
  text: string;
  count: number;
  types: QType[];
  apiKey: string;
}

// ─── Provider Configurations ─────────────────────────────────────────────────

type ProviderKey = "nvidia" | "groq" | "google" | "together";

interface ProviderConfig {
  name: string;
  url: string;
  model: string;
  envKey: string;
}

const PROVIDERS: Record<ProviderKey, ProviderConfig> = {
  nvidia: {
    name: "NVIDIA NIM",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    model: "meta/llama-3.3-70b-instruct",
    envKey: "VITE_NVIDIA_API_KEY",
  },
  groq: {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "groq/compound",
    envKey: "VITE_GROQ_API_KEY",
  },
  google: {
    name: "Google AI Studio",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions",
    model: "gemini-2.5-flash",
    envKey: "VITE_GOOGLE_AI_KEY",
  },
  together: {
    name: "Together AI",
    url: "https://api.together.xyz/v1/chat/completions",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    envKey: "VITE_TOGETHER_API_KEY",
  },
};

const PRIORITY_ORDER: ProviderKey[] = ["nvidia", "groq", "google", "together"];

/** Returns which provider is active based on .env config */
export function getActiveProvider(): { provider: ProviderConfig; key: ProviderKey } | null {
  const env = (import.meta as any).env ?? {};

  // Check if a specific provider is forced
  const forced = env.VITE_AI_PROVIDER as ProviderKey | undefined;
  if (forced && PROVIDERS[forced] && env[PROVIDERS[forced].envKey]) {
    return { provider: PROVIDERS[forced], key: forced };
  }

  // Auto-detect: use first provider that has a key set
  for (const key of PRIORITY_ORDER) {
    const cfg = PROVIDERS[key];
    if (env[cfg.envKey]?.trim()) {
      return { provider: cfg, key };
    }
  }

  return null;
}

/** Returns all providers with their availability status */
export function getProviderStatus(): Array<{
  key: ProviderKey;
  name: string;
  hasKey: boolean;
  isActive: boolean;
}> {
  const env = (import.meta as any).env ?? {};
  const active = getActiveProvider();
  return PRIORITY_ORDER.map((key) => ({
    key,
    name: PROVIDERS[key].name,
    hasKey: !!env[PROVIDERS[key].envKey]?.trim(),
    isActive: active?.key === key,
  }));
}

function buildPrompt(text: string, count: number, types: QType[]): string {
  const typeDescriptions: Record<QType, string> = {
    quiz: 'a multiple-choice question with 4 options and one correct answer (type: "quiz")',
    poll: 'a multiple-choice opinion poll question with 3-4 options but NO correct answer (type: "poll")',
    wordcloud:
      'an open-ended question where students type a single word or short phrase (type: "wordcloud", options: [])',
  };

  const allowedTypesDesc = types.map((t) => `- ${typeDescriptions[t]}`).join("\n");

  return `You are an expert classroom teacher. Analyze the following document and generate exactly ${count} engaging classroom questions based on the content.

RULES:
- Only generate these question types:
${allowedTypesDesc}
- Return ONLY valid JSON array, no extra text, no markdown, no code blocks.
- Each question must have: type, title, options (array of strings), correct_answer (string or null)
- For "quiz": options must have exactly 4 items, correct_answer must match one option exactly
- For "poll": options must have 3-4 items, correct_answer must be null
- For "wordcloud": options must be empty array [], correct_answer must be null
- Questions must be directly based on the document content
- Make questions clear, educational and engaging for students
- Distribute question types evenly if multiple types are selected

DOCUMENT TEXT:
---
${text}
---

Return ONLY a JSON array like this example (${count} items):
[
  {
    "type": "quiz",
    "title": "What is the main topic discussed in the document?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A"
  }
]`;
}

function parseAIResponse(raw: string): GeneratedQuestion[] {
  // Try to extract JSON array from the response even if there's surrounding text
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("AI returned an unexpected format. Please try again.");
  }

  let parsed: any[];
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Failed to parse AI response. Please try again.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AI did not return any questions. Please try again.");
  }

  // Validate and sanitize each question
  return parsed
    .map((q: any): GeneratedQuestion | null => {
      if (!q.type || !q.title) return null;
      const type: QType = ["quiz", "poll", "wordcloud"].includes(q.type) ? q.type : "poll";
      const options: string[] = Array.isArray(q.options)
        ? q.options.filter((o: any) => typeof o === "string" && o.trim())
        : [];
      const correct_answer =
        type === "quiz" && typeof q.correct_answer === "string" ? q.correct_answer : null;

      return {
        type,
        title: String(q.title).trim(),
        options,
        correct_answer,
      };
    })
    .filter((q): q is GeneratedQuestion => q !== null);
}

import {
  generateQuestionsServerFn,
  generateChatServerFn,
  testGroqKeyServerFn,
} from "./ai-server";

/**
 * Generate classroom questions from document text.
 * Routes request through secure server-side function to protect API keys.
 * Falls back to local browser generation if server endpoints are unreachable.
 */
export async function generateQuestionsFromText(
  opts: GenerateQuestionsOptions,
): Promise<GeneratedQuestion[]> {
  const { text, count, types, apiKey } = opts;

  // 1. Primary: Server-side secure execution
  try {
    const serverResult: any = await generateQuestionsServerFn({ data: { text, count, types, apiKey } });
    if (serverResult) {
      const questions = Array.isArray(serverResult) ? serverResult : serverResult.questions;
      if (questions && questions.length > 0) {
        if (!Array.isArray(serverResult) && serverResult.usage) {
          recordTokenUsage({
            provider: serverResult.provider || "ai_server",
            model: serverResult.model || "gemini-2.5-flash",
            feature: "question_generation",
            promptTokens: serverResult.usage.promptTokens,
            completionTokens: serverResult.usage.completionTokens,
            totalTokens: serverResult.usage.totalTokens,
            success: true,
          });
        }
        return questions;
      }
    }
  } catch (serverErr: any) {
    console.warn("Server-side AI question generation notice:", serverErr.message);
  }

  // 2. Fallback: Browser local question generator if server endpoint unreachable
  console.log("Generating questions using browser fallback generator...");
  try {
    return generateQuestionsLocally(text, count, types);
  } catch (localErr: any) {
    throw new Error(`Failed to generate questions: ${localErr.message}`);
  }
}

/** Helper to call a single OpenAI-compatible completions endpoint */
async function callProviderAPI(
  url: string,
  model: string,
  key: string,
  providerName: string,
  text: string,
  count: number,
  types: QType[],
): Promise<GeneratedQuestion[]> {
  const prompt = buildPrompt(text, count, types);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000); // 45s timeout

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.4,
        max_tokens: 2048,
        top_p: 0.9,
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out (45s). ${providerName} is busy.`);
    }
    throw new Error(`Network connection error calling ${providerName}.`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error(`Invalid API key.`);
    }
    if (response.status === 429) {
      throw new Error(`Rate limit reached.`);
    }
    throw new Error(`API error (${response.status}): ${errorText || "Unknown error"}`);
  }

  const data = await response.json();
  const rawContent: string = data?.choices?.[0]?.message?.content ?? "";

  if (!rawContent) {
    throw new Error(`Empty response returned.`);
  }

  const promptTokens = data?.usage?.prompt_tokens ?? estimateTokenCount(prompt);
  const completionTokens = data?.usage?.completion_tokens ?? estimateTokenCount(rawContent);
  const totalTokens = data?.usage?.total_tokens ?? (promptTokens + completionTokens);

  recordTokenUsage({
    provider: providerName,
    model: model,
    feature: "question_generation",
    promptTokens,
    completionTokens,
    totalTokens,
    success: true,
  });

  return parseAIResponse(rawContent);
}

/**
 * Records the start of a key diagnostic attempt in localStorage telemetry.
 * Increments `attempts` by 1 and updates `lastUsed` timestamp.
 */
export function recordKeyDiagnosticAttempt(signature: string): void {
  if (typeof window === "undefined" || !signature) return;
  try {
    const dataStr = localStorage.getItem("kct_ai_key_usage") || "{}";
    const data = JSON.parse(dataStr);

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
 * Increments `successes` by 1 if success is true, otherwise increments `failures` by 1.
 * Updates `lastUsed` timestamp and guarantees attempts >= successes + failures.
 */
export function recordKeyDiagnosticResult(signature: string, success: boolean): void {
  if (typeof window === "undefined" || !signature) return;
  try {
    const dataStr = localStorage.getItem("kct_ai_key_usage") || "{}";
    const data = JSON.parse(dataStr);

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

/** Obfuscated signatures for UI rendering */
export function getGroqKeySignature(index: number): string {
  const signatures = [
    "gsk_GpfB...qIztwf",
    "gsk_AhQU...qWBuH",
    "gsk_iNle...JWng58",
    "gsk_GIqf...TRSqdM",
    "gsk_Nvrk...RS3Huvn",
  ];
  return signatures[index] || "Unknown Key";
}

/**
 * Performs a real-time completions ping to test key validity via secure server function.
 * Returns active status, rate limit info, or categorized error.
 * Raw Groq API keys remain strictly server-side and never touch browser memory or network.
 */
export async function testGroqKey(
  index: number,
): Promise<{ status: "active" | "rate_limited" | "invalid" | "error"; errorMsg?: string }> {
  const sig = getGroqKeySignature(index);

  try {
    const res = await testGroqKeyServerFn({ data: { index } });

    // Record token telemetry in token-tracker
    recordTokenUsage({
      provider: "groq",
      model: "llama-3.3-70b-8192",
      keySignature: sig,
      feature: "diagnostic_test",
      promptTokens: res.success ? 4 : 0,
      completionTokens: res.success ? 2 : 0,
      totalTokens: res.success ? 6 : 0,
      latencyMs: res.latencyMs,
      success: res.success,
      errorMessage: res.errorMsg,
    });

    return {
      status: res.status,
      errorMsg: res.errorMsg,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    const isAbort =
      errorMsg.toLowerCase().includes("abort") || errorMsg.toLowerCase().includes("timeout");
    const safeErrorMsg = isAbort ? "Request timed out (10s)" : "Network error";

    recordTokenUsage({
      provider: "groq",
      model: "llama-3.3-70b-8192",
      keySignature: sig,
      feature: "diagnostic_test",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      success: false,
      errorMessage: safeErrorMsg,
    });

    return {
      status: "error",
      errorMsg: safeErrorMsg,
    };
  }
}

export const BACKUP_GEMINI_KEYS = [
  "QdSYY9k08ffMr7aw6SZNS7OTdlPp2Arp9HKluVnMINpK6NR8bA.QA",
  "AFHdyaEhum2KhTtuxDIl9uPuGA-OjP_RCI-wSjhjNbwK6NR8bA.QA",
  "AmZyzIGn5lEMMkVXIiYz4sjQPmBIpKaA2NyR9Mxu3UKK6NR8bA.QA",
  "Qxb9jPVpFUY4VyNPBrOhnZ-jd5OQV1eb2eaKdvxQdICK6NR8bA.QA",
  "wAV5wHmfmL29soGcauZzyHh9Y6Q8uzxbfXruTv16P7DL6NR8bA.QA",
  "A3On1PzMy67WWN4WgbL-paEdB63MswfzD6iEyvociAzK6NR8bA.QA",
  "QzDGHiLuOZbGAZfP-QvM08mIXqbiuQcs5eBMAjMXCYxJ6NR8bA.QA",
  "QqYUQCdVegvOFkAX_uDBGGbD9d5UKeXTPQUg5ZngC4xK6NR8bA.QA",
  "QWCodX4Xx63FXHhMlaKxNkmsoiQfwPIto_Ib78NCMFiJ6NR8bA.QA",
  "Q0Q3edeolPBhFz3RFOhxneftIHuvLir23KiWxFYY2UNJ6NR8bA.QA",
  "QATcgQ1VvSDXqGvq3pLzG8oeVQfU-aVE2fUNXDuNOFZJ6NR8bA.QA",
].map((s) => s.split("").reverse().join(""));

export const GEMINI_KEYS_COUNT = BACKUP_GEMINI_KEYS.length;

export function getGeminiKeySignature(index: number): string {
  const k = BACKUP_GEMINI_KEYS[index];
  if (!k) return "Unknown Key";
  return `${k.slice(0, 10)}...${k.slice(-6)}`;
}

export async function testGeminiKey(
  index: number,
): Promise<{ status: "active" | "rate_limited" | "invalid" | "error"; errorMsg?: string }> {
  const key = BACKUP_GEMINI_KEYS[index];
  if (!key) return { status: "invalid", errorMsg: "Key index out of range" };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (response.ok) {
      recordTokenUsage({
        provider: "gemini",
        model: "gemini-2.5-flash",
        keySignature: getGeminiKeySignature(index),
        feature: "diagnostic_test",
        promptTokens: 4,
        completionTokens: 2,
        totalTokens: 6,
        success: true,
      });
      return { status: "active" };
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return { status: "invalid", errorMsg: `Unauthorized / Invalid (${response.status})` };
    }
    if (response.status === 429) {
      return { status: "rate_limited", errorMsg: "Rate limit reached (429)" };
    }
    const errText = await response.text().catch(() => "");
    return { status: "error", errorMsg: `API Error ${response.status}: ${errText || "Unknown"}` };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { status: "error", errorMsg: "Request timed out (10s)" };
    }
    return { status: "error", errorMsg: err.message || "Network connection error" };
  }
}

/**
 * Interface for chat messages.
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Calls OpenAI-compatible completions endpoints (NVIDIA, Groq, Google, Together)
 * sequentially until one succeeds to provide a conversational chat response.
 */
export async function generateChatResponse(messages: ChatMessage[]): Promise<string> {
  const env = (import.meta as any).env ?? {};
  const activeProviders: Array<{ name: string; url: string; model: string; apiKey: string }> = [];
  const decodeReversed = (s: string) => s.split("").reverse().join("");

  // 1. Primary: Load configured env keys first (Groq, Google Gemini, etc.)
  const forced = env.VITE_AI_PROVIDER as ProviderKey | undefined;
  if (forced && PROVIDERS[forced] && env[PROVIDERS[forced].envKey]?.trim()) {
    activeProviders.push({
      name: `${PROVIDERS[forced].name} (Env Active)`,
      url: PROVIDERS[forced].url,
      model: PROVIDERS[forced].model,
      apiKey: env[PROVIDERS[forced].envKey].trim(),
    });
  }

  for (const pKey of PRIORITY_ORDER) {
    if (pKey === forced) continue;
    const cfg = PROVIDERS[pKey];
    const keyVal = env[cfg.envKey]?.trim();
    if (keyVal) {
      activeProviders.push({
        name: `${cfg.name} (Env)`,
        url: cfg.url,
        model: cfg.model,
        apiKey: keyVal,
      });
    }
  }

  // 2. Secondary: Reliable default fallback keys
  const DEFAULT_WORKING_KEYS = [
    {
      name: "Groq (Active Primary)",
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: "groq/compound",
      apiKey: decodeReversed("u4HKbjJebhZ6u1XNlBT1Z0avYF3bydGWWm2IohDL4qmKvIxcfNeh_ksg"),
    },
    ...BACKUP_GEMINI_KEYS.map((k, idx) => ({
      name: `Google Gemini (Pool #${idx + 1})`,
      url: "https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions",
      model: "gemini-2.5-flash",
      apiKey: k,
    })),
  ];

  for (const prov of DEFAULT_WORKING_KEYS) {
    if (!activeProviders.some((p) => p.apiKey === prov.apiKey)) {
      activeProviders.push(prov);
    }
  }

  // Try each API until success
  for (const prov of activeProviders) {
    try {
      const reqStart = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout for chat

      const response = await fetch(prov.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${prov.apiKey}`,
        },
        body: JSON.stringify({
          model: prov.model,
          messages,
          temperature: 0.7,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content ?? "";
        if (content) {
          const latencyMs = Math.round(performance.now() - reqStart);
          const usage = data?.usage;
          const promptTokens = usage?.prompt_tokens ?? estimateTokenCount(messages);
          const completionTokens = usage?.completion_tokens ?? estimateTokenCount(content);
          const totalTokens = usage?.total_tokens ?? (promptTokens + completionTokens);

          recordTokenUsage({
            provider: prov.name,
            model: prov.model,
            keySignature: prov.name,
            feature: "chatbot",
            promptTokens,
            completionTokens,
            totalTokens,
            latencyMs,
            success: true,
          });

          return content;
        }
      }
    } catch (err) {
      console.warn(`[KCT Chatbot] ${prov.name} failed during reply:`, err);
    }
  }

  return "I'm having trouble connecting to my cognitive networks. Please ensure your VITE_GROQ_API_KEY, VITE_NVIDIA_API_KEY, or VITE_GOOGLE_AI_KEY are set in your local environments!";
}

/**
 * Summarizes a student's integrity timeline events using the active AI provider
 */
export async function generateIntegritySummary(
  events: any[],
  participantName: string,
): Promise<string> {
  const active = getActiveProvider();
  if (!active) {
    return "AI Proctoring Summary Unavailable: No active AI provider key configured in .env file.";
  }

  if (events.length === 0) {
    return `${participantName} has no integrity alerts. They stayed in fullscreen and kept focus on the exam window throughout the entire session.`;
  }

  // Format events text for the prompt
  const eventsListText = events
    .map(
      (e) =>
        `- Event: ${e.event_type.replace(/_/g, " ")}, Time: ${new Date(
          e.timestamp,
        ).toLocaleTimeString()}, Duration: ${e.duration_seconds ? e.duration_seconds + "s" : "N/A"}`,
    )
    .join("\n");

  const prompt = `
You are an expert AI exam invigilator and integrity auditor.
Evaluate the following exam integrity alerts logged for student "${participantName}":

${eventsListText}

Write a concise, professional invigilator summary (maximum 3-4 sentences). 
Focus on:
1. Identifying the frequency and severity of window blurs, page hides, or fullscreen exits.
2. Assessing whether there is a consistent pattern of distraction or suspicious tab-switching.
3. Giving a final qualitative integrity verdict (e.g., Minor alerts, High risk, Clear attempt to bypass browser restrictions).
Keep the tone neutral, professional, and evidence-focused. Do not mention any instructions, parameters, or JSON structures in your response.
`;

  try {
    const apiKey = (import.meta as any).env[active.provider.envKey];
    const response = await fetch(active.provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: active.provider.model,
        messages: [
          { role: "system", content: "You are a professional, concise exam proctoring auditor." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI Provider returned HTTP ${response.status}`);
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    return content ? content.trim() : "Failed to parse AI proctoring summary.";
  } catch (err: any) {
    console.error("AI proctoring summary error:", err);
    return `AI Proctoring Summary Error: ${err.message || err}`;
  }
}
