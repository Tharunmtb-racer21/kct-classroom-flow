/**
 * firebase-token.server.ts
 * Server-only verification of Firebase ID tokens.
 *
 * Implements the checks Firebase documents for verifying ID tokens with a
 * third-party JWT library (https://firebase.google.com/docs/auth/admin/verify-id-tokens):
 *   - header.alg is RS256 and header.kid names a current Google signing key
 *   - the RS256 signature verifies against that key
 *   - exp is in the future; iat and auth_time are in the past
 *   - aud equals the Firebase project ID
 *   - iss equals https://securetoken.google.com/<projectId>
 *   - sub is a non-empty string of at most 128 characters (the Firebase UID)
 *
 * Signing keys come from Google's JWKS endpoint for securetoken and are cached
 * according to the response's Cache-Control max-age.
 *
 * Limitation: without the Firebase Admin SDK and a service account, this cannot
 * check whether a token was revoked or the user was disabled. A revoked token
 * stays valid until it expires, which is at most one hour after issue.
 *
 * Uses only WebCrypto, so it runs in Node, Vercel functions, edge runtimes and Bun.
 */

export const GOOGLE_SECURETOKEN_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const KCT_EMAIL_DOMAIN = "@kct.ac.in";
const MAX_TOKEN_LENGTH = 4096;
const DEFAULT_CLOCK_SKEW_SECONDS = 60;
const DEFAULT_JWKS_MAX_AGE_SECONDS = 3600;
const MIN_JWKS_REFRESH_INTERVAL_MS = 60_000;

export type AuthFailureCode =
  | "missing_token"
  | "malformed_token"
  | "unsupported_algorithm"
  | "unknown_key"
  | "invalid_signature"
  | "expired"
  | "not_yet_valid"
  | "invalid_audience"
  | "invalid_issuer"
  | "invalid_subject"
  | "keys_unavailable"
  | "misconfigured"
  | "email_missing"
  | "email_unverified"
  | "email_domain";

/** Authentication or authorization failure. Messages are safe to show to the caller. */
export class AuthError extends Error {
  readonly status: 401 | 403 | 503;
  readonly code: AuthFailureCode;

  constructor(status: 401 | 403 | 503, code: AuthFailureCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

export interface FirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  claims: Record<string, unknown>;
}

export interface PublicJwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
  use?: string;
}

export type KeyProvider = (options?: { forceRefresh?: boolean }) => Promise<PublicJwk[]>;

export interface VerifyOptions {
  projectId: string;
  getKeys: KeyProvider;
  /** Current time in milliseconds. Injectable for tests. */
  now?: () => number;
  clockSkewSeconds?: number;
}

// ─── Encoding helpers ────────────────────────────────────────────────────────

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) {
    throw new AuthError(401, "malformed_token", "Invalid authentication token.");
  }
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJsonSegment(segment: string): Record<string, unknown> {
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(segment));
    const value = JSON.parse(json);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError(401, "malformed_token", "Invalid authentication token.");
  }
}

// ─── Bearer extraction ───────────────────────────────────────────────────────

/** Extracts a bearer token from an Authorization header value. */
export function extractBearerToken(header: string | null | undefined): string {
  if (!header) {
    throw new AuthError(401, "missing_token", "Authentication required.");
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    throw new AuthError(401, "malformed_token", "Invalid authentication token.");
  }
  const token = match[1];
  if (token.length > MAX_TOKEN_LENGTH || token.split(".").length !== 3) {
    throw new AuthError(401, "malformed_token", "Invalid authentication token.");
  }
  return token;
}

// ─── Key retrieval ───────────────────────────────────────────────────────────

/**
 * Creates a cached fetcher for Google's securetoken JWKS.
 * Keys are cached for the response's max-age. A forced refresh, used when a token
 * names an unknown kid, is limited to once per minute.
 */
export function createGoogleJwksProvider(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): KeyProvider {
  let cachedKeys: PublicJwk[] | null = null;
  let expiresAt = 0;
  let lastFetchAt = 0;
  let inflight: Promise<PublicJwk[]> | null = null;

  const load = async (): Promise<PublicJwk[]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetchImpl(GOOGLE_SECURETOKEN_JWKS_URL, { signal: controller.signal });
      if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
      const body = (await res.json()) as { keys?: unknown };
      const keys = Array.isArray(body.keys)
        ? (body.keys.filter(
            (k): k is PublicJwk =>
              !!k &&
              typeof (k as PublicJwk).kid === "string" &&
              (k as PublicJwk).kty === "RSA" &&
              typeof (k as PublicJwk).n === "string" &&
              typeof (k as PublicJwk).e === "string",
          ) as PublicJwk[])
        : [];
      if (keys.length === 0) throw new Error("JWKS returned no RSA keys");

      const cacheControl = res.headers.get("cache-control") ?? "";
      const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
      const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : DEFAULT_JWKS_MAX_AGE_SECONDS;
      cachedKeys = keys;
      lastFetchAt = now();
      expiresAt = lastFetchAt + Math.max(60, Math.min(maxAge, 6 * 3600)) * 1000;
      return keys;
    } finally {
      clearTimeout(timer);
    }
  };

  return async (options) => {
    const current = now();
    const canForce = current - lastFetchAt >= MIN_JWKS_REFRESH_INTERVAL_MS;
    const needsFetch = !cachedKeys || current >= expiresAt || (options?.forceRefresh && canForce);
    if (!needsFetch && cachedKeys) return cachedKeys;

    if (!inflight) {
      inflight = load().finally(() => {
        inflight = null;
      });
    }
    try {
      return await inflight;
    } catch {
      if (cachedKeys && current < expiresAt) return cachedKeys;
      throw new AuthError(
        503,
        "keys_unavailable",
        "Authentication service temporarily unavailable.",
      );
    }
  };
}

// ─── Verification ────────────────────────────────────────────────────────────

const importedKeyCache = new Map<string, CryptoKey>();

async function importRsaKey(jwk: PublicJwk): Promise<CryptoKey> {
  const cacheKey = `${jwk.kid}:${jwk.n.slice(0, 32)}`;
  const cached = importedKeyCache.get(cacheKey);
  if (cached) return cached;
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (importedKeyCache.size > 32) importedKeyCache.clear();
  importedKeyCache.set(cacheKey, key);
  return key;
}

/** Verifies a Firebase ID token and returns the caller's identity. Throws AuthError on any failure. */
export async function verifyFirebaseIdToken(
  token: string,
  options: VerifyOptions,
): Promise<FirebaseIdentity> {
  const projectId = options.projectId?.trim();
  if (!projectId) {
    throw new AuthError(503, "misconfigured", "Authentication is not configured on the server.");
  }
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new AuthError(401, "malformed_token", "Invalid authentication token.");
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new AuthError(401, "malformed_token", "Invalid authentication token.");
  }
  const [headerSeg, payloadSeg, signatureSeg] = parts;
  const header = decodeJsonSegment(headerSeg);
  const payload = decodeJsonSegment(payloadSeg);

  if (header.alg !== "RS256") {
    throw new AuthError(401, "unsupported_algorithm", "Invalid authentication token.");
  }
  if (typeof header.kid !== "string" || header.kid.length === 0) {
    throw new AuthError(401, "unknown_key", "Invalid authentication token.");
  }

  let keys = await options.getKeys();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await options.getKeys({ forceRefresh: true });
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) {
    throw new AuthError(401, "unknown_key", "Invalid authentication token.");
  }

  let signatureValid = false;
  try {
    const key = await importRsaKey(jwk);
    const signature = base64UrlToBytes(signatureSeg);
    const signed = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
    signatureValid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new AuthError(401, "invalid_signature", "Invalid authentication token.");
  }

  const nowSeconds = Math.floor((options.now ?? Date.now)() / 1000);
  const skew = options.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;

  const exp = payload.exp;
  const iat = payload.iat;
  const authTime = payload.auth_time;
  if (typeof exp !== "number" || exp + skew <= nowSeconds) {
    throw new AuthError(401, "expired", "Authentication token has expired. Please sign in again.");
  }
  if (typeof iat !== "number" || iat - skew > nowSeconds) {
    throw new AuthError(401, "not_yet_valid", "Invalid authentication token.");
  }
  if (typeof authTime !== "number" || authTime - skew > nowSeconds) {
    throw new AuthError(401, "not_yet_valid", "Invalid authentication token.");
  }
  if (payload.aud !== projectId) {
    throw new AuthError(401, "invalid_audience", "Invalid authentication token.");
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new AuthError(401, "invalid_issuer", "Invalid authentication token.");
  }
  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length === 0 || sub.length > 128) {
    throw new AuthError(401, "invalid_subject", "Invalid authentication token.");
  }

  return {
    uid: sub,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true,
    claims: payload,
  };
}

/**
 * Requires a verified @kct.ac.in email address.
 * The domain must match exactly; subdomains and look-alike domains are rejected.
 */
export function assertKctFaculty(identity: FirebaseIdentity): void {
  const email = identity.email?.trim().toLowerCase() ?? "";
  if (!email) {
    throw new AuthError(403, "email_missing", "A verified @kct.ac.in account is required.");
  }
  const at = email.lastIndexOf("@");
  if (at <= 0 || email.slice(at) !== KCT_EMAIL_DOMAIN || email.indexOf("@") !== at) {
    throw new AuthError(
      403,
      "email_domain",
      "Only official KCT (@kct.ac.in) accounts can use AI features.",
    );
  }
  if (!identity.emailVerified) {
    throw new AuthError(
      403,
      "email_unverified",
      "Please verify your @kct.ac.in email address to use AI features.",
    );
  }
}

/** Resolves the Firebase project ID from server configuration. The project ID is not a secret. */
export function resolveFirebaseProjectId(env: Record<string, string | undefined>): string {
  return (env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || "").trim();
}
