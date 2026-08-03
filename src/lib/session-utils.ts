export function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // Use cryptographically secure random values — Math.random() only gives 32k
  // combinations with 3 chars, which is brute-forceable. 5 chars = ~33M combinations.
  const randomBytes = new Uint8Array(5);
  crypto.getRandomValues(randomBytes);
  let out = "KCT";
  for (let i = 0; i < 5; i++) {
    out += chars[randomBytes[i] % chars.length];
  }
  return out;
}

/**
 * Resolves the public base URL for student-facing join links & QR codes.
 *
 * Priority order:
 *   1. VITE_PUBLIC_APP_URL  — explicit override (set in .env or Vercel dashboard)
 *   2. VERCEL_PROJECT_PRODUCTION_URL — auto-set by Vercel on every deployment
 *   3. VERCEL_URL — the unique preview/deployment URL Vercel provides
 *   4. window.location.origin — fallback for local dev
 *
 * All Vercel env vars are exposed at build time via the VITE_ prefix trick
 * handled in vite.config.ts or .env.
 */
function getPublicBaseUrl(): string {
  const env = (import.meta as any).env ?? {};

  // 1. Explicit override — highest priority
  if (env.VITE_PUBLIC_APP_URL) {
    return env.VITE_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  // 2. Vercel auto-provided production URL
  if (env.VITE_VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VITE_VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  // 3. Vercel auto-provided deployment URL (preview deploys etc.)
  if (env.VITE_VERCEL_URL) {
    return `https://${env.VITE_VERCEL_URL}`;
  }

  // 4. Fallback — current browser origin (works for local dev)
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

export function joinUrl(code: string): string {
  return `${getPublicBaseUrl()}/join/${code}`;
}

/**
 * Returns true when we DON'T have a usable public URL — meaning the QR code
 * would point to localhost or a Lovable editor preview that requires auth.
 * Used to show the amber warning banner.
 */
export function isPrivatePreviewHost(): boolean {
  if (typeof window === "undefined") return false;

  // If an explicit public URL is configured, the QR is fine — no warning needed
  const env = (import.meta as any).env ?? {};
  if (env.VITE_PUBLIC_APP_URL || env.VITE_VERCEL_PROJECT_PRODUCTION_URL || env.VITE_VERCEL_URL) {
    return false;
  }

  const h = window.location.hostname;
  return (
    /(^|\.)id-preview--/.test(h) ||
    h.includes("lovableproject.com") ||
    h === "localhost" ||
    h === "127.0.0.1"
  );
}

import { supabase } from "@/integrations/supabase/client";

/**
 * Checks all live sessions in Supabase and automatically updates any
 * session that has been active for more than 1 hour (or past its expires_at)
 * back to "draft" mode.
 */
export async function autoDraftStaleSessions() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).getTime();
    const now = Date.now();

    const { data: liveSessions, error } = await supabase
      .from("sessions")
      .select("id, created_at, expires_at")
      .eq("status", "live");

    if (error || !liveSessions || liveSessions.length === 0) return;

    const idsToDraft: string[] = [];

    liveSessions.forEach((s: any) => {
      const isExpired = s.expires_at ? new Date(s.expires_at).getTime() <= now : false;
      const isOlderThan1Hour = s.created_at ? new Date(s.created_at).getTime() <= oneHourAgo : false;

      if (isExpired || isOlderThan1Hour) {
        idsToDraft.push(s.id);
      }
    });

    if (idsToDraft.length > 0) {
      await supabase
        .from("sessions")
        .update({ status: "draft", expires_at: null, current_question_id: null })
        .in("id", idsToDraft);

      console.log(`⚡ Auto-demoted ${idsToDraft.length} stale live session(s) active > 1 hour back to draft mode.`);
    }
  } catch (err) {
    console.error("Error in autoDraftStaleSessions:", err);
  }
}

/**
 * Purges empty draft sessions with 0 questions and 0 participants.
 */
export async function purgeEmptyTestSessions(): Promise<number> {
  try {
    const { data: count, error } = await (supabase.rpc as any)("purge_empty_draft_sessions");
    if (!error && typeof count === "number") {
      console.log(`⚡ Purged ${count} empty draft test session(s).`);
      return count;
    }
    // Fallback client-side purging
    const { data: drafts } = await supabase
      .from("sessions")
      .select("id, questions(id), participants(id)")
      .eq("status", "draft");

    if (!drafts || drafts.length === 0) return 0;

    const emptyIds = drafts
      .filter((d: any) => (!d.questions || d.questions.length === 0) && (!d.participants || d.participants.length === 0))
      .map((d: any) => d.id);

    if (emptyIds.length > 0) {
      await supabase.from("sessions").delete().in("id", emptyIds);
      console.log(`⚡ Purged ${emptyIds.length} empty draft test session(s).`);
      return emptyIds.length;
    }
    return 0;
  } catch (err) {
    console.error("Error in purgeEmptyTestSessions:", err);
    return 0;
  }
}