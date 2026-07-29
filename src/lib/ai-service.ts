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
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.0-flash",
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

  const allowedTypesDesc = types
    .map((t) => `- ${typeDescriptions[t]}`)
    .join("\n");

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
    throw new Error(
      "AI returned an unexpected format. Please try again."
    );
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
      const type: QType = ["quiz", "poll", "wordcloud"].includes(q.type)
        ? q.type
        : "poll";
      const options: string[] = Array.isArray(q.options)
        ? q.options.filter((o: any) => typeof o === "string" && o.trim())
        : [];
      const correct_answer =
        type === "quiz" && typeof q.correct_answer === "string"
          ? q.correct_answer
          : null;

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
 * Automatically uses the active AI provider configured in .env.
 * Falls back through providers in priority order if needed.
 * Throws a user-friendly error on failure.
 */
export async function generateQuestionsFromText(
  opts: GenerateQuestionsOptions
): Promise<GeneratedQuestion[]> {
  const { text, count, types, apiKey } = opts;

  // Resolve which provider + URL + model to use
  const active = getActiveProvider();
  const env = (import.meta as any).env ?? {};

  // apiKey passed in takes priority (user typed it in UI),
  // otherwise fall back to env-detected provider
  const resolvedKey = apiKey?.trim() || (active ? env[active.provider.envKey] : "");
  const resolvedUrl = active?.provider.url ?? "https://integrate.api.nvidia.com/v1/chat/completions";
  const resolvedModel = active?.provider.model ?? "meta/llama-3.3-70b-instruct";
  const providerName = active?.provider.name ?? "AI";

  if (!resolvedKey) {
    throw new Error(
      "No API key found. Please add at least one API key in your .env file (VITE_NVIDIA_API_KEY, VITE_GROQ_API_KEY, etc.)"
    );
  }

  const prompt = buildPrompt(text, count, types);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000); // 45s timeout

  let response: Response;
  try {
    response = await fetch(resolvedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolvedKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
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
      throw new Error(
        `Request timed out (45s). ${providerName} is busy — please try again.`
      );
    }
    throw new Error(
      "Network error. Please check your connection and try again."
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error(
        `Invalid API key for ${providerName}. Please check your key in .env.`
      );
    }
    if (response.status === 429) {
      throw new Error(
        `Rate limit reached on ${providerName}. Switch to a backup provider in .env (set VITE_AI_PROVIDER).`
      );
    }
    throw new Error(
      `${providerName} API error (${response.status}): ${errorText || "Unknown error"}`
    );
  }

  const data = await response.json();
  const rawContent: string = data?.choices?.[0]?.message?.content ?? "";

  if (!rawContent) {
    throw new Error(`${providerName} returned an empty response. Please try again.`);
  }

  return parseAIResponse(rawContent);
}

