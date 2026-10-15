/**
 * feedback-handler.server.ts
 * Server-only handler for KCT PULSE feedback submissions.
 *
 * Security architecture:
 * 1. Validates the complete feedback payload on the server (name, email, subject, message, honeypot).
 * 2. Enforces server-side rate limiting: 5 submissions per 10 minutes per client identity.
 * 3. Extracts client IP securely: trusts edge-verified `x-real-ip` / `x-vercel-ip` or rightmost
 *    proxy hops in `x-forwarded-for` to prevent client IP header spoofing.
 * 4. Inserts sanitized feedback into Supabase `contact_messages` table.
 * 5. Dispatches notification to Web3Forms using the server-only `WEB3FORMS_ACCESS_KEY`
 *    with a bounded timeout and non-fatal fallback.
 *
 * NOTE ON SERVERLESS RATE LIMITING:
 * The in-memory sliding-window rate limiter bounds abuse per serverless container instance.
 * Because serverless functions execute across ephemeral, autoscaling worker instances without
 * shared memory, in-memory limits are per-instance rather than globally synchronized.
 */

import { validateFeedbackPayload } from "./feedback-validator";
import { supabase } from "@/integrations/supabase/client";

export interface FeedbackSubmissionInput {
  name: string;
  email: string;
  subject?: string;
  message: string;
  honeypot?: string;
}

export interface FeedbackSubmissionOutput {
  success: boolean;
  delivered: boolean;
  message: string;
}

export class FeedbackSubmissionError extends Error {
  readonly status: number;
  readonly fieldErrors?: { name?: string; email?: string; message?: string };

  constructor(
    status: number,
    message: string,
    fieldErrors?: { name?: string; email?: string; message?: string },
  ) {
    super(message);
    this.name = "FeedbackSubmissionError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

// ─── IP Address Resolution & Anti-Spoofing ──────────────────────────────────

function isValidIpFormat(ip: string): boolean {
  // IPv4 format validation
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    const octets = ip.split(".").map(Number);
    return octets.every((o) => o >= 0 && o <= 255);
  }
  // IPv6 format validation
  if (/^[a-fA-F0-9:]{2,39}$/.test(ip) && ip.includes(":")) {
    return true;
  }
  return false;
}

/**
 * Resolves a trustworthy client identity string for rate limiting.
 *
 * Security Considerations:
 * - On reverse proxies (such as Vercel Edge), `x-real-ip` and `x-vercel-ip` are injected
 *   by the edge proxy and cannot be spoofed by incoming client request headers.
 * - `x-forwarded-for` can contain client-forged prefixes (e.g. `X-Forwarded-For: 1.1.1.1`).
 *   If x-real-ip is absent, we inspect x-forwarded-for from right to left: the rightmost
 *   entry is the one appended by the immediate trusted ingress proxy.
 */
export function resolveClientIp(headers: {
  get: (name: string) => string | null | undefined;
}): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && isValidIpFormat(realIp)) {
    return realIp;
  }

  const vercelIp = headers.get("x-vercel-ip")?.trim();
  if (vercelIp && isValidIpFormat(vercelIp)) {
    return vercelIp;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((s) => s.trim());
    for (let i = parts.length - 1; i >= 0; i--) {
      if (isValidIpFormat(parts[i])) {
        return parts[i];
      }
    }
  }

  return "127.0.0.1";
}

// ─── Rate Limiter (5 per 10 minutes) ─────────────────────────────────────────

export const FEEDBACK_RATE_LIMIT = 5;
export const FEEDBACK_RATE_WINDOW_MS = 10 * 60_000; // 10 minutes

export class FeedbackRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number = FEEDBACK_RATE_LIMIT,
    readonly windowMs: number = FEEDBACK_RATE_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  check(identifier: string): boolean {
    const current = this.now();
    const recent = (this.hits.get(identifier) ?? []).filter((t) => current - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(identifier, recent);
      return false;
    }
    recent.push(current);
    this.hits.set(identifier, recent);
    if (this.hits.size > 2000) this.prune(current);
    return true;
  }

  private prune(current: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => current - t >= this.windowMs)) {
        this.hits.delete(key);
      }
    }
  }

  reset(): void {
    this.hits.clear();
  }
}

export const defaultFeedbackRateLimiter = new FeedbackRateLimiter();

// ─── Web3Forms Notification Delivery ────────────────────────────────────────

const WEB3FORMS_TIMEOUT_MS = 8000;

export async function sendWeb3FormsNotification(
  apiKey: string,
  data: { name: string; email: string; subject: string; message: string },
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEB3FORMS_TIMEOUT_MS);

  try {
    const res = await fetchFn("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: apiKey,
        name: data.name,
        email: data.email,
        subject: `[KCT PULSE Contact] ${data.subject} - from ${data.name}`,
        message: data.message,
        replyto: data.email,
        from_name: "KCT PULSE Feedback System",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errSnippet = await res.text().catch(() => "Unknown error");
      console.warn(`[Feedback] Web3Forms HTTP ${res.status}: ${errSnippet.slice(0, 100)}`);
      return false;
    }

    return true;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.warn(
      `[Feedback] Web3Forms notification failed (${isTimeout ? "timeout" : "network error"})`,
    );
    return false;
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────

export interface FeedbackHandlerDependencies {
  rateLimiter?: FeedbackRateLimiter;
  dbInsert?: (record: {
    name: string;
    email: string;
    subject: string;
    message: string;
    user_id: string | null;
    status: string;
  }) => Promise<{ error: { message: string } | null }>;
  fetchFn?: typeof fetch;
  getEnvKey?: () => string | undefined;
}

export async function handleFeedbackSubmission(
  input: FeedbackSubmissionInput,
  headers: { get: (name: string) => string | null | undefined },
  deps: FeedbackHandlerDependencies = {},
): Promise<FeedbackSubmissionOutput> {
  // 1. Honeypot entrapment — bots that populate hidden honeypots receive fake success
  if (input.honeypot && input.honeypot.trim().length > 0) {
    return {
      success: true,
      delivered: false,
      message: "Feedback submitted successfully.",
    };
  }

  // 2. Client Identity Resolution & Rate Limiting (5 requests per 10 minutes)
  const clientIp = resolveClientIp(headers);
  const limiter = deps.rateLimiter ?? defaultFeedbackRateLimiter;

  if (!limiter.check(clientIp)) {
    throw new FeedbackSubmissionError(
      429,
      "Too many feedback submissions. Please wait a few minutes before submitting again.",
    );
  }

  // 3. Complete Server-Side Input Validation
  const subject = (input.subject || "General Feedback").trim().slice(0, 100);

  const validationResult = validateFeedbackPayload({
    name: input.name ?? "",
    email: input.email ?? "",
    message: input.message ?? "",
  });

  if (!validationResult.ok) {
    const primaryError =
      validationResult.errors.name ??
      validationResult.errors.email ??
      validationResult.errors.message ??
      "Validation failed.";
    throw new FeedbackSubmissionError(400, primaryError, validationResult.errors);
  }

  const safeName = validationResult.normalisedName!;
  const safeEmail = validationResult.normalisedEmail!;
  const safeMessage = validationResult.normalisedMessage!;

  // 4. Resolve authenticated user ID if bearer token was provided
  let callerUserId: string | null = null;
  const authHeader = headers.get("authorization") || headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const {
        createGoogleJwksProvider,
        extractBearerToken,
        resolveFirebaseProjectId,
        verifyFirebaseIdToken,
      } = await import("./firebase-token.server");
      const token = extractBearerToken(authHeader);
      if (token) {
        const env = process.env as Record<string, string | undefined>;
        const identity = await verifyFirebaseIdToken(token, {
          projectId: resolveFirebaseProjectId(env),
          getKeys: createGoogleJwksProvider(deps.fetchFn ?? fetch),
        });
        callerUserId = identity.uid;
      }
    } catch {
      // Unauthenticated or expired token — proceed with null user_id (anonymous feedback is permitted by RLS)
      callerUserId = null;
    }
  }

  // 5. Persist to Database (Supabase contact_messages table)
  const recordToInsert = {
    name: safeName,
    email: safeEmail,
    subject,
    message: safeMessage,
    user_id: callerUserId,
    status: "unread",
  };

  if (deps.dbInsert) {
    const dbRes = await deps.dbInsert(recordToInsert);
    if (dbRes.error) {
      console.error("[Feedback] Database persistence failed:", dbRes.error.message);
      throw new FeedbackSubmissionError(500, "Failed to save message. Please try again.");
    }
  } else {
    const { error: dbError } = await supabase.from("contact_messages").insert(recordToInsert);
    if (dbError) {
      console.error("[Feedback] Database persistence failed:", dbError.message);
      throw new FeedbackSubmissionError(500, "Failed to save message. Please try again.");
    }
  }

  // 6. Invoke Web3Forms Notification Provider (Server-Side Only)
  const web3FormsKey = deps.getEnvKey ? deps.getEnvKey() : process.env.WEB3FORMS_ACCESS_KEY;

  let delivered = false;

  if (web3FormsKey && web3FormsKey.trim().length > 0) {
    delivered = await sendWeb3FormsNotification(
      web3FormsKey.trim(),
      {
        name: safeName,
        email: safeEmail,
        subject,
        message: safeMessage,
      },
      deps.fetchFn,
    );
  } else {
    console.warn(
      "[Feedback] WEB3FORMS_ACCESS_KEY is not configured in server environment variables. Message saved to database only.",
    );
  }

  return {
    success: true,
    delivered,
    message: "Feedback submitted successfully.",
  };
}
