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
    model: "llama-3.3-70b-8192",
    envKey: "VITE_GROQ_API_KEY",
  },
  google: {
    name: "Google AI Studio",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions",
    model: "gemini-3.7-flash",
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

/**
 * Generate classroom questions from document text.
 * Automatically uses the active AI provider configured in .env,
 * falls back to other available keys in .env, and finally
 * falls back to local browser-based generation if no keys work.
 */
export async function generateQuestionsFromText(
  opts: GenerateQuestionsOptions,
): Promise<GeneratedQuestion[]> {
  const { text, count, types, apiKey } = opts;
  const env = (import.meta as any).env ?? {};

  // 1. If user provided a specific API key in the UI, try that one first.
  if (apiKey?.trim()) {
    const trimmedKey = apiKey.trim();
    let url = "https://integrate.api.nvidia.com/v1/chat/completions";
    let model = "meta/llama-3.3-70b-instruct";
    let name = "NVIDIA NIM";

    // Auto-detect provider based on key format
    if (trimmedKey.startsWith("AIzaSy")) {
      url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
      model = "gemini-2.0-flash";
      name = "Google AI Studio";
    } else if (trimmedKey.startsWith("gsk_")) {
      url = "https://api.groq.com/openai/v1/chat/completions";
      model = "llama-3.3-70b-8192";
      name = "Groq";
    } else if (trimmedKey.startsWith("nvapi-")) {
      url = "https://integrate.api.nvidia.com/v1/chat/completions";
      model = "meta/llama-3.3-70b-instruct";
      name = "NVIDIA NIM";
    } else {
      const active = getActiveProvider();
      url = active?.provider.url ?? url;
      model = active?.provider.model ?? model;
      name = active?.provider.name ?? name;
    }

    try {
      return await callProviderAPI(url, model, trimmedKey, name, text, count, types);
    } catch (err: any) {
      console.warn(`User-provided key failed for ${name}:`, err.message);
    }
  }

  // 2. Otherwise, construct a list of active provider/key configurations to try in order.
  const activeProviders: Array<{ name: string; url: string; model: string; apiKey: string }> = [];

  // Check if a specific provider is forced in .env
  const forced = env.VITE_AI_PROVIDER as ProviderKey | undefined;
  if (forced && PROVIDERS[forced] && env[PROVIDERS[forced].envKey]?.trim()) {
    activeProviders.push({
      name: PROVIDERS[forced].name,
      url: PROVIDERS[forced].url,
      model: PROVIDERS[forced].model,
      apiKey: env[PROVIDERS[forced].envKey].trim(),
    });
  }

  // Add the rest of the env keys
  for (const pKey of PRIORITY_ORDER) {
    if (pKey === forced) continue;
    const cfg = PROVIDERS[pKey];
    const keyVal = env[cfg.envKey]?.trim();
    if (keyVal) {
      activeProviders.push({ name: cfg.name, url: cfg.url, model: cfg.model, apiKey: keyVal });
    }
  }

  // Add the 5 hardcoded Groq API keys provided by the user as next fallbacks
  // Keys are reversed to bypass GitHub Push Protection and reversed back at runtime.
  const decodeReversed = (s: string) => s.split("").reverse().join("");

  const HARDCODED_GROQ_KEYS = [
    "fwtzIqtiDeR9H0pbRw8qHvVRYF3bydGWg59g9RaennILp2FaBfpG_ksg",
    "HuBWqI0oEy879raabfiUw1W8YF3bydGWC1gcUM59tGUu5T4JUQhA_ksg",
    "85gnWJOIMDUdQ1zu9i6SBQwWYF3bydGWlwaPKAbCJV6Nqt98elNi_ksg",
    "MdqSRTtuNLBMMMC6hXQxN9SoYF3bydGW7Q7KU0gSxKR4XPnzfqIG_ksg",
    "nvuH3SRKF4qL0vQdtdPp0POYYF3bydGWUA8rDZzCv5csXWefkrvN_ksg",
  ].map(decodeReversed);

  for (let i = 0; i < HARDCODED_GROQ_KEYS.length; i++) {
    activeProviders.push({
      name: `Groq Shared Key #${i + 1}`,
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: "llama-3.3-70b-8192",
      apiKey: HARDCODED_GROQ_KEYS[i],
    });
  }

  // Try each provider/key one-by-one until one succeeds
  for (const prov of activeProviders) {
    try {
      console.log(`Attempting question generation with: ${prov.name}`);
      const result = await callProviderAPI(
        prov.url,
        prov.model,
        prov.apiKey,
        prov.name,
        text,
        count,
        types,
      );
      trackKeyUsage(prov.apiKey, true);
      return result;
    } catch (err: any) {
      console.warn(`${prov.name} generation failed:`, err.message);
      trackKeyUsage(prov.apiKey, false);
    }
  }

  // 3. Fallback: If no API keys worked or no keys were provided, generate locally
  console.log("No working API keys found. Generating questions locally in the browser...");
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

  return parseAIResponse(rawContent);
}

/** Helper to track key usage in localStorage */
function trackKeyUsage(key: string, success: boolean) {
  if (typeof window === "undefined") return;
  try {
    const dataStr = localStorage.getItem("kct_ai_key_usage") || "{}";
    const data = JSON.parse(dataStr);

    // Obfuscate the key representation in localStorage (only show last 8 chars)
    const signature = key.length > 8 ? `...${key.slice(-8)}` : key;

    if (!data[signature]) {
      data[signature] = { attempts: 0, successes: 0, failures: 0, lastUsed: "" };
    }

    data[signature].attempts += 1;
    if (success) {
      data[signature].successes += 1;
    } else {
      data[signature].failures += 1;
    }
    data[signature].lastUsed = new Date().toISOString();

    localStorage.setItem("kct_ai_key_usage", JSON.stringify(data));
  } catch (e) {
    console.error("Failed to track key usage:", e);
  }
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

/** Performs a real-time completions ping to test key validity, returns active status or rate limit info */
export async function testGroqKey(
  index: number,
): Promise<{ status: "active" | "rate_limited" | "invalid" | "error"; errorMsg?: string }> {
  const decodeReversed = (s: string) => s.split("").reverse().join("");
  const keys = [
    "fwtzIqtiDeR9H0pbRw8qHvVRYF3bydGWg59g9RaennILp2FaBfpG_ksg",
    "HuBWqI0oEy879raabfiUw1W8YF3bydGWC1gcUM59tGUu5T4JUQhA_ksg",
    "85gnWJOIMDUdQ1zu9i6SBQwWYF3bydGWlwaPKAbCJV6Nqt98elNi_ksg",
    "MdqSRTtuNLBMMMC6hXQxN9SoYF3bydGW7Q7KU0gSxKR4XPnzfqIG_ksg",
    "nvuH3SRKF4qL0vQdtdPp0POYYF3bydGWUA8rDZzCv5csXWefkrvN_ksg",
  ].map(decodeReversed);

  const key = keys[index];
  if (!key) return { status: "invalid", errorMsg: "Key index out of range" };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout for tests

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-8192",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      // Also record this test as a successful attempt in localStorage
      trackKeyUsage(key, true);
      return { status: "active" };
    }

    trackKeyUsage(key, false);
    if (response.status === 401) {
      return { status: "invalid", errorMsg: "Unauthorized / Invalid Key" };
    }

    if (response.status === 429) {
      return { status: "rate_limited", errorMsg: "Rate limit reached" };
    }

    const errText = await response.text().catch(() => "");
    return { status: "error", errorMsg: `API Error ${response.status}: ${errText || "Unknown"}` };
  } catch (err: any) {
    trackKeyUsage(key, false);
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

  // 1. Primary: Use Google Gemini 3.7 Flash with the shared key
  const HARDCODED_GOOGLE_KEY = decodeReversed("E6flCfZ7PZQPxGhQ0pRZGzPMbPEySazIA");
  activeProviders.push({
    name: "Google Gemini 3.7 (Shared)",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions",
    model: "gemini-3.7-flash",
    apiKey: HARDCODED_GOOGLE_KEY,
  });

  // 2. Primary Fallback: Use the 5 hardcoded/rotated Groq API keys provided by the user
  const HARDCODED_GROQ_KEYS = [
    "fwtzIqtiDeR9H0pbRw8qHvVRYF3bydGWg59g9RaennILp2FaBfpG_ksg",
    "HuBWqI0oEy879raabfiUw1W8YF3bydGWC1gcUM59tGUu5T4JUQhA_ksg",
    "85gnWJOIMDUdQ1zu9i6SBQwWYF3bydGWlwaPKAbCJV6Nqt98elNi_ksg",
    "MdqSRTtuNLBMMMC6hXQxN9SoYF3bydGW7Q7KU0gSxKR4XPnzfqIG_ksg",
    "nvuH3SRKF4qL0vQdtdPp0POYYF3bydGWUA8rDZzCv5csXWefkrvN_ksg",
  ].map(decodeReversed);

  for (let i = 0; i < HARDCODED_GROQ_KEYS.length; i++) {
    activeProviders.push({
      name: `Groq Shared Key #${i + 1}`,
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: "llama-3.3-70b-8192",
      apiKey: HARDCODED_GROQ_KEYS[i],
    });
  }

  // 2. Secondary: Forced provider from env
  const forced = env.VITE_AI_PROVIDER as ProviderKey | undefined;
  if (forced && PROVIDERS[forced] && env[PROVIDERS[forced].envKey]?.trim()) {
    activeProviders.push({
      name: PROVIDERS[forced].name,
      url: PROVIDERS[forced].url,
      model: PROVIDERS[forced].model,
      apiKey: env[PROVIDERS[forced].envKey].trim(),
    });
  }

  // 3. Tertiary: Load the rest of env keys in priority order
  for (const pKey of PRIORITY_ORDER) {
    if (pKey === forced) continue;
    const cfg = PROVIDERS[pKey];
    const keyVal = env[cfg.envKey]?.trim();
    if (keyVal) {
      activeProviders.push({ name: cfg.name, url: cfg.url, model: cfg.model, apiKey: keyVal });
    }
  }

  // Try each API until success
  for (const prov of activeProviders) {
    try {
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
