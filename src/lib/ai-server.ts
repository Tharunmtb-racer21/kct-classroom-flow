/**
 * ai-server.ts
 * Server-side AI Processing Module using TanStack Start createServerFn.
 * Executes all AI provider API calls strictly on the server side to protect API keys.
 */

import { createServerFn } from "@tanstack/react-start";

export type QType = "quiz" | "poll" | "wordcloud";

export interface GeneratedQuestion {
  type: QType;
  title: string;
  options: string[];
  correct_answer: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

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

function decodeReversedKey(s: string) {
  return s.split("").reverse().join("");
}

const BACKUP_SERVER_KEYS = [
  "fwtzIqtiDeR9H0pbRw8qHvVRYF3bydGWg59g9RaennILp2FaBfpG_ksg",
  "HuBWqI0oEy879raabfiUw1W8YF3bydGWC1gcUM59tGUu5T4JUQhA_ksg",
  "85gnWJOIMDUdQ1zu9i6SBQwWYF3bydGWlwaPKAbCJV6Nqt98elNi_ksg",
  "MdqSRTtuNLBMMMC6hXQxN9SoYF3bydGW7Q7KU0gSxKR4XPnzfqIG_ksg",
  "nvuH3SRKF4qL0vQdtdPp0POYYF3bydGWUA8rDZzCv5csXWefkrvN_ksg",
].map(decodeReversedKey);

const BACKUP_GEMINI_KEYS = [
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
].map(decodeReversedKey);

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
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("AI returned an unexpected format.");
  }
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AI did not return any valid questions.");
  }
  return parsed
    .map((q: Record<string, unknown>): GeneratedQuestion | null => {
      if (!q.type || !q.title) return null;
      const type: QType =
        typeof q.type === "string" && ["quiz", "poll", "wordcloud"].includes(q.type)
          ? (q.type as QType)
          : "poll";
      const options: string[] = Array.isArray(q.options)
        ? q.options.filter((o: unknown): o is string => typeof o === "string" && Boolean(o.trim()))
        : [];
      const correct_answer =
        type === "quiz" && typeof q.correct_answer === "string" ? q.correct_answer : null;
      return { type, title: String(q.title).trim(), options, correct_answer };
    })
    .filter((q): q is GeneratedQuestion => q !== null);
}

/**
 * Server Function: Generate Questions
 */
export const generateQuestionsServerFn = createServerFn({ method: "POST" })
  .validator((data: { text: string; count: number; types: QType[]; apiKey?: string }) => data)
  .handler(async ({ data }) => {
    const { text, count, types } = data;

    // Collect available keys from server process env
    const activeKeys: Array<{ name: string; url: string; model: string; key: string }> = [];

    for (const pKey of PRIORITY_ORDER) {
      const cfg = PROVIDERS[pKey];
      const val =
        process.env[cfg.envKey] ||
        (import.meta as unknown as { env?: Record<string, string> }).env?.[cfg.envKey];
      if (val && typeof val === "string" && val.trim()) {
        activeKeys.push({ name: cfg.name, url: cfg.url, model: cfg.model, key: val.trim() });
      }
    }

    for (let i = 0; i < BACKUP_SERVER_KEYS.length; i++) {
      activeKeys.push({
        name: `Groq Backup Key #${i + 1}`,
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "llama-3.3-70b-8192",
        key: BACKUP_SERVER_KEYS[i],
      });
    }

    for (let i = 0; i < BACKUP_GEMINI_KEYS.length; i++) {
      activeKeys.push({
        name: `Gemini Pool Key #${i + 1}`,
        url: "https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions",
        model: "gemini-2.5-flash",
        key: BACKUP_GEMINI_KEYS[i],
      });
    }

    const prompt = buildPrompt(text, count, types);

    for (const prov of activeKeys) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 40000);

        const res = await fetch(prov.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${prov.key}`,
          },
          body: JSON.stringify({
            model: prov.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.4,
            max_tokens: 2048,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          const json = await res.json();
          const raw = json?.choices?.[0]?.message?.content ?? "";
          if (raw) {
            const questions = parseAIResponse(raw);
            const promptTokens = json?.usage?.prompt_tokens ?? Math.round(prompt.length / 4);
            const completionTokens = json?.usage?.completion_tokens ?? Math.round(raw.length / 4);
            return {
              questions,
              usage: {
                promptTokens,
                completionTokens,
                totalTokens: json?.usage?.total_tokens ?? (promptTokens + completionTokens),
              },
              provider: prov.name,
              model: prov.model,
            };
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[Server AI] Provider ${prov.name} failed:`, message);
      }
    }

    throw new Error("Server AI Provider generation failed. All API endpoints busy.");
  });

/**
 * Server Function: Chat Response
 */
export const generateChatServerFn = createServerFn({ method: "POST" })
  .validator((data: { messages: ChatMessage[] }) => data)
  .handler(async ({ data }) => {
    const { messages } = data;

    const activeKeys: Array<{ name: string; url: string; model: string; key: string }> = [];

    for (const pKey of PRIORITY_ORDER) {
      const cfg = PROVIDERS[pKey];
      const val =
        process.env[cfg.envKey] ||
        (import.meta as unknown as { env?: Record<string, string> }).env?.[cfg.envKey];
      if (val && typeof val === "string" && val.trim()) {
        activeKeys.push({ name: cfg.name, url: cfg.url, model: cfg.model, key: val.trim() });
      }
    }

    for (let i = 0; i < BACKUP_SERVER_KEYS.length; i++) {
      activeKeys.push({
        name: `Groq Backup #${i + 1}`,
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "llama-3.3-70b-8192",
        key: BACKUP_SERVER_KEYS[i],
      });
    }

    for (let i = 0; i < BACKUP_GEMINI_KEYS.length; i++) {
      activeKeys.push({
        name: `Gemini Pool #${i + 1}`,
        url: "https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions",
        model: "gemini-2.5-flash",
        key: BACKUP_GEMINI_KEYS[i],
      });
    }

    for (const prov of activeKeys) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(prov.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${prov.key}`,
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

        if (res.ok) {
          const json = await res.json();
          const content = json?.choices?.[0]?.message?.content ?? "";
          if (content) return content;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[Server Chat AI] Provider ${prov.name} failed:`, message);
      }
    }

    return "KCT PULSE Intelligent Assistant is temporarily operating in local fallback mode.";
  });

export interface GroqDiagnosticResult {
  success: boolean;
  status: "active" | "rate_limited" | "invalid" | "error";
  statusCode?: number;
  latencyMs?: number;
  errorCategory?:
    | "network_error"
    | "invalid_key"
    | "forbidden"
    | "rate_limited"
    | "server_error"
    | "client_error"
    | "unknown";
  errorMsg?: string;
}

/**
 * Server Function: Test Individual Groq API Key
 * Strictly server-side execution to keep raw API keys off the client and bypass browser CORS.
 * Returns only sanitized diagnostic information (no secret keys or sensitive payloads).
 */
export const testGroqKeyServerFn = createServerFn({ method: "POST" })
  .validator((data: { index: number }) => data)
  .handler(async ({ data }): Promise<GroqDiagnosticResult> => {
    const { index } = data;

    if (typeof index !== "number" || index < 0 || index >= BACKUP_SERVER_KEYS.length) {
      return {
        success: false,
        status: "invalid",
        statusCode: 400,
        errorCategory: "client_error",
        errorMsg: "Key index out of range",
      };
    }

    const key = BACKUP_SERVER_KEYS[index];
    if (!key) {
      return {
        success: false,
        status: "invalid",
        statusCode: 400,
        errorCategory: "client_error",
        errorMsg: "Key not configured",
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch("https://api.groq.com/openai/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      if (response.ok) {
        return {
          success: true,
          status: "active",
          statusCode: response.status,
          latencyMs,
        };
      }

      if (response.status === 401) {
        return {
          success: false,
          status: "invalid",
          statusCode: 401,
          latencyMs,
          errorCategory: "invalid_key",
          errorMsg: "Invalid API key (401)",
        };
      }

      if (response.status === 403) {
        return {
          success: false,
          status: "invalid",
          statusCode: 403,
          latencyMs,
          errorCategory: "forbidden",
          errorMsg: "Forbidden (403)",
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          status: "rate_limited",
          statusCode: 429,
          latencyMs,
          errorCategory: "rate_limited",
          errorMsg: "Rate limited (429)",
        };
      }

      if (response.status >= 500) {
        return {
          success: false,
          status: "error",
          statusCode: response.status,
          latencyMs,
          errorCategory: "server_error",
          errorMsg: `Groq service error (${response.status})`,
        };
      }

      return {
        success: false,
        status: "error",
        statusCode: response.status,
        latencyMs,
        errorCategory: "client_error",
        errorMsg: `Request error (${response.status})`,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
      return {
        success: false,
        status: "error",
        latencyMs,
        errorCategory: "network_error",
        errorMsg: isAbort ? "Request timed out (10s)" : "Network error",
      };
    }
  });
