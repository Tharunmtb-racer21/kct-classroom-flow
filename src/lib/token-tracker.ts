/**
 * token-tracker.ts
 * Enterprise Token Tracking & Analytics Engine for KCT PULSE.
 * Monitors prompt tokens, completion tokens, total token throughput,
 * latencies, provider allocations, and estimated cost savings across
 * all AI providers (Google Gemini, Groq, NVIDIA NIM, Together AI).
 */

export type AIProvider = "gemini" | "groq" | "nvidia" | "together" | "local" | "other";

export interface TokenUsageRecord {
  id: string;
  timestamp: string;
  provider: AIProvider;
  model: string;
  keySignature: string;
  feature: "question_generation" | "chatbot" | "diagnostic_test" | "other";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  estimatedCostUsd: number;
}

export interface ProviderTokenMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  costUsd: number;
  modelsUsed: string[];
}

export interface KeyTokenMetrics {
  signature: string;
  provider: AIProvider;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  successes: number;
  failures: number;
  lastUsed: string;
}

export interface DailyTokenMetrics {
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
}

export interface TokenSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalCostUsd: number;
  byProvider: Record<AIProvider, ProviderTokenMetrics>;
  byKey: Record<string, KeyTokenMetrics>;
  dailyUsage: Record<string, DailyTokenMetrics>;
}

const STORAGE_KEY_LOGS = "kct_ai_token_logs";
const STORAGE_KEY_SUMMARY = "kct_ai_token_summary";
const MAX_LOGS_LIMIT = 1000;

// Pricing benchmarks per 1,000,000 tokens (USD)
const PRICING_RATES: Record<string, { promptPerM: number; completionPerM: number }> = {
  "gemini-2.5-flash": { promptPerM: 0.075, completionPerM: 0.3 },
  "gemini-2.0-flash": { promptPerM: 0.075, completionPerM: 0.3 },
  "gemini-1.5-flash": { promptPerM: 0.075, completionPerM: 0.3 },
  "llama-3.3-70b-8192": { promptPerM: 0.59, completionPerM: 0.79 },
  "groq/compound": { promptPerM: 0.59, completionPerM: 0.79 },
  "meta/llama-3.3-70b-instruct": { promptPerM: 0.7, completionPerM: 0.8 },
  "meta-llama/Llama-3.3-70B-Instruct-Turbo": { promptPerM: 0.88, completionPerM: 0.88 },
  default: { promptPerM: 0.2, completionPerM: 0.4 },
};

/**
 * Calculates estimated commercial cost in USD for the token usage.
 */
export function calculateEstimatedCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = PRICING_RATES[model] || PRICING_RATES.default;
  const promptCost = (promptTokens / 1_000_000) * pricing.promptPerM;
  const completionCost = (completionTokens / 1_000_000) * pricing.completionPerM;
  return Number((promptCost + completionCost).toFixed(6));
}

/**
 * Approximate token count fallback if API response omitted usage metadata.
 * Uses 4 characters per token heuristic for English text.
 */
export function estimateTokenCount(textOrPayload: unknown): number {
  if (!textOrPayload) return 0;
  try {
    const raw = typeof textOrPayload === "string" ? textOrPayload : JSON.stringify(textOrPayload);
    return Math.max(1, Math.round(raw.length / 4));
  } catch {
    return 1;
  }
}

/**
 * Normalize provider name
 */
export function normalizeProvider(providerStr: string): AIProvider {
  const p = (providerStr || "").toLowerCase();
  if (p.includes("gemini") || p.includes("google")) return "gemini";
  if (p.includes("groq")) return "groq";
  if (p.includes("nvidia")) return "nvidia";
  if (p.includes("together")) return "together";
  if (p.includes("local")) return "local";
  return "other";
}

const DEFAULT_SUMMARY: TokenSummary = {
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalCostUsd: 0,
  byProvider: {
    gemini: { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, costUsd: 0, modelsUsed: [] },
    groq: { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, costUsd: 0, modelsUsed: [] },
    nvidia: { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, costUsd: 0, modelsUsed: [] },
    together: { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, costUsd: 0, modelsUsed: [] },
    local: { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, costUsd: 0, modelsUsed: [] },
    other: { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, costUsd: 0, modelsUsed: [] },
  },
  byKey: {},
  dailyUsage: {},
};

/**
 * Get current token summary
 */
export function getTokenSummary(): TokenSummary {
  if (typeof window === "undefined") return DEFAULT_SUMMARY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SUMMARY);
    if (!raw) return DEFAULT_SUMMARY;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SUMMARY,
      ...parsed,
      byProvider: {
        ...DEFAULT_SUMMARY.byProvider,
        ...(parsed.byProvider || {}),
      },
    };
  } catch {
    return DEFAULT_SUMMARY;
  }
}

/**
 * Get recent token logs
 */
export function getTokenLogs(): TokenUsageRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOGS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Record a token usage event across any AI call
 */
export function recordTokenUsage(params: {
  provider: string;
  model: string;
  keySignature?: string;
  feature: "question_generation" | "chatbot" | "diagnostic_test" | "other";
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  success?: boolean;
  errorMessage?: string;
}): TokenUsageRecord {
  const normProvider = normalizeProvider(params.provider);
  const promptTokens = Math.max(0, Math.round(params.promptTokens ?? 0));
  const completionTokens = Math.max(0, Math.round(params.completionTokens ?? 0));
  const totalTokens = Math.max(promptTokens + completionTokens, Math.round(params.totalTokens ?? (promptTokens + completionTokens)));
  const latencyMs = Math.max(0, Math.round(params.latencyMs ?? 0));
  const success = params.success !== false;
  const keySig = params.keySignature || `${normProvider}_default`;
  const cost = calculateEstimatedCost(params.model, promptTokens, completionTokens);
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];

  const record: TokenUsageRecord = {
    id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.toISOString(),
    provider: normProvider,
    model: params.model,
    keySignature: keySig,
    feature: params.feature,
    promptTokens,
    completionTokens,
    totalTokens,
    latencyMs,
    success,
    errorMessage: params.errorMessage,
    estimatedCostUsd: cost,
  };

  if (typeof window !== "undefined") {
    try {
      // 1. Update historical logs
      const existingLogs = getTokenLogs();
      existingLogs.unshift(record);
      if (existingLogs.length > MAX_LOGS_LIMIT) {
        existingLogs.length = MAX_LOGS_LIMIT;
      }
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(existingLogs));

      // 2. Update aggregated summary
      const summary = getTokenSummary();
      summary.totalPromptTokens += promptTokens;
      summary.totalCompletionTokens += completionTokens;
      summary.totalTokens += totalTokens;
      summary.totalRequests += 1;
      if (success) {
        summary.successfulRequests += 1;
      } else {
        summary.failedRequests += 1;
      }
      summary.totalCostUsd = Number((summary.totalCostUsd + cost).toFixed(6));

      // Provider breakdown
      if (!summary.byProvider[normProvider]) {
        summary.byProvider[normProvider] = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          requests: 0,
          costUsd: 0,
          modelsUsed: [],
        };
      }
      const pStats = summary.byProvider[normProvider];
      pStats.promptTokens += promptTokens;
      pStats.completionTokens += completionTokens;
      pStats.totalTokens += totalTokens;
      pStats.requests += 1;
      pStats.costUsd = Number((pStats.costUsd + cost).toFixed(6));
      if (!pStats.modelsUsed.includes(params.model)) {
        pStats.modelsUsed.push(params.model);
      }

      // Key breakdown
      if (!summary.byKey[keySig]) {
        summary.byKey[keySig] = {
          signature: keySig,
          provider: normProvider,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          requests: 0,
          successes: 0,
          failures: 0,
          lastUsed: record.timestamp,
        };
      }
      const kStats = summary.byKey[keySig];
      kStats.promptTokens += promptTokens;
      kStats.completionTokens += completionTokens;
      kStats.totalTokens += totalTokens;
      kStats.requests += 1;
      if (success) {
        kStats.successes += 1;
      } else {
        kStats.failures += 1;
      }
      kStats.lastUsed = record.timestamp;

      // Daily usage
      if (!summary.dailyUsage[dateStr]) {
        summary.dailyUsage[dateStr] = {
          date: dateStr,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          requests: 0,
        };
      }
      const dStats = summary.dailyUsage[dateStr];
      dStats.promptTokens += promptTokens;
      dStats.completionTokens += completionTokens;
      dStats.totalTokens += totalTokens;
      dStats.requests += 1;

      localStorage.setItem(STORAGE_KEY_SUMMARY, JSON.stringify(summary));

      // Dispatch event for reactive listeners
      window.dispatchEvent(new CustomEvent("kct_token_usage_updated", { detail: record }));
    } catch (err) {
      console.error("Failed to store token usage:", err);
    }
  }

  return record;
}

/**
 * Clear token history and counters
 */
export function clearTokenHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY_LOGS);
  localStorage.removeItem(STORAGE_KEY_SUMMARY);
  window.dispatchEvent(new CustomEvent("kct_token_usage_updated", { detail: null }));
}

/**
 * Exports token logs to CSV formatted string
 */
export function exportTokenLogsCSV(): string {
  const logs = getTokenLogs();
  const headers = [
    "Timestamp",
    "Provider",
    "Model",
    "Key Signature",
    "Feature",
    "Prompt Tokens",
    "Completion Tokens",
    "Total Tokens",
    "Latency (ms)",
    "Success",
    "Est. Cost (USD)",
  ];

  const rows = logs.map((l) => [
    l.timestamp,
    l.provider,
    l.model,
    `"${l.keySignature}"`,
    l.feature,
    l.promptTokens,
    l.completionTokens,
    l.totalTokens,
    l.latencyMs,
    l.success ? "YES" : "NO",
    l.estimatedCostUsd.toFixed(6),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/**
 * Triggers client download of CSV token report
 */
export function downloadTokenReportCSV(): void {
  const csv = exportTokenLogsCSV();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `kct_pulse_token_telemetry_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers client download of JSON token report
 */
export function downloadTokenReportJSON(): void {
  const summary = getTokenSummary();
  const logs = getTokenLogs();
  const data = {
    exportedAt: new Date().toISOString(),
    summary,
    recentLogs: logs,
  };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `kct_pulse_token_telemetry_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
