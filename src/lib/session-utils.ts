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